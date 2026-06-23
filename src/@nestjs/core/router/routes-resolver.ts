import 'reflect-metadata'
import path from 'path'
import { Express, NextFunction, Request, Response } from 'express'
import { ExceptionFilter, FilterParam, ParamMetadata, USE_FILTERS_WATERMARK } from '@nestjs/common'
import { Logger } from '../log'
import { Injector } from '../injector/injector'
import { ExceptionsHandler } from '../exceptions/exceptions-handler'
import { ArgumentsHost } from '@nestjs/common'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head'

/**
 * RouterExplorer —— 单个 controller 的路由探查器（对应 Nest 源码中的 RouterExplorer）。
 *
 * 负责：实例化 controller、读取其路由元数据、把每个处理方法注册到 express，
 * 并在请求到来时解析方法参数(@Body/@Query/@Param 等)、处理 httpCode/重定向/响应头。
 * 处理过程中抛出的异常统一交给 ExceptionsHandler(全局异常过滤器)。
 */
export class RouterExplorer {
  // 过滤器类的实例缓存，按「模块 -> (过滤器类 -> 实例)」分层。
  // 与 Nest 对齐：@UseFilters 引用的过滤器类是「每模块一个实例(per-module singleton)」，
  // 而非全局唯一。各模块按自身上下文解析过滤器的依赖，互不影响——同一个过滤器类
  // 被多个模块的 controller 引用时，会在各模块各建一份，依赖各自按本模块可见性校验。
  private readonly filterInstances = new Map<any, Map<Function, ExceptionFilter>>()

  constructor(
    private readonly app: Express,
    private readonly injector: Injector,
    private readonly exceptionsHandler: ExceptionsHandler,
  ) {}

  /**
   * 探查并注册一个 controller 的全部路由。
   * @param Controller controller 类
   * @param module     controller 归属的模块（用于解析其构造依赖的可见性）
   */
  async explore(Controller: any, module: any) {
    // 解析 controller 构造依赖并实例化(依赖解析是异步的，需 await)
    const params = await this.injector.resolveDependencies(Controller, module)
    const controller = new Controller(...params)
    const prefix = Reflect.getMetadata('prefix', Controller) || '/'
    Logger.log(`${Controller.name} {${prefix}}`, 'RoutersResolver')

    // 控制器级 @UseFilters：对该 controller 下所有路由生效(实例化一次复用)
    const controllerFilters = await this.resolveFilters(Controller, module)

    // 遍历 controller 原型上的每个方法，注册有 HTTP 装饰器的路由
    const controllerProtoType = Controller.prototype
    for (const methodName of Object.getOwnPropertyNames(controllerProtoType)) {
      const method = controllerProtoType[methodName]
      const httpMethod = Reflect.getMetadata('method', method)
      const pathMatcher = Reflect.getMetadata('path', method)
      if (!httpMethod) continue

      // 方法级 @UseFilters：优先级最高，排在控制器级之前
      const methodFilters = await this.resolveFilters(method, module)
      // 局部过滤器最终顺序：方法级 > 控制器级（再由 handler 落到全局之前）
      const localFilters = [...methodFilters, ...controllerFilters]

      const routerPath = path.posix.join('/', prefix, pathMatcher)
      const httpMethodName = httpMethod.toLowerCase() as HttpMethod
      // 把请求处理逻辑绑定到 express 对应的方法上
      this.app[httpMethodName](routerPath, (req: Request, res: Response, next: NextFunction) => {
        // handleRequest 是 async，抛出的异常交给异常处理：先局部过滤器，再全局
        this.handleRequest(controller, methodName, method, req, res, next).catch((err) =>
          // handle 已自行兜住过滤器失败；再挂一个 catch 防御性收尾，杜绝 unhandled rejection
          this.exceptionsHandler
            .handle(err, req, res, next, localFilters)
            .catch((fatal) => Logger.error(String(fatal), 'RoutersResolver')),
        )
      })
      Logger.log(`Mapped {${routerPath}, ${httpMethod}} route`, 'RoutersResolver')
    }
  }

  /**
   * 读取目标(controller 类 或 处理方法)上的 @UseFilters 元数据，解析成过滤器实例。
   * 过滤器可写成实例或类：
   *  - 类：走 DI 实例化，并按「模块」缓存——每模块一个实例(per-module singleton，对齐 Nest)；
   *  - 实例：原样使用(由调用方自己保证唯一性)。
   * @param target 读取元数据的目标：Controller 类 或 方法函数
   * @param module 当前 controller 所属模块：既是缓存维度，也是过滤器依赖的可见性上下文
   */
  private async resolveFilters(target: any, module: any): Promise<ExceptionFilter[]> {
    const filters: FilterParam[] = Reflect.getMetadata(USE_FILTERS_WATERMARK, target) ?? []
    const instances: ExceptionFilter[] = []
    for (const filter of filters) {
      if (typeof filter === 'function') {
        // 过滤器类：在「本模块」的缓存里查，命中直接复用，否则按本模块上下文解析依赖并实例化。
        // 依赖可见性由 resolveDependencies(filter, module) 按当前模块校验，不可见会在此报错。
        let perModule = this.filterInstances.get(module)
        if (!perModule) {
          perModule = new Map<Function, ExceptionFilter>()
          this.filterInstances.set(module, perModule)
        }
        let instance = perModule.get(filter)
        if (!instance) {
          const deps = await this.injector.resolveDependencies(filter, module)
          instance = new (filter as any)(...deps) as ExceptionFilter
          perModule.set(filter, instance)
        }
        instances.push(instance)
      } else {
        // 已是实例：直接用
        instances.push(filter)
      }
    }
    return instances
  }

  /**
   * 单次请求的处理流程：解析参数 -> 调用方法 -> 处理状态码/重定向/响应头 -> 发送响应。
   * 处理方法可能是 async 的，这里统一 await，与真实 Nest 一致。
   */
  private async handleRequest(
    controller: any,
    methodName: string,
    method: Function,
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    ;(req as any).user = {
      name: 'tom1',
      age: 10,
    }
    const args = this.resolveParams(controller, methodName, req, res, next)
    const result = await method.call(controller, ...args)

    const httpCode = Reflect.getMetadata('httpCode', method)
    const httpMethod = Reflect.getMetadata('method', method)
    if (httpCode) {
      res.statusCode = httpCode
    } else if (httpMethod === 'POST') {
      res.statusCode = 201
    }

    // 如果需要重定向，直接进行重定向
    const redirectUrl = Reflect.getMetadata('redirectUrl', method)
    const redirectStatus = Reflect.getMetadata('redirectStatusCode', method)
    if (redirectUrl) {
      const url = result.url ?? redirectUrl
      const statusCode = result.statusCode ?? redirectStatus
      return res.redirect(statusCode, url)
    }

    // 没有用 @Res 接管响应(或声明了 passthrough)时，由框架负责设置响应头并发送结果
    const responseMeta = this.getResponseMetadata(controller, methodName)
    if (!responseMeta || responseMeta.data?.passthrough) {
      const headers = Reflect.getMetadata('httpHeaders', method) ?? []
      if (headers) {
        headers.forEach(({ key, value }: { key: string; value: string }) => {
          res.setHeader(key, value)
        })
      }
      res.send(result)
    }
  }

  /**
   * 根据方法参数装饰器(@Req/@Body/@Query/@Param/自定义装饰器等)元数据，
   * 从请求上下文中解析出调用该方法所需的实参数组。
   */
  private resolveParams(
    instance: any,
    methodName: string,
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const params: ParamMetadata[] =
      Reflect.getMetadata(`params:${methodName}`, instance, methodName) || []
    // 自定义参数装饰器(createParamDecorator)拿到的执行上下文
    const ctx: ArgumentsHost = {
      switchToHttp: function () {
        return {
          getRequest() {
            return req
          },
          getResponse() {
            return res
          },
          getNext() {
            return next
          },
        }
      },
    }
    return params.map((paramMetaDate) => {
      const { key, data } = paramMetaDate
      switch (key) {
        case 'Request':
          return req
        case 'Response':
          return res
        case 'Body':
          return req.body
        case 'Query':
          return data ? req.query[data] : req.query
        case 'Headers':
          return data ? req.headers[data] : req.headers
        case 'Session':
          return data ? (req.session as Record<string, any>)[data] : req.session
        case 'Ip':
          return req.ip
        case 'Param':
          return data ? req.params[data] : req.params
        case 'Next':
          return next
        case 'DecoratorFactory':
          const { factory } = paramMetaDate
          return factory(data, ctx)
      }
    })
  }

  /** 查出方法上是否声明了 @Res / @Next（框架据此决定要不要自动发送响应） */
  private getResponseMetadata(instance: any, methodName: string) {
    const params: ParamMetadata[] =
      Reflect.getMetadata(`params:${methodName}`, instance, methodName) || []
    return params.filter(Boolean).find((meta) => meta.key === 'Response' || meta.key === 'Next')
  }
}

/**
 * RoutesResolver —— 路由解析总入口（对应 Nest 源码中的 RoutesResolver）。
 *
 * 负责取出模块里的所有 controller，逐个交给 RouterExplorer 注册路由。
 */
export class RoutesResolver {
  private readonly routerExplorer: RouterExplorer

  constructor(app: Express, injector: Injector, exceptionsHandler: ExceptionsHandler) {
    this.routerExplorer = new RouterExplorer(app, injector, exceptionsHandler)
  }

  /**
   * 解析并注册所有模块下 controller 的路由。
   * @param modules        扫描器收集到的全部模块
   * @param getControllers 读取某模块「有效 controllers」的函数(静态+动态合并)，
   *                       由扫描器提供，使路由解析对动态模块透明
   */
  async resolve(modules: any[], getControllers: (module: any) => any[]) {
    Logger.log('AppModule dependencies initialized', 'InstanceLoader')
    for (const module of modules) {
      const controllers = getControllers(module)
      for (const Controller of controllers) {
        // controller 的构造依赖按它「自己所属模块」的可见性来解析(异步)
        await this.routerExplorer.explore(Controller, module)
      }
    }
  }
}
