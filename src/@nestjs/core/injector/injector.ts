import 'reflect-metadata'
import { INJECT_TOKEN, PARAMTYPES_METADATA } from '@nestjs/common'
import { NestContainer } from './nest-container'

/**
 * Injector —— 依赖解析与实例化（对应 Nest 源码中的 Injector）。
 *
 * 它是两阶段模型的「第二阶段」执行者：在容器(NestContainer)已经登记好完整
 * 定义图之后，按 token 递归地把实例创建出来，并回填容器做单例缓存。
 * 本类不存储数据，所有状态都读写自注入的 NestContainer。
 */
export class Injector {
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
    // 已实例化，直接返回缓存，保证单例
    if (this.container.hasInstance(token)) {
      return this.container.getInstance(token)
    }

    // 查「完整依赖图」：定义都不存在，说明这个依赖没被注册，直接报错
    const def: any = this.container.getProviderDef(token)
    if (!def) {
      throw new Error(`Nest can't resolve dependency: ${String(token)} 未注册`)
    }

    // 按定义实例化(依赖按根模块上下文解析)，再回填实例表做单例缓存
    const instance = await this.instantiateFromDef(def, this.rootModule)
    // 回填实例表，下次同 token 直接命中缓存(单例的关键)
    this.container.setInstance(token, instance)
    return instance
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
      return new def.useClass(...dependencies)
    }
    if (def.useFactory) {
      // useFactory：调用工厂函数，inject 里声明的 token 先递归解析成参数。
      // 串行解析(而非 Promise.all)：避免多个依赖并发触发同一未缓存 provider 的重复实例化，
      // 从而保证单例 + async useFactory 只执行一次。工厂可能是 async，统一 await。
      const params: any[] = []
      for (const dep of def.inject ?? []) {
        params.push(await this.getOrCreateInstance(dep))
      }
      return await def.useFactory(...params)
    }
    // 定义本身就是一个类(没有 provide 包装)
    const dependencies = await this.resolveDependencies(def, module)
    return new def(...dependencies)
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
    // 串行解析依赖：避免并发触发同一未缓存 provider 的重复实例化，保证单例
    const dependencies: any[] = []
    for (let index = 0; index < paramtypes.length; index++) {
      // 有 @Inject 用其 token，否则回退到 TS 推断的参数类型
      const token = tokens[index] ?? paramtypes[index]
      // 可见性校验：该 token 必须在「本模块集合」或「全局集合」中，否则不允许注入
      if (!this.container.isVisible(token, module)) {
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
