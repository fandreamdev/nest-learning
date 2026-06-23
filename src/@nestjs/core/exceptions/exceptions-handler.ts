import 'reflect-metadata'
import { Request, Response, NextFunction } from 'express'
import {
  ArgumentsHost,
  CATCH_WATERMARK,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Logger } from '../log'

/**
 * ExceptionsHandler —— 异常处理总管（对应 Nest 源码中的 ExceptionsHandler）。
 *
 * 持有一组全局异常过滤器，请求处理出错时：
 *  1. 按注册的逆序找到第一个「声明能捕获该异常类型」的过滤器(@Catch 匹配)，交给它处理；
 *  2. 没有任何过滤器匹配，则走内置的默认处理(HttpException 用其状态码，其余按 500)。
 *
 * 与 Nest 一致：后注册的过滤器优先(逆序遍历)，@Catch() 不带参数表示捕获一切。
 */
export class ExceptionsHandler {
  // 全局过滤器实例列表，按注册顺序存放，匹配时逆序遍历(后注册优先)
  private readonly filters: ExceptionFilter[] = []

  /** 追加一批全局过滤器(useGlobalFilters 调用) */
  addFilters(filters: ExceptionFilter[]) {
    this.filters.push(...filters)
  }

  /**
   * 处理一次异常：按「局部过滤器(方法级/控制器级) -> 全局过滤器」的顺序找第一个匹配者，
   * 都不匹配则走内置默认处理。
   *
   * 健壮性：过滤器自身执行失败(同步抛 或 返回 rejected promise)不会逃逸成
   * unhandled rejection / 请求悬挂——会记日志并退回内置默认处理，保证一定有响应。
   * @param exception     抛出的异常(可能是 HttpException、普通 Error、或任意值)
   * @param localFilters  该路由绑定的局部过滤器实例(已按 方法级>控制器级 排好序，优先于全局)
   */
  async handle(
    exception: any,
    req: Request,
    res: Response,
    next: NextFunction,
    localFilters: ExceptionFilter[] = [],
  ) {
    const host = this.createArgumentsHost(req, res, next)

    // 局部过滤器优先：按传入顺序(方法级 > 控制器级)依次匹配
    for (const filter of localFilters) {
      if (this.canCatch(filter, exception)) {
        return this.invokeFilter(filter, exception, host, res)
      }
    }

    // 再看全局过滤器，逆序遍历：后注册的优先
    for (let i = this.filters.length - 1; i >= 0; i--) {
      const filter = this.filters[i]
      if (this.canCatch(filter, exception)) {
        return this.invokeFilter(filter, exception, host, res)
      }
    }

    // 没有匹配的自定义过滤器：内置默认处理
    this.handleDefault(exception, res)
  }

  /**
   * 调用单个过滤器并兜住它自身的失败。
   * 过滤器的 catch 可能是同步抛错，也可能是 async/返回 promise 后 reject——
   * 用 Promise.resolve(...).catch 一并兜住；失败则记日志并退回内置默认处理。
   * 兜底前判断 res.headersSent：过滤器若已写出部分响应就不再重复发送，避免
   * "Cannot set headers after they are sent" 错误。
   */
  private async invokeFilter(
    filter: ExceptionFilter,
    exception: any,
    host: ArgumentsHost,
    res: Response,
  ) {
    try {
      await Promise.resolve(filter.catch(exception, host))
    } catch (filterError) {
      Logger.error(
        `异常过滤器 ${filter.constructor?.name} 执行失败: ${String(
          (filterError as any)?.stack ?? filterError,
        )}`,
        'ExceptionsHandler',
      )
      // 过滤器已经把响应头发出去了，无法再兜底，只能放弃(否则会二次发送报错)
      if (res.headersSent) return
      // 退回内置默认处理：对「原始异常」兜底，至少保证有响应
      this.handleDefault(exception, res)
    }
  }

  /** 判断某过滤器是否声明能捕获该异常：@Catch() 空参=捕获一切，否则按类型 instanceof 匹配 */
  private canCatch(filter: ExceptionFilter, exception: any): boolean {
    const targets: Function[] = Reflect.getMetadata(CATCH_WATERMARK, filter.constructor) ?? []
    // @Catch() 不带参数：捕获所有异常
    if (targets.length === 0) return true
    // 否则异常必须是声明类型之一的实例
    return targets.some((type) => exception instanceof type)
  }

  /**
   * 内置默认异常处理(对应 Nest 的 BaseExceptionFilter 默认行为)：
   *  - HttpException：用其状态码 + getResponse() 作为响应体；
   *  - 其它任何错误：按 500，避免泄漏内部细节。
   */
  private handleDefault(exception: any, res: Response) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()
      // 响应体：字符串则包装成标准结构；对象则原样返回
      const body =
        typeof response === 'string' ? { statusCode: status, message: response } : response
      return res.status(status).json(body)
    }

    // 非 HttpException：记录日志并返回 500(不外泄堆栈)
    Logger.error?.(String(exception?.stack ?? exception), 'ExceptionsHandler')
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  }

  /** 构造交给过滤器的执行上下文，过滤器据此拿 req/res 写回响应 */
  private createArgumentsHost(req: Request, res: Response, next: NextFunction): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
        getNext: () => next,
      }),
    }
  }
}
