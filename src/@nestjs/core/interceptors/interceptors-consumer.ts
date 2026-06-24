import 'reflect-metadata'
import { Observable, from, lastValueFrom, of } from 'rxjs'
import { mergeMap } from 'rxjs/operators'
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'

/**
 * InterceptorsConsumer —— 拦截器执行器（对应 Nest 源码中的 InterceptorsConsumer）。
 *
 * 两个职责(与 PipesConsumer / GuardsConsumer 同构)：
 *  1. 持有「全局拦截器」实例(useGlobalInterceptors / APP_INTERCEPTOR 注册的)，供路由解析时取用；
 *  2. intercept：把一串拦截器「由外到内」包裹到最终处理逻辑(next)上，得到响应值。
 *
 * 包裹原理(对齐 Nest)：从最后一个拦截器往前组合 CallHandler——
 * 第 i 个拦截器拿到的 next.handle() 会触发第 i+1 个拦截器，最内层的 handle() 才真正执行
 * 路由处理方法。于是「全局 -> 控制器 -> 方法」顺序的拦截器，全局在最外层：
 * 前置逻辑按 全局->方法 进入，后置逻辑(Observable 变换)按 方法->全局 冒出。
 */
export class InterceptorsConsumer {
  // 全局拦截器实例，按注册顺序存放，位于包裹链最外层
  private readonly globalInterceptors: NestInterceptor[] = []

  /** 追加一批全局拦截器(useGlobalInterceptors / APP_INTERCEPTOR 调用) */
  addGlobalInterceptors(interceptors: NestInterceptor[]) {
    this.globalInterceptors.push(...interceptors)
  }

  /** 取全局拦截器(供路由解析时拼到每路由拦截器链最前面) */
  getGlobalInterceptors(): NestInterceptor[] {
    return this.globalInterceptors
  }

  /**
   * 用拦截器链包裹最终处理逻辑并求值。
   * @param context       执行上下文(与守卫共享，可拿 req/res + getClass/getHandler)
   * @param interceptors  已排好序的拦截器链(全局 + 控制器级 + 方法级)
   * @param next          最内层处理逻辑(解析参数 + 调用路由方法)，返回处理方法的结果(可能是 Promise)
   * @returns             经全部拦截器后置变换后的最终响应值
   */
  async intercept(
    context: ExecutionContext,
    interceptors: NestInterceptor[],
    next: () => Promise<any>,
  ): Promise<any> {
    // 最内层 CallHandler：handle() 真正执行处理方法。用 from(Promise) 转成 Observable，
    // 使「返回普通值/Promise」与「返回 Observable」在拦截器看来一致(都是 Observable)。
    const start: CallHandler = {
      handle: () =>
        from(
          // next() 可能返回普通值/Promise；若处理方法本身返回 Observable，from 也能正确摊平
          Promise.resolve(next()),
        ),
    }

    // 从最后一个拦截器往前包裹：reduceRight 让前面的拦截器位于更外层
    const chain = interceptors.reduceRight<CallHandler>((nextHandler, interceptor) => {
      return {
        // 惰性求值：只有当外层拦截器调用 handle() 时，才进入下一个拦截器的 intercept。
        // intercept 可能是 async(返回 Promise<Observable>)：from 包成 Observable<Observable> 后，
        // 用 mergeMap 订阅其内层 Observable 并透传值，从而摊平成 Observable<value>。
        handle: () =>
          from(Promise.resolve(interceptor.intercept(context, nextHandler))).pipe(
            mergeMap((inner: any) => (inner instanceof Observable ? inner : of(inner))),
          ),
      }
    }, start)

    // 触发整条链并取最终值(对齐 Nest：用 Observable 的最后一个值作为响应体)
    return lastValueFrom(chain.handle())
  }
}
