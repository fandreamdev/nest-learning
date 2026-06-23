import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common'
import { LoggerService } from './log.service'

/**
 * 方法/控制器级过滤器示例：@Catch(HttpException) -> 只处理 HttpException 及其子类。
 *
 * 演示两点：
 *  1. @Catch 带类型 -> 只匹配该类异常(非 HttpException 会落到全局过滤器/默认处理)；
 *  2. 过滤器类走 DI -> 构造里注入 LoggerService。
 */
@Injectable
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse()
    const req = ctx.getRequest()
    const status = exception.getStatus()
    const response = exception.getResponse()
    const message = typeof response === 'string' ? response : (response as any).message ?? response

    this.logger.log(`[HttpExceptionFilter] ${status} ${req.originalUrl}`)
    res.status(status).json({
      statusCode: status,
      handledBy: 'HttpExceptionFilter',
      path: req.originalUrl,
      message,
    })
  }
}
