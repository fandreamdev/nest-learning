import 'reflect-metadata'
import express, { Express, RequestHandler } from 'express'
import { ExceptionFilter, PipeTransform } from '@nestjs/common'
import { Logger } from './log'
import { NestContainer } from './injector/nest-container'
import { Injector } from './injector/injector'
import { DependenciesScanner } from './scanner/dependencies-scanner'
import { RoutesResolver } from './router/routes-resolver'
import { MiddlewareModule } from './middleware/middleware-module'
import { ExceptionsHandler } from './exceptions/exceptions-handler'
import { PipesConsumer } from './pipes/pipes-consumer'

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
  // 扫描阶段收集到的全部模块，供路由解析时遍历各模块的 controller
  private modules: any[] = []

  constructor(protected readonly module: any) {
    // module 已赋值后再创建协作组件：Injector 以根模块作为依赖可见性的默认上下文
    this.injector = new Injector(this.container, this.module)
    this.scanner = new DependenciesScanner(this.container)
    this.routesResolver = new RoutesResolver(
      this.app,
      this.injector,
      this.exceptionsHandler,
      this.pipesConsumer,
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

  /** 注册路由并启动应用前的准备工作 */
  async init() {
    // 先扫描模块树：await 展开 imports 里的 Promise<DynamicModule>(forRootAsync)，登记完整定义图
    this.modules = await this.scanner.scan(this.module)
    // 再把所有 provider 实例化(异步动态模块的 async useFactory 在此 await)
    await this.instantiateProviders()
    // 把以 APP_FILTER 方式登记的 provider 实例化并注册为全局过滤器(走 DI，可注入其它 provider)
    await this.registerAppFilters()
    // 把以 APP_PIPE 方式登记的 provider 实例化并注册为全局管道(走 DI，可注入其它 provider)
    await this.registerAppPipes()
    // 中间件必须在路由之前挂载：找出实现 NestModule.configure 的模块并应用其中间件
    await this.middlewareModule.register(this.modules, (moduleRef) =>
      this.scanner.getModuleClass(moduleRef),
    )
    // 再注册路由(controller 实例化也依赖上面的 provider 实例)
    await this.routesResolver.resolve(this.modules, (module) => this.scanner.getControllers(module))
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

  /** 启动 HTTP 服务 */
  async listen(port: number) {
    await this.init()
    this.app.listen(port, () => {
      Logger.log(`Application is running on http://localhost:${port}`, 'NestApplication')
    })
  }
}
