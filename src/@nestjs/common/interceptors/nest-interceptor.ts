import 'reflect-metadata'
import { Observable } from 'rxjs'
import { ExecutionContext } from '../guards/can-activate'

/** @UseInterceptors 写在 controller 类 / 处理方法上的元数据 key：记录绑定的拦截器 */
export const USE_INTERCEPTORS_WATERMARK = 'use:interceptors'

/**
 * CallHandler —— 路由处理方法的「调用句柄」（对应 Nest 源码中的 CallHandler）。
 *
 * 它把「真正执行处理方法(及其参数管道解析)」这件事包装成 handle()，交给拦截器掌控时机：
 *  - 拦截器在 next.handle() 之前写的代码 = 前置逻辑(处理方法执行前)；
 *  - handle() 返回一个 Observable，其发出的值就是处理方法的返回值；
 *  - 拦截器对该 Observable 做 pipe(map/tap...) = 后置逻辑(处理方法执行后、响应发送前)。
 * 在拦截器链中，后一个拦截器的 intercept 返回值，就是前一个拦截器拿到的 CallHandler。
 */
export interface CallHandler<T = any> {
  handle(): Observable<T>
}

/**
 * NestInterceptor —— 拦截器接口（对应 Nest 源码中的 NestInterceptor）。
 *
 * 实现 intercept(context, next)：在调用 next.handle() 前后插入逻辑，并返回一个 Observable。
 * 典型用途：统一响应包装、日志/耗时统计、缓存、异常映射、超时控制等。
 *
 * 执行模型(对齐 Nest)：中间件 -> 守卫 -> 拦截器(前) -> 管道 -> 处理方法 -> 拦截器(后) -> 异常过滤器。
 */
export interface NestInterceptor<T = any, R = any> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<R> | Promise<Observable<R>>
}

/** @UseInterceptors 接受的拦截器：已实例化的拦截器，或拦截器类(由框架按 DI 实例化) */
export type InterceptorParam =
  | NestInterceptor
  | (new (...args: any[]) => NestInterceptor)

/**
 * @UseInterceptors(...interceptors) —— 把拦截器绑定到 controller 类或某个处理方法。
 *
 * 作用范围由装饰位置决定：
 *  - 加在方法上：只对该路由生效(方法级)；
 *  - 加在 controller 类上：对该 controller 的所有路由生效(控制器级)。
 *
 * 执行顺序：全局 -> 控制器级 -> 方法级，按此顺序「由外到内」包裹处理方法——
 * 即全局拦截器在最外层(最先进入前置、最后执行后置)。
 * 拦截器既可传实例，也可传类(类会被当作 provider 实例化，支持构造注入)。
 *
 * 用法：
 *   @UseInterceptors(LoggingInterceptor)
 *   @UseInterceptors(new TransformInterceptor())
 */
export function UseInterceptors(...interceptors: InterceptorParam[]) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // 方法级：写到该处理方法上
      Reflect.defineMetadata(USE_INTERCEPTORS_WATERMARK, interceptors, descriptor.value)
    } else {
      // 控制器级：写到 controller 类上
      Reflect.defineMetadata(USE_INTERCEPTORS_WATERMARK, interceptors, target)
    }
  }
}
