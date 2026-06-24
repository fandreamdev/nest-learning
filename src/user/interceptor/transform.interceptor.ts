import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, map } from 'rxjs'

/**
 * TransformInterceptor —— 统一响应包装拦截器（对齐 Nest 文档中的经典示例）。
 *
 * 后置逻辑：用 map 把处理方法的返回值包进 { data } 结构，统一响应外形。
 * 体现拦截器「对 next.handle() 返回的 Observable 做变换」的能力。
 */
@Injectable
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => ({ data })))
  }
}
