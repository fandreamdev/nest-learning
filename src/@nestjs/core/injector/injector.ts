import 'reflect-metadata'
import {
  INJECT_TOKEN,
  PARAMTYPES_METADATA,
  OPTIONAL_DEPS_METADATA,
  PROPERTY_DEPS_METADATA,
  resolveForwardRef,
} from '@nestjs/common'
import { NestContainer } from './nest-container'

/**
 * Injector —— 依赖解析与实例化（对应 Nest 源码中的 Injector）。
 *
 * 它是两阶段模型的「第二阶段」执行者：在容器(NestContainer)已经登记好完整
 * 定义图之后，按 token 递归地把实例创建出来，并回填容器做单例缓存。
 * 本类不存储数据(除「正在构造中」的临时集合外)，状态都读写自注入的 NestContainer。
 *
 * 支持的高级 provider 特性：
 *  - forwardRef：token 可为 forwardRef(() => Xxx)，解析时延迟解包，绕过定义顺序问题；
 *  - @Optional()：构造参数解析不到时注入 undefined 而非报错；
 *  - 属性注入：@Inject 写在属性上，new 之后回填该属性；
 *  - 循环依赖：A、B 互相注入时，对「正在构造中」的依赖返回惰性代理，闭合循环。
 */
export class Injector {
  // 正在构造中的 token 集合：用于检测循环依赖。A 构造时依赖 B、B 又依赖 A，
  // 第二次进入 A 时 A 仍「在建」，此时返回惰性代理而非继续递归，避免死循环。
  private readonly inConstruction = new Set<any>()

  /**
   * @param container  DI 容器
   * @param rootModule 根模块，作为依赖解析时可见性校验的默认上下文
   */
  constructor(
    private readonly container: NestContainer,
    private readonly rootModule: any,
  ) {}

  /**
   * 按 token 取实例，没有就根据定义创建并缓存(单例)。
   * 创建过程中遇到的依赖会递归触发本方法，因此 provider 的声明顺序无关紧要。
   * 命名用 Instance 而非 Provider：返回/缓存的是实例，provider 只是产出它的定义。
   *
   * 本方法是异步的：useFactory 可能是 async 函数(异步动态模块 forRootAsync 的底层)，
   * 需要 await 其结果；递归解析依赖时也逐个 await。
   */
  async getOrCreateInstance(token: any): Promise<any> {
    // token 可能是 forwardRef 包装(循环依赖场景)，先解包成真正的 token
    token = resolveForwardRef(token)

    // 已实例化，直接返回缓存，保证单例
    if (this.container.hasInstance(token)) {
      return this.container.getInstance(token)
    }

    // 循环依赖检测：该 token 正在构造途中又被依赖到 —— 返回惰性代理闭合循环。
    // 代理在「被实际访问成员」时才去容器取已建好的实例，故只要循环引用用在方法里
    // (而非构造函数体内)，等两者构造都完成后，代理即透明转发到真身。
    if (this.inConstruction.has(token)) {
      return this.createLazyProxy(token)
    }

    // 查「完整依赖图」：定义都不存在，说明这个依赖没被注册，直接报错
    const def: any = this.container.getProviderDef(token)
    if (!def) {
      throw new Error(`Nest can't resolve dependency: ${String(token)} 未注册`)
    }

    // 标记「在建」，实例化(依赖按该 token 的归属模块解析，回退根模块)，完成后撤销标记并回填缓存
    this.inConstruction.add(token)
    let instance: any
    try {
      const ownerModule = this.container.getOwnerModule(token) ?? this.rootModule
      instance = await this.instantiateFromDef(def, ownerModule)
    } finally {
      this.inConstruction.delete(token)
    }
    // 回填实例表，下次同 token 直接命中缓存(单例的关键)
    this.container.setInstance(token, instance)
    return instance
  }

  /**
   * 为「正在构造中」的 token 生成惰性代理(循环依赖专用)。
   * 代理拦截属性访问，转发到容器里那时已建好的真实实例。只要循环引用在方法调用时
   * 才被用到(对齐 Nest 的约束：不能在构造函数体内直接使用循环依赖)，代理即可正常工作。
   */
  private createLazyProxy(token: any): any {
    const container = this.container
    return new Proxy(
      {},
      {
        get(_target, prop) {
          // 关键：getOrCreateInstance 是 async，返回本代理时运行时会做 Promise.resolve(proxy)，
          // 进而探测 proxy.then 判断是否 thenable。此刻真身还在构造中，必须报告「我不是 thenable」
          // (then 返回 undefined)，否则会把代理误当 Promise 而触发对真身的过早访问。
          if (prop === 'then') return undefined
          // 符号属性(如 inspect/toPrimitive)同样可能在真身就绪前被探测，静默放过避免误抛
          if (typeof prop === 'symbol') return undefined

          const real = container.getInstance(token)
          // 取到真身后透传成员；若仍未就绪，说明在「构造期」就用了循环依赖(违反约束)，给出可读报错
          if (!real) {
            throw new Error(
              `循环依赖代理：${String(token)} 尚未实例化完成，不能在构造期使用循环依赖`,
            )
          }
          const value = real[prop]
          return typeof value === 'function' ? value.bind(real) : value
        },
      },
    )
  }

  /**
   * 按「provider 定义 + 所属模块」直接实例化一个 provider，不经过定义表、不按 token 缓存。
   * 用于 APP_FILTER 这类「同一 token 可登记多个、且不参与普通依赖图」的场景：
   * 依赖按传入 module 校验可见性。
   * @param provider provider 定义({ provide, useXxx } 或裸类)
   * @param module   该 provider 所属模块，用于其构造依赖的可见性校验
   */
  async instantiateProvider(provider: any, module: any): Promise<any> {
    return this.instantiateFromDef(provider, module)
  }

  /**
   * 按 provider 定义产出实例的共同规则（getOrCreateInstance 与 instantiateProvider 共用），
   * 仅负责「定义 -> 实例」，不涉及缓存。支持四种写法：
   *  - useValue：现成的值，直接用；
   *  - useClass：用指定类实例化，先递归解析其构造依赖；
   *  - useFactory：调工厂，inject 里的 token 先递归解析成参数(工厂可能 async，统一 await)；
   *  - 裸类：定义本身就是类，递归解析其构造依赖后实例化。
   * @param def    provider 定义({ useXxx } 或裸类)
   * @param module 解析构造依赖时的可见性上下文模块
   */
  private async instantiateFromDef(def: any, module: any): Promise<any> {
    if (def.useValue !== undefined) {
      // useValue：现成的值，直接用
      return def.useValue
    }
    if (def.useClass) {
      // useClass：用指定的类实例化，先递归解析它的构造依赖
      const dependencies = await this.resolveDependencies(def.useClass, module)
      return this.instantiateClass(def.useClass, dependencies, module)
    }
    if (def.useFactory) {
      // useFactory：调用工厂函数，inject 里声明的 token 先递归解析成参数。
      // 串行解析(而非 Promise.all)：避免多个依赖并发触发同一未缓存 provider 的重复实例化，
      // 从而保证单例 + async useFactory 只执行一次。工厂可能是 async，统一 await。
      const params: any[] = []
      for (const rawDep of def.inject ?? []) {
        // inject 项可能是 forwardRef 包装，先解包成真正的 token
        const dep = resolveForwardRef(rawDep)
        // 与构造注入/属性注入一致：inject 依赖也受模块可见性约束，不可见即报错
        if (!this.container.isVisible(dep, module)) {
          throw new Error(
            `Nest can't resolve dependencies of the useFactory provider: token ${String(
              dep,
            )} 在该模块不可见`,
          )
        }
        params.push(await this.getOrCreateInstance(dep))
      }
      return await def.useFactory(...params)
    }
    // 定义本身就是一个类(没有 provide 包装)
    const dependencies = await this.resolveDependencies(def, module)
    return this.instantiateClass(def, dependencies, module)
  }

  /**
   * new 一个类并完成「属性注入」：构造注入已由 dependencies 解决，这里在 new 之后
   * 处理 @Inject 写在属性上的依赖——逐个解析 token 并赋到实例对应属性上。
   */
  private async instantiateClass(Cls: any, dependencies: any[], module: any): Promise<any> {
    const instance = new Cls(...dependencies)
    await this.injectProperties(instance, Cls, module)
    return instance
  }

  /**
   * 属性注入：读取类上 PROPERTY_DEPS_METADATA 记录的 { key, token } 列表，
   * 逐个解析(token 可为 forwardRef，可见性按 module 校验)并赋值到实例属性。
   */
  private async injectProperties(instance: any, Cls: any, module: any): Promise<void> {
    const properties: { key: string | symbol; token: any }[] =
      Reflect.getMetadata(PROPERTY_DEPS_METADATA, Cls) ?? []
    for (const { key, token } of properties) {
      const resolved = resolveForwardRef(token)
      if (!this.container.isVisible(resolved, module)) {
        throw new Error(
          `Nest can't resolve property ${String(key)} of ${Cls.name}: token ${String(
            resolved,
          )} 在该模块不可见`,
        )
      }
      instance[key] = await this.getOrCreateInstance(resolved)
    }
  }

  /**
   * 解析一个类构造函数所需的全部依赖，返回按参数顺序排好的实例数组。
   * @param Component 待解析的类（controller 或 provider 类）
   * @param module    该组件归属的模块，用于做依赖可见性校验
   */
  async resolveDependencies(Component: any, module: any = this.rootModule): Promise<any[]> {
    // design:paramtypes 是 emitDecoratorMetadata 自动记录的构造参数类型
    const paramtypes: any[] = Reflect.getMetadata(PARAMTYPES_METADATA, Component) ?? []
    // INJECT_TOKEN 是 @Inject('xx') 显式指定的 token，按参数下标存放
    const tokens = Reflect.getMetadata(INJECT_TOKEN, Component) ?? []
    // OPTIONAL_DEPS_METADATA 是 @Optional() 标记的可选参数下标
    const optional = Reflect.getMetadata(OPTIONAL_DEPS_METADATA, Component) ?? []
    // 串行解析依赖：避免并发触发同一未缓存 provider 的重复实例化，保证单例
    const dependencies: any[] = []
    for (let index = 0; index < paramtypes.length; index++) {
      // 有 @Inject 用其 token，否则回退到 TS 推断的参数类型；token 可能是 forwardRef，先解包
      const token = resolveForwardRef(tokens[index] ?? paramtypes[index])
      // 可见性校验：该 token 必须在「本模块集合」或「全局集合」中，否则不允许注入
      if (!this.container.isVisible(token, module)) {
        // @Optional() 标记的参数：解析不到就注入 undefined，不报错
        if (optional[index]) {
          dependencies.push(undefined)
          continue
        }
        throw new Error(
          `Nest can't resolve dependencies of ${Component.name}: token ${String(token)} 在该模块不可见`,
        )
      }
      // 没建就递归建，已建就拿缓存
      dependencies.push(await this.getOrCreateInstance(token))
    }
    return dependencies
  }
}
