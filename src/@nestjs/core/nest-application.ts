import 'reflect-metadata'
import { Server } from 'http'
import express, { Express, RequestHandler } from 'express'
import { ExceptionFilter, PipeTransform, CanActivate, Reflector, NestInterceptor } from '@nestjs/common'
import { Logger } from './log'
import { NestContainer } from './injector/nest-container'
import { Injector } from './injector/injector'
import { DependenciesScanner } from './scanner/dependencies-scanner'
import { RoutesResolver } from './router/routes-resolver'
import { MiddlewareModule } from './middleware/middleware-module'
import { ExceptionsHandler } from './exceptions/exceptions-handler'
import { PipesConsumer } from './pipes/pipes-consumer'
import { GuardsConsumer } from './guards/guards-consumer'
import { InterceptorsConsumer } from './interceptors/interceptors-consumer'

/**
 * NestApplication —— 应用编排者（对应 Nest 源码中的 NestApplication）。
 *
 * 自身不再承担 DI / 扫描 / 路由的具体逻辑，而是组合以下协作组件，
 * 按 Nest 的启动顺序把它们串起来：
 *  1. DependenciesScanner.scan  —— 第一阶段：扫描模块，登记所有 provider 定义
 *  2. Injector.getOrCreateInstance —— 第二阶段：统一实例化所有 provider
 *  3. RoutesResolver.resolve     —— 注册 controller 路由
 *
 * 同时负责持有 express 实例与应用生命周期(use / listen)。
 */
export class NestApplication {
  private readonly app: Express = express()
  private readonly container = new NestContainer()
  private readonly injector: Injector
  private readonly scanner: DependenciesScanner
  private readonly routesResolver: RoutesResolver
  private readonly middlewareModule: MiddlewareModule
  // 全局异常处理：持有全局过滤器，请求出错时统一处理
  private readonly exceptionsHandler = new ExceptionsHandler()
  // 全局管道处理：持有全局管道，请求参数解析时统一应用
  private readonly pipesConsumer = new PipesConsumer()
  // 全局守卫处理：持有全局守卫，请求进入处理方法前统一判定(在管道之前)
  private readonly guardsConsumer = new GuardsConsumer()
  // 全局拦截器处理：持有全局拦截器，包裹处理方法实现前置/后置逻辑
  private readonly interceptorsConsumer = new InterceptorsConsumer()
  // 扫描阶段收集到的全部模块，供路由解析时遍历各模块的 controller
  private modules: any[] = []
  // 正在监听的 HTTP server 引用，close() 时据此停止接收新连接
  private httpServer?: Server
  // 是否已启用关闭钩子(进程信号监听)，避免重复注册；同时持有已注册的信号处理器以便清理
  private shutdownHooksEnabled = false
  // 防止 close() 被重复执行(信号 + 手动调用可能并发)
  private isClosing = false

  constructor(protected readonly module: any) {
    // module 已赋值后再创建协作组件：Injector 以根模块作为依赖可见性的默认上下文
    this.injector = new Injector(this.container, this.module)
    this.scanner = new DependenciesScanner(this.container)
    this.routesResolver = new RoutesResolver(
      this.app,
      this.injector,
      this.exceptionsHandler,
      this.pipesConsumer,
      this.guardsConsumer,
      this.interceptorsConsumer,
    )
    this.middlewareModule = new MiddlewareModule(this.app, this.injector)

    this.app.use(express.json()) // 用来将json格式的请求体放到req的body上
    this.app.use(express.urlencoded({ extended: true })) // 用来将form表单格式的请求体放到req的body上
    // 构造函数不再做扫描：imports 可能含 Promise<DynamicModule>(forRootAsync)，
    // 扫描本身是异步的，推迟到 async init() 里 await。
  }

  /** 两阶段初始化的第二阶段：实例化所有 provider(支持 async useFactory) */
  private async instantiateProviders() {
    // 定义图已完整，遍历逐个实例化(顺序无关，缺失依赖会按需递归创建)
    for (const token of this.container.getProviderTokens()) {
      await this.injector.getOrCreateInstance(token)
    }
  }

  /**
   * 把以 { provide: APP_FILTER, useClass/useFactory/useValue } 登记的 provider 实例化，
   * 注册为全局过滤器。走 DI 实例化(按各自所属模块解析依赖)，因此过滤器可注入其它 provider。
   * 与 useGlobalFilters 注册的过滤器共享同一套优先级(后注册优先)。
   */
  private async registerAppFilters() {
    const appFilters = this.container.getAppFilters()
    for (const { provider, module } of appFilters) {
      const filter = await this.injector.instantiateProvider(provider, module)
      this.exceptionsHandler.addFilters([filter])
    }
  }

  /**
   * 把以 { provide: APP_PIPE, useClass/useFactory/useValue } 登记的 provider 实例化，
   * 注册为全局管道(与 registerAppFilters 同构)。走 DI 实例化，因此管道可注入其它 provider。
   * 与 useGlobalPipes 注册的管道共享同一份全局管道列表。
   */
  private async registerAppPipes() {
    const appPipes = this.container.getAppPipes()
    for (const { provider, module } of appPipes) {
      const pipe = await this.injector.instantiateProvider(provider, module)
      this.pipesConsumer.addGlobalPipes([pipe])
    }
  }

  /**
   * 把以 { provide: APP_GUARD, useClass/useFactory/useValue } 登记的 provider 实例化，
   * 注册为全局守卫(与 registerAppFilters 同构)。走 DI 实例化，因此守卫可注入其它 provider。
   * 与 useGlobalGuards 注册的守卫共享同一份全局守卫列表。
   */
  private async registerAppGuards() {
    const appGuards = this.container.getAppGuards()
    for (const { provider, module } of appGuards) {
      const guard = await this.injector.instantiateProvider(provider, module)
      this.guardsConsumer.addGlobalGuards([guard])
    }
  }

  /**
   * 把以 { provide: APP_INTERCEPTOR, useClass/useFactory/useValue } 登记的 provider 实例化，
   * 注册为全局拦截器(与 registerAppFilters 同构)。走 DI 实例化，因此拦截器可注入其它 provider。
   * 与 useGlobalInterceptors 注册的拦截器共享同一份全局拦截器列表。
   */
  private async registerAppInterceptors() {
    const appInterceptors = this.container.getAppInterceptors()
    for (const { provider, module } of appInterceptors) {
      const interceptor = await this.injector.instantiateProvider(provider, module)
      this.interceptorsConsumer.addGlobalInterceptors([interceptor])
    }
  }

  /**
   * 把 Reflector 登记为「全局可见」的内置 provider(对齐 Nest：Reflector 由核心模块提供，处处可注入)。
   * 这样守卫/拦截器在构造里注入 Reflector 即可读取 @SetMetadata 写下的元数据。
   */
  private registerReflector() {
    this.container.registerProvider(Reflector, this.module)
    this.container.registerGlobalToken(Reflector)
  }

  /**
   * 调用所有已实例化 provider 上某个生命周期钩子(若实现了的话)。
   * @param hook    钩子方法名(如 'onModuleInit')
   * @param reverse 是否逆序调用(关闭阶段用：后建先拆)
   * @param arg     传给钩子的参数(关闭信号，仅 shutdown 类钩子用)
   *
   * 鸭子类型判断：实例上有同名函数就认为实现了该钩子。逐个 await，
   * 与 Nest 一致——钩子可为 async，框架会等它完成再继续。
   */
  private async callHook(hook: string, reverse = false, arg?: any) {
    const instances = this.container.getAllInstances()
    const ordered = reverse ? [...instances].reverse() : instances
    for (const instance of ordered) {
      if (instance && typeof instance[hook] === 'function') {
        await instance[hook](arg)
      }
    }
  }

  /** 注册路由并启动应用前的准备工作 */
  async init() {
    // 先扫描模块树：await 展开 imports 里的 Promise<DynamicModule>(forRootAsync)，登记完整定义图
    this.modules = await this.scanner.scan(this.module)
    // 把内置的 Reflector 登记为全局可见 provider(供守卫/拦截器注入)，须在实例化阶段之前
    this.registerReflector()
    // 再把所有 provider 实例化(异步动态模块的 async useFactory 在此 await)
    await this.instantiateProviders()
    // 把以 APP_FILTER 方式登记的 provider 实例化并注册为全局过滤器(走 DI，可注入其它 provider)
    await this.registerAppFilters()
    // 把以 APP_PIPE 方式登记的 provider 实例化并注册为全局管道(走 DI，可注入其它 provider)
    await this.registerAppPipes()
    // 把以 APP_GUARD 方式登记的 provider 实例化并注册为全局守卫(走 DI，可注入其它 provider)
    await this.registerAppGuards()
    // 把以 APP_INTERCEPTOR 方式登记的 provider 实例化并注册为全局拦截器(走 DI，可注入其它 provider)
    await this.registerAppInterceptors()
    // 中间件必须在路由之前挂载：找出实现 NestModule.configure 的模块并应用其中间件
    await this.middlewareModule.register(this.modules, (moduleRef) =>
      this.scanner.getModuleClass(moduleRef),
    )
    // 再注册路由(controller 实例化也依赖上面的 provider 实例)
    await this.routesResolver.resolve(this.modules, (module) => this.scanner.getControllers(module))

    // 所有 provider 就绪、路由注册完毕后，触发启动生命周期钩子(正序)：
    //  onModuleInit(模块依赖就绪) -> onApplicationBootstrap(全局就绪、即将监听)
    await this.callHook('onModuleInit')
    await this.callHook('onApplicationBootstrap')

    Logger.log('Nest application successfully started', 'NestApplication')
  }

  /** 挂载 express 中间件(如 session) */
  use(middleware: RequestHandler) {
    this.app.use(middleware)
  }

  /**
   * 注册全局异常过滤器(对应 Nest 的 app.useGlobalFilters)。
   * 请求处理抛出的异常会按「后注册优先」交给第一个 @Catch 匹配的过滤器。
   */
  useGlobalFilters(...filters: ExceptionFilter[]) {
    this.exceptionsHandler.addFilters(filters)
    return this
  }

  /**
   * 注册全局管道(对应 Nest 的 app.useGlobalPipes)。
   * 对所有路由的所有参数生效，按注册顺序排在控制器级/方法级/参数级管道之前。
   */
  useGlobalPipes(...pipes: PipeTransform[]) {
    this.pipesConsumer.addGlobalPipes(pipes)
    return this
  }

  /**
   * 注册全局守卫(对应 Nest 的 app.useGlobalGuards)。
   * 对所有路由生效，按注册顺序排在控制器级/方法级守卫之前；任一守卫拒绝即抛 403。
   */
  useGlobalGuards(...guards: CanActivate[]) {
    this.guardsConsumer.addGlobalGuards(guards)
    return this
  }

  /**
   * 注册全局拦截器(对应 Nest 的 app.useGlobalInterceptors)。
   * 对所有路由生效，按注册顺序位于控制器级/方法级拦截器的更外层。
   */
  useGlobalInterceptors(...interceptors: NestInterceptor[]) {
    this.interceptorsConsumer.addGlobalInterceptors(interceptors)
    return this
  }

  /** 启动 HTTP 服务 */
  async listen(port: number) {
    await this.init()
    this.httpServer = this.app.listen(port, () => {
      Logger.log(`Application is running on http://localhost:${port}`, 'NestApplication')
    })
  }

  /**
   * 启用关闭钩子(对应 Nest 的 app.enableShutdownHooks)。
   * 监听进程终止信号(默认 SIGINT/SIGTERM)，收到后触发优雅关闭：跑完关闭类钩子再退出。
   * @param signals 要监听的信号，默认 ['SIGINT', 'SIGTERM']
   */
  enableShutdownHooks(signals: string[] = ['SIGINT', 'SIGTERM']) {
    if (this.shutdownHooksEnabled) return this
    this.shutdownHooksEnabled = true
    for (const signal of signals) {
      process.once(signal as NodeJS.Signals, async () => {
        Logger.log(`Received ${signal}, shutting down...`, 'NestApplication')
        await this.close(signal)
        process.exit(0)
      })
    }
    return this
  }

  /**
   * 优雅关闭应用(对应 Nest 的 app.close)。
   * 先停止 HTTP server 接收新请求，再按「初始化逆序」触发关闭类生命周期钩子：
   *  onModuleDestroy -> beforeApplicationShutdown -> onApplicationShutdown
   * @param signal 触发关闭的信号(由 enableShutdownHooks 传入)，手动调用时为 undefined
   */
  async close(signal?: string) {
    if (this.isClosing) return
    this.isClosing = true

    // 停止接收新连接(已建立的连接由 express/node 自行收尾)
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
    }

    // 关闭钩子按实例化的逆序调用(后建先拆)；shutdown 类钩子还会收到触发信号
    await this.callHook('onModuleDestroy', true)
    await this.callHook('beforeApplicationShutdown', true, signal)
    await this.callHook('onApplicationShutdown', true, signal)

    Logger.log('Nest application successfully closed', 'NestApplication')
  }
}
