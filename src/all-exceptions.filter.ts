import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { LoggerService } from './log.service'

/**
 * 全局异常过滤器示例：@Catch() 不带参数 -> 捕获一切异常。
 *
 * 统一把异常格式化成带 statusCode / timestamp / path / message 的 JSON。
 * HttpException 用其自带状态码与响应体，其它错误兜底为 500。
 *
 * 通过 APP_FILTER 以 provider 方式注册，故走 DI：构造里注入 LoggerService。
 */
@Injectable
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse()
    const req = ctx.getRequest()

    // HttpException：取其状态码与响应体；其它：按 500 兜底
    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const payload = isHttp ? exception.getResponse() : 'Internal server error'
    const message = typeof payload === 'string' ? payload : (payload as any).message ?? payload

    this.logger.log(`[AllExceptionsFilter] ${status} ${req.originalUrl}`)
    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      message,
    })
  }
}
