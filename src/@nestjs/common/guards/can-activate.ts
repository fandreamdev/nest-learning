import 'reflect-metadata'
import { ArgumentsHost } from '../exceptions/exception-filter'
import { USE_GUARDS_WATERMARK } from '../constant'

// USE_GUARDS_WATERMARK 已统一在 ../constant 定义，此处 import 使用。

/**
 * ExecutionContext —— 执行上下文（对应 Nest 源码中的 ExecutionContext）。
 *
 * 在 ArgumentsHost(拿 req/res)的基础上，额外提供「当前正在处理的是哪个 controller 类、
 * 哪个处理方法」。守卫据此配合 Reflector 读取写在类/方法上的元数据(如 @Roles)，
 * 从而做出基于角色/权限的放行决策。
 */
export interface ExecutionContext extends ArgumentsHost {
  /** 取当前处理方法所属的 controller 类(构造器) */
  getClass<T = any>(): new (...args: any[]) => T
  /** 取当前正在处理的方法函数(handler) */
  getHandler(): Function
}

/**
 * CanActivate —— 守卫接口（对应 Nest 源码中的 CanActivate）。
 *
 * 实现 canActivate(context) 返回布尔(或其 Promise)：
 *  - true：放行，继续后续(管道 -> 处理方法)；
 *  - false：拦截，框架抛 ForbiddenException(403)，交给异常过滤器。
 * 守卫在中间件之后、管道之前执行，是「这个请求能不能进到这个处理方法」的总闸。
 */
export interface CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean>
}

/** @UseGuards 接受的守卫：已实例化的守卫，或守卫类(由框架按 DI 实例化) */
export type GuardParam = CanActivate | (new (...args: any[]) => CanActivate)

/**
 * @UseGuards(...guards) —— 把守卫绑定到 controller 类或某个处理方法。
 *
 * 作用范围由装饰位置决定：
 *  - 加在方法上：只对该路由生效(方法级)；
 *  - 加在 controller 类上：对该 controller 的所有路由生效(控制器级)。
 *
 * 执行顺序：全局 -> 控制器级 -> 方法级，任一守卫返回 false 即拦截(抛 403)。
 * 守卫既可传实例，也可传类(类会被当作 provider 实例化，支持构造注入，如注入 Reflector)。
 *
 * 用法：
 *   @UseGuards(AuthGuard)
 *   @UseGuards(new RolesGuard())
 */
export function UseGuards(...guards: GuardParam[]) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // 方法级：写到该处理方法上
      Reflect.defineMetadata(USE_GUARDS_WATERMARK, guards, descriptor.value)
    } else {
      // 控制器级：写到 controller 类上
      Reflect.defineMetadata(USE_GUARDS_WATERMARK, guards, target)
    }
  }
}
