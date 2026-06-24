import { APP_FILTER, APP_PIPE, APP_GUARD, ProviderType } from '@nestjs/common'

/**
 * NestContainer —— DI 容器（对应 Nest 源码中的 NestContainer）。
 *
 * 它是整个依赖注入体系的「数据中心」，只负责存取，不负责实例化逻辑
 * （实例化交给 Injector）。内部维护三层数据：
 *  - 定义表 providerDefMap：token -> provider 的定义，是解析依赖时可查询的「完整依赖图」
 *  - 实例表 providerInstanceMap：token -> 已创建的实例，全应用唯一一份，保证单例 + 跨模块共享
 *  - 可见性：moduleVisibility（按模块隔离） + globalProviders（@Global 全局例外）
 *
 * 「实例唯一」与「谁能看见」是两个正交维度：前者由实例表保证，后者由可见性表控制。
 */
export class NestContainer {
  // 定义表：token -> provider 的「定义」(类本身 / useClass / useValue / useFactory)。
  // 在任何实例化(new)发生之前就被填满，是解析依赖时可查询的「完整依赖图」
  private readonly providerDefMap = new Map<any, ProviderType>()
  // 实例表：token -> 已实例化的 provider。整个应用唯一一份，保证单例 + 跨模块共享
  private readonly providerInstanceMap = new Map<any, any>()
  // 可见性表：module -> 该模块能解析到的 token 集合。负责按模块做依赖可见性隔离。
  // 注意存的是 token(可见性)，不是 provider 实例，故命名为 visibility 而非 providers。
  private readonly moduleVisibility = new Map<any, Set<any>>()
  // 全局可见集合：被 @Global() 标记的模块所导出的 token。
  // 这些 token 对「所有」模块可见，无需各模块单独 imports —— 是模块隔离的全局例外。
  private readonly globalProviders = new Set<any>()
  // APP_FILTER 收集表：以 provider 方式注册的全局过滤器。
  // 不放进 providerDefMap(那里按 token 唯一)，因为同一个 APP_FILTER token 可被多个模块登记多次；
  // 这里按登记顺序保留每一条，并记住其所属 module(实例化时按该模块解析依赖可见性)。
  private readonly appFilters: { provider: any; module: any }[] = []
  // APP_PIPE 收集表：以 provider 方式注册的全局管道(与 appFilters 同构，可重复登记)。
  private readonly appPipes: { provider: any; module: any }[] = []
  // APP_GUARD 收集表：以 provider 方式注册的全局守卫(与 appFilters 同构，可重复登记)。
  private readonly appGuards: { provider: any; module: any }[] = []

  /**
   * 登记一个 provider 的「定义」与「可见性」，但不实例化（两阶段的第一阶段）。
   * 命名用 register 而非 add：这里只是登记定义 + 记录可见性，真正的 new 在第二阶段。
   * @param provider provider 定义，可能是类本身，也可能是 { provide, useXxx } 对象
   * @param module   该 provider 归属/可见的模块
   */
  registerProvider(provider: any, module: any) {
    // provider 可能是「类本身」，也可能是 { provide, useXxx } 对象，统一取出它的 token
    const provide = provider.provide ?? provider

    // APP_FILTER：特殊 token，单独收集成列表(可重复登记)，不进入下面的可见性/定义表
    if (provide === APP_FILTER) {
      this.appFilters.push({ provider, module })
      return
    }

    // APP_PIPE：与 APP_FILTER 同理，单独收集成列表(可重复登记)
    if (provide === APP_PIPE) {
      this.appPipes.push({ provider, module })
      return
    }

    // APP_GUARD：与 APP_FILTER 同理，单独收集成列表(可重复登记)
    if (provide === APP_GUARD) {
      this.appGuards.push({ provider, module })
      return
    }

    // 1) 记录可见性：该 token 在这个 module 里可被解析
    const visibleTokens = this.moduleVisibility.get(module) ?? new Set()
    visibleTokens.add(provide)
    this.moduleVisibility.set(module, visibleTokens)

    // 2) 登记定义(若尚未登记)。注意这里只存定义，真正的 new 推迟到第二阶段
    if (!this.providerDefMap.has(provide)) {
      this.providerDefMap.set(provide, provider)
    }
  }

  /** 取所有以 APP_FILTER 方式登记的全局过滤器 provider(含其所属模块) */
  getAppFilters(): { provider: any; module: any }[] {
    return this.appFilters
  }

  /** 取所有以 APP_PIPE 方式登记的全局管道 provider(含其所属模块) */
  getAppPipes(): { provider: any; module: any }[] {
    return this.appPipes
  }

  /** 取所有以 APP_GUARD 方式登记的全局守卫 provider(含其所属模块) */
  getAppGuards(): { provider: any; module: any }[] {
    return this.appGuards
  }

  /** 把一个 token 标记为全局可见（供扫描 @Global 模块时调用）。参数是 token 而非 provider 实例。 */
  registerGlobalToken(token: any) {
    this.globalProviders.add(token)
  }

  /** 取某个 token 的定义；不存在返回 undefined */
  getProviderDef(token: any): any {
    return this.providerDefMap.get(token)
  }

  /** 该 token 是否已实例化 */
  hasInstance(token: any): boolean {
    return this.providerInstanceMap.has(token)
  }

  /** 取某个 token 已缓存的实例 */
  getInstance(token: any): any {
    return this.providerInstanceMap.get(token)
  }

  /** 回填某个 token 的实例（单例缓存的关键） */
  setInstance(token: any, instance: any) {
    this.providerInstanceMap.set(token, instance)
  }

  /** 遍历所有已登记定义的 token —— 第二阶段统一实例化的入口 */
  getProviderTokens(): IterableIterator<any> {
    return this.providerDefMap.keys()
  }

  /**
   * 判断某个 token 在指定模块里是否可解析：
   * 本模块声明/导入的可见，或 @Global() 模块导出的全局可见。
   */
  isVisible(token: any, module: any): boolean {
    if (this.globalProviders.has(token)) {
      return true
    }
    return this.moduleVisibility.get(module)?.has(token) ?? false
  }
}
