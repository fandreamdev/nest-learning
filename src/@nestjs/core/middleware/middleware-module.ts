import 'reflect-metadata'
import path from 'path'
import { Express, NextFunction, Request, Response } from 'express'
import {
  MiddlewareConfigProxy,
  MiddlewareConsumer,
  MiddlewareType,
  NestMiddleware,
  RequestMethod,
  RouteInfo,
  RouteSpec,
} from '@nestjs/common'
import { Logger } from '../log'
import { Injector } from '../injector/injector'

/** 一条 apply(...).forRoutes(...) 收集到的配置 */
interface MiddlewareConfig {
  middlewares: MiddlewareType[]
  forRoutes: RouteSpec[]
  exclude: RouteSpec[]
}

/**
 * MiddlewareConsumerImpl —— consumer.apply().forRoutes() 的链式收集器。
 *
 * 它本身不挂载任何中间件，只负责把模块在 configure() 里声明的每一条
 * apply(...).forRoutes(...).exclude(...) 收集成 MiddlewareConfig 列表，
 * 真正挂到 express 的动作交给 MiddlewareModule。
 */
class MiddlewareConsumerImpl implements MiddlewareConsumer {
  private readonly configs: MiddlewareConfig[] = []

  apply(...middlewares: MiddlewareType[]): MiddlewareConfigProxy {
    // 先登记这批中间件，forRoutes/exclude 再回填同一条 config
    const config: MiddlewareConfig = { middlewares, forRoutes: [], exclude: [] }
    this.configs.push(config)

    const proxy: MiddlewareConfigProxy = {
      forRoutes: (...routes: RouteSpec[]) => {
        config.forRoutes = routes
        // forRoutes 后回到 consumer，可继续链式 .apply(...)
        return this
      },
      exclude: (...routes: RouteSpec[]) => {
        config.exclude = routes
        return proxy
      },
    }
    return proxy
  }

  getConfigs(): MiddlewareConfig[] {
    return this.configs
  }
}

/**
 * MiddlewareModule —— 中间件装配器（对应 Nest 源码中的 MiddlewareModule）。
 *
 * 在路由注册「之前」运行：找出实现了 NestModule.configure 的模块，实例化模块
 * (支持构造注入)并调用其 configure(consumer)，再把收集到的中间件按 forRoutes/
 * exclude 解析成 {路径, 方法} 挂到 express 上。中间件先于路由注册，故先执行。
 */
export class MiddlewareModule {
  constructor(
    private readonly app: Express,
    private readonly injector: Injector,
  ) {}

  /**
   * 遍历所有模块，应用其中间件配置。
   * @param modules        扫描得到的全部模块引用
   * @param getModuleClass 由 ref 取模块类(静态=类本身，动态=ref.module)
   */
  async register(modules: any[], getModuleClass: (moduleRef: any) => any) {
    for (const moduleRef of modules) {
      const ModuleClass = getModuleClass(moduleRef)
      if (!ModuleClass || typeof ModuleClass.prototype?.configure !== 'function') continue

      // 模块本身可注入(构造依赖按本模块可见性解析)，再调用 configure 收集中间件
      const deps = await this.injector.resolveDependencies(ModuleClass, moduleRef)
      const moduleInstance = new ModuleClass(...deps)
      const consumer = new MiddlewareConsumerImpl()
      moduleInstance.configure(consumer)

      for (const config of consumer.getConfigs()) {
        await this.applyConfig(config, moduleRef)
      }
    }
  }

  /** 把一条 apply(...).forRoutes(...).exclude(...) 配置挂到 express */
  private async applyConfig(config: MiddlewareConfig, moduleRef: any) {
    const excludes = config.exclude.map((spec) => this.normalize(spec)).flat()

    for (const middleware of config.middlewares) {
      // 解析成统一的 express handler：类中间件实例化后取 .use；函数中间件直接用
      const handler = await this.toHandler(middleware, moduleRef)
      const label = this.middlewareName(middleware)

      for (const route of config.forRoutes) {
        for (const { path: routePath, method } of this.normalize(route)) {
          // 统一用 app.use(path) 挂载：express 的 use 是「前缀匹配」，路径及其子路径都会命中，
          // 与 Nest forRoutes 的语义一致。HTTP 方法限制 + exclude 则在 handler 包装里判断。
          const guarded = this.guard(handler, method, excludes)
          this.app.use(routePath, guarded)
          Logger.log(`${label} -> {${routePath}, ${method.toUpperCase()}}`, 'MiddlewareModule')
        }
      }
    }
  }

  /** 把一个 RouteSpec 归一化为 RouteInfo[]（统一带方法和路径） */
  private normalize(spec: RouteSpec): RouteInfo[] {
    // 字符串路径：不限方法。'*' / '' 视为根，匹配全部路由
    if (typeof spec === 'string') {
      return [{ path: this.cleanPath(spec), method: RequestMethod.ALL }]
    }
    // controller 类：取 @Controller 前缀，等价于该 controller 的全部路由(不限方法)
    if (typeof spec === 'function') {
      const prefix = Reflect.getMetadata('prefix', spec) ?? ''
      return [{ path: this.cleanPath(prefix), method: RequestMethod.ALL }]
    }
    // RouteInfo：精确到方法 + 路径
    return [{ path: this.cleanPath(spec.path), method: spec.method }]
  }

  private cleanPath(p: string): string {
    // '*' / '/*' 这类通配符归一为根路径 '/'：app.use('/') 即对全部路由生效，
    // 同时避开 express5 path-to-regexp 对裸 '*' 的限制。
    if (!p || p === '*' || p === '/*') return '/'
    return path.posix.join('/', p)
  }

  /**
   * 把中间件(类或函数)解析为一个统一的 express handler。
   * 类中间件：当作 provider 实例化(支持构造注入)，绑定其 use 方法。
   */
  private async toHandler(
    middleware: MiddlewareType,
    moduleRef: any,
  ): Promise<(req: Request, res: Response, next: NextFunction) => any> {
    // 函数式中间件：本身就是 (req,res,next) handler
    if (!this.isClassMiddleware(middleware)) {
      return middleware as any
    }
    // 类中间件：解析构造依赖并实例化，handler 即其 use(支持 async，reject 交给 express)
    const deps = await this.injector.resolveDependencies(middleware, moduleRef)
    const instance = new (middleware as any)(...deps) as NestMiddleware
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(instance.use(req, res, next)).catch(next)
    }
  }

  /**
   * 给 handler 包一层运行时守卫：
   *  - 方法限制：forRoutes 指定了具体方法(非 ALL)时，请求方法不匹配则跳过；
   *  - exclude：命中被排除的路由也跳过。
   * 跳过即直接 next() 放行给后续处理，不执行该中间件。
   */
  private guard(
    handler: (req: Request, res: Response, next: NextFunction) => any,
    method: RequestMethod,
    excludes: RouteInfo[],
  ) {
    return (req: Request, res: Response, next: NextFunction) => {
      const reqMethod = req.method.toLowerCase()
      // 方法不匹配：放行不执行
      if (method !== RequestMethod.ALL && method !== (reqMethod as any)) {
        return next()
      }
      // 命中 exclude：放行不执行
      const excluded = excludes.some(
        (ex) =>
          req.path === ex.path &&
          (ex.method === RequestMethod.ALL || ex.method === (reqMethod as any)),
      )
      if (excluded) return next()
      return handler(req, res, next)
    }
  }

  /** 区分类中间件(有 prototype.use)与函数式中间件 */
  private isClassMiddleware(middleware: MiddlewareType): boolean {
    return typeof middleware === 'function' && typeof middleware.prototype?.use === 'function'
  }

  private middlewareName(middleware: MiddlewareType): string {
    return (middleware as any).name || 'anonymous middleware'
  }
}
