import 'reflect-metadata'
import path from 'path'
import { Express, NextFunction, Request, Response } from 'express'
import {
  ExceptionFilter,
  FilterParam,
  ParamMetadata,
  USE_FILTERS_WATERMARK,
  PipeTransform,
  PipeParam,
  USE_PIPES_WATERMARK,
  PARAM_PIPES_METADATA,
  ArgumentMetadata,
  getParamtype,
} from '@nestjs/common'
import { Logger } from '../log'
import { Injector } from '../injector/injector'
import { ExceptionsHandler } from '../exceptions/exceptions-handler'
import { PipesConsumer } from '../pipes/pipes-consumer'
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
  // 管道类的实例缓存，与过滤器同构：按「模块 -> (管道类 -> 实例)」分层，每模块一个实例。
  private readonly pipeInstances = new Map<any, Map<Function, PipeTransform>>()

  constructor(
    private readonly app: Express,
    private readonly injector: Injector,
    private readonly exceptionsHandler: ExceptionsHandler,
    private readonly pipesConsumer: PipesConsumer,
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
    // 控制器级 @UsePipes：对该 controller 下所有路由的参数生效(实例化一次复用)
    const controllerPipes = await this.resolvePipes(Controller, module)

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

      // 方法级 @UsePipes，与控制器级拼成「控制器 -> 方法」链(全局在 resolveParams 里再拼到最前)
      const methodPipes = await this.resolvePipes(method, module)
      const classMethodPipes = [...controllerPipes, ...methodPipes]

      // 参数级管道(@Body(pipe) 等)按参数下标预先实例化好(同样按本模块解析依赖)
      const paramPipes = await this.resolveParamPipes(controllerProtoType, methodName, module)

      const routerPath = path.posix.join('/', prefix, pathMatcher)
      const httpMethodName = httpMethod.toLowerCase() as HttpMethod
      // 把请求处理逻辑绑定到 express 对应的方法上
      this.app[httpMethodName](routerPath, (req: Request, res: Response, next: NextFunction) => {
        // handleRequest 是 async，抛出的异常交给异常处理：先局部过滤器，再全局
        this.handleRequest(
          controller,
          methodName,
          method,
          req,
          res,
          next,
          classMethodPipes,
          paramPipes,
        ).catch((err) =>
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
   * 读取目标(controller 类 或 处理方法)上的 @UsePipes 元数据，解析成管道实例。
   * 与 resolveFilters 同构：类走 DI 实例化并按「模块」缓存(每模块一个实例)，实例原样使用。
   * @param target 读取元数据的目标：Controller 类 或 方法函数
   * @param module 当前 controller 所属模块：缓存维度 + 管道依赖的可见性上下文
   */
  private async resolvePipes(target: any, module: any): Promise<PipeTransform[]> {
    const pipes: PipeParam[] = Reflect.getMetadata(USE_PIPES_WATERMARK, target) ?? []
    return this.instantiatePipes(pipes, module)
  }

  /**
   * 把一组管道(类或实例)解析成实例：类按本模块 DI 实例化并缓存(每模块一个)，实例原样返回。
   * 参数级管道(@Body(Pipe)) 与 @UsePipes 共用此逻辑，保证实例化与缓存策略一致。
   */
  private async instantiatePipes(pipes: PipeParam[], module: any): Promise<PipeTransform[]> {
    const instances: PipeTransform[] = []
    for (const pipe of pipes) {
      if (typeof pipe === 'function') {
        let perModule = this.pipeInstances.get(module)
        if (!perModule) {
          perModule = new Map<Function, PipeTransform>()
          this.pipeInstances.set(module, perModule)
        }
        let instance = perModule.get(pipe)
        if (!instance) {
          const deps = await this.injector.resolveDependencies(pipe, module)
          instance = new (pipe as any)(...deps) as PipeTransform
          perModule.set(pipe, instance)
        }
        instances.push(instance)
      } else {
        // 已是实例(如 new ValidationPipe())：直接用
        instances.push(pipe)
      }
    }
    return instances
  }

  /**
   * 读取某方法各参数声明的「参数级管道」(@Body(pipe) / @Query('age', pipe) 写入的)，
   * 按参数下标预先实例化好(按本模块解析依赖)。返回 下标 -> 管道实例数组。
   * 在注册阶段(explore)完成实例化，请求时直接复用，无需在请求里再触碰模块上下文。
   */
  private async resolveParamPipes(
    proto: any,
    methodName: string,
    module: any,
  ): Promise<PipeTransform[][]> {
    // 参数级管道元数据由参数装饰器写在 controller 原型上(target=prototype, key=方法名)
    const paramPipes: PipeParam[][] =
      Reflect.getMetadata(PARAM_PIPES_METADATA, proto, methodName) || []
    const resolved: PipeTransform[][] = []
    for (let i = 0; i < paramPipes.length; i++) {
      resolved[i] = paramPipes[i] ? await this.instantiatePipes(paramPipes[i], module) : []
    }
    return resolved
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
    classMethodPipes: PipeTransform[],
    paramPipes: PipeTransform[][],
  ) {
    ;(req as any).user = {
      name: 'tom1',
      age: 10,
    }
    // 参数解析现在是 async：每个参数都要流过管道链(可能含 async 的 ValidationPipe)
    const args = await this.resolveParams(
      controller,
      methodName,
      req,
      res,
      next,
      classMethodPipes,
      paramPipes,
    )
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
   * 从请求上下文中解析出调用该方法所需的实参数组，并让每个参数依次流过管道链。
   *
   * 管道链顺序(对齐 Nest)：全局 -> 控制器级 -> 方法级 -> 参数级(@Body(pipe) 等)。
   * 每个参数的 ArgumentMetadata.metatype 取自 design:paramtypes(该参数的 TS 类型构造器)，
   * 这正是 ValidationPipe 能识别 DTO、又自动跳过 @Req/@Res(类型被擦成 Object) 的机制。
   * @param classMethodPipes 已排好序的「控制器级 + 方法级」管道
   * @param paramPipes       各参数预先实例化好的「参数级管道」(按参数下标)
   */
  private async resolveParams(
    instance: any,
    methodName: string,
    req: Request,
    res: Response,
    next: NextFunction,
    classMethodPipes: PipeTransform[],
    paramPipes: PipeTransform[][],
  ): Promise<any[]> {
    const params: ParamMetadata[] =
      Reflect.getMetadata(`params:${methodName}`, instance, methodName) || []
    // 参数的 TS 类型构造器数组(emitDecoratorMetadata 自动记录)，作为各参数的 metatype
    const paramtypes: any[] =
      Reflect.getMetadata('design:paramtypes', instance, methodName) ?? []
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

    // 先取原始值，再对每个参数应用完整管道链
    return Promise.all(
      params.map(async (paramMetaDate, index) => {
        const { key, data } = paramMetaDate
        let value: any
        switch (key) {
          case 'Request':
            value = req
            break
          case 'Response':
            value = res
            break
          case 'Body':
            value = req.body
            break
          case 'Query':
            value = data ? req.query[data] : req.query
            break
          case 'Headers':
            value = data ? req.headers[data] : req.headers
            break
          case 'Session':
            value = data ? (req.session as Record<string, any>)[data] : req.session
            break
          case 'Ip':
            value = req.ip
            break
          case 'Param':
            value = data ? req.params[data] : req.params
            break
          case 'Next':
            value = next
            break
          case 'DecoratorFactory':
            value = paramMetaDate.factory(data, ctx)
            break
        }

        // 组装该参数的元信息：来源类型 + TS 类型 + 装饰器入参
        const metadata: ArgumentMetadata = {
          type: getParamtype(key),
          metatype: paramtypes[index],
          data: typeof data === 'string' ? data : undefined,
        }
        // 管道链(对齐 Nest 顺序)：全局 -> 控制器级+方法级 -> 参数级(预先实例化好的)
        const pipeChain = [
          ...this.pipesConsumer.getGlobalPipes(),
          ...classMethodPipes,
          ...(paramPipes[index] ?? []),
        ]
        return this.pipesConsumer.apply(value, metadata, pipeChain)
      }),
    )
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

  constructor(
    app: Express,
    injector: Injector,
    exceptionsHandler: ExceptionsHandler,
    pipesConsumer: PipesConsumer,
  ) {
    this.routerExplorer = new RouterExplorer(app, injector, exceptionsHandler, pipesConsumer)
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
