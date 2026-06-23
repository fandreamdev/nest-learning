import 'reflect-metadata'
import { Request, Response, NextFunction } from 'express'

/** @Catch 写在过滤器类上的元数据 key：记录该过滤器声明捕获的异常类型 */
export const CATCH_WATERMARK = 'catch:exceptions'

/** @UseFilters 写在 controller 类 / 处理方法上的元数据 key：记录绑定的过滤器 */
export const USE_FILTERS_WATERMARK = 'use:filters'

/**
 * APP_FILTER —— 以「provider 方式」注册全局异常过滤器的特殊 token。
 *
 * 在任意模块的 providers 里写 { provide: APP_FILTER, useClass: XxFilter } 即可把
 * XxFilter 注册为全局过滤器。相比 app.useGlobalFilters(new XxFilter())，它的过滤器
 * 走 DI 容器实例化，因此可以在构造里注入其它 provider；同一 token 可登记多个。
 */
export const APP_FILTER = 'APP_FILTER'

/**
 * ArgumentsHost —— 执行上下文（对应 Nest 源码中的 ArgumentsHost）。
 * 过滤器通过它拿到底层的 req/res，从而把错误响应写回。
 */
export interface ArgumentsHost {
  switchToHttp(): {
    getRequest(): Request
    getResponse(): Response
    getNext(): NextFunction
  }
}

/**
 * ExceptionFilter —— 异常过滤器接口（对应 Nest 源码中的 ExceptionFilter）。
 * 实现 catch(exception, host) 来处理异常并写回响应。
 */
export interface ExceptionFilter<T = any> {
  catch(exception: T, host: ArgumentsHost): any
}

/**
 * @Catch(...exceptions) —— 声明该过滤器捕获哪些异常类型。
 * 不传参数表示捕获「所有」异常(兜底过滤器)。
 *
 * 用法：
 *   @Catch(HttpException)        // 只处理 HttpException 及其子类
 *   @Catch()                     // 处理一切异常
 */
export function Catch(...exceptions: Function[]): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(CATCH_WATERMARK, exceptions, target)
  }
}

/** @UseFilters 接受的过滤器：已实例化的过滤器，或过滤器类(由框架按 DI 实例化) */
export type FilterParam = ExceptionFilter | (new (...args: any[]) => ExceptionFilter)

/**
 * @UseFilters(...filters) —— 把异常过滤器绑定到 controller 类或某个处理方法。
 *
 * 作用范围由装饰位置决定：
 *  - 加在方法上：只对该路由生效(方法级)；
 *  - 加在 controller 类上：对该 controller 的所有路由生效(控制器级)。
 *
 * 优先级：方法级 > 控制器级 > 全局(useGlobalFilters)。
 * 过滤器既可传实例，也可传类(类会被当作 provider 实例化，支持构造注入)。
 *
 * 用法：
 *   @UseFilters(new HttpExceptionFilter())
 *   @UseFilters(HttpExceptionFilter)
 */
export function UseFilters(...filters: FilterParam[]) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // 方法级：写到该处理方法上
      Reflect.defineMetadata(USE_FILTERS_WATERMARK, filters, descriptor.value)
    } else {
      // 控制器级：写到 controller 类上
      Reflect.defineMetadata(USE_FILTERS_WATERMARK, filters, target)
    }
  }
}
