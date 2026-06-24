import 'reflect-metadata'
import { CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'

/**
 * GuardsConsumer —— 守卫执行器（对应 Nest 源码中的 GuardsConsumer）。
 *
 * 两个职责(与 PipesConsumer 同构)：
 *  1. 持有「全局守卫」实例(useGlobalGuards / APP_GUARD 注册的)，供路由解析时取用；
 *  2. tryActivate：按顺序执行一串守卫(全局->控制器->方法)的 canActivate，
 *     全部为 true 才放行；任一为 false 立即拦截并抛 ForbiddenException(403)。
 *
 * 守卫在中间件之后、管道之前执行，是请求能否进入处理方法的总闸。
 */
export class GuardsConsumer {
  // 全局守卫实例，按注册顺序存放，最先参与判定
  private readonly globalGuards: CanActivate[] = []

  /** 追加一批全局守卫(useGlobalGuards / APP_GUARD 调用) */
  addGlobalGuards(guards: CanActivate[]) {
    this.globalGuards.push(...guards)
  }

  /** 取全局守卫(供路由解析时拼到每个路由守卫链最前面) */
  getGlobalGuards(): CanActivate[] {
    return this.globalGuards
  }

  /**
   * 依次执行守卫链：全部 canActivate 返回真值才放行；任一返回假值立即抛 403。
   * 守卫的 canActivate 可能是 async(返回 Promise)，逐个 await。
   * @param context 执行上下文(可拿 req/res + getClass/getHandler)
   * @param guards  已排好序的守卫链(全局 + 控制器级 + 方法级)
   */
  async tryActivate(context: ExecutionContext, guards: CanActivate[]): Promise<void> {
    for (const guard of guards) {
      const result = await guard.canActivate(context)
      if (!result) {
        // 对齐 Nest：守卫拒绝默认抛 ForbiddenException(403)，交给异常过滤器处理
        throw new ForbiddenException('Forbidden resource')
      }
    }
  }
}
