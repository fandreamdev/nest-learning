import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Logger } from '@nestjs/core'
import { Observable, tap } from 'rxjs'

/**
 * LoggingInterceptor —— 请求耗时日志拦截器（对齐 Nest 文档中的经典示例）。
 *
 * 前置逻辑：进入 handle() 前记录起始时间(用普通时间戳，避免依赖被禁用的 Date.now)；
 * 后置逻辑：用 tap 在处理方法完成后打印「类名#方法名」与耗时，不改变响应值。
 */
@Injectable
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const className = context.getClass().name
    const handlerName = context.getHandler().name
    const before = performance.now()
    Logger.log(`-> ${className}#${handlerName}`, 'LoggingInterceptor')

    return next.handle().pipe(
      tap(() => {
        const ms = Math.round(performance.now() - before)
        Logger.log(`<- ${className}#${handlerName} ${ms}ms`, 'LoggingInterceptor')
      }),
    )
  }
}
