import { Constructor } from '.'

/**
 * NestMiddleware —— 类中间件需实现的接口。
 * 实现类会被框架当作 provider 一样实例化(支持构造注入)，
 * 每次请求命中其注册的路由时调用 use()。
 */
export interface NestMiddleware<TRequest = any, TResponse = any> {
  use(req: TRequest, res: TResponse, next: (error?: any) => void): any
}

/** 函数式中间件：直接就是一个 express 风格的 (req,res,next) 处理函数 */
export type MiddlewareFunction = (req: any, res: any, next: (error?: any) => void) => any

/** apply() 接受的中间件：实现 NestMiddleware 的类，或函数式中间件 */
export type MiddlewareType = Constructor | MiddlewareFunction

/** forRoutes 里用来限定 HTTP 方法；ALL 表示不限方法 */
export enum RequestMethod {
  ALL = 'all',
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
  PATCH = 'patch',
  OPTIONS = 'options',
  HEAD = 'head',
}

/** 路由信息：精确到 {路径, 方法} */
export interface RouteInfo {
  path: string
  method: RequestMethod
}

/**
 * forRoutes / exclude 接受的路由描述：
 *  - 字符串路径('users')：匹配该前缀及其子路径，不限方法
 *  - controller 类：取其 @Controller 前缀，等价于该 controller 的所有路由
 *  - RouteInfo：精确到方法 + 路径
 */
export type RouteSpec = string | Constructor | RouteInfo

/** apply() 之后返回的链式代理：可继续 forRoutes / exclude */
export interface MiddlewareConfigProxy {
  /** 限定这批中间件作用的路由；调用后回到 consumer，可继续 .apply(...) */
  forRoutes(...routes: RouteSpec[]): MiddlewareConsumer
  /** 在 forRoutes 范围内排除某些路由 */
  exclude(...routes: RouteSpec[]): MiddlewareConfigProxy
}

/** configure(consumer) 拿到的消费者：用 apply 声明中间件 */
export interface MiddlewareConsumer {
  apply(...middlewares: MiddlewareType[]): MiddlewareConfigProxy
}

/**
 * NestModule —— 模块实现该接口即可在 configure 里注册中间件。
 * 框架在路由注册之前会实例化该模块(支持构造注入)并调用 configure。
 */
export interface NestModule {
  configure(consumer: MiddlewareConsumer): void
}
