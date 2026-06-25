import 'reflect-metadata'
import { SCOPE_METADATA } from './constant'

/**
 * Scope —— provider/controller 的作用域（对应 Nest 源码中的 Scope）。
 *
 * - DEFAULT：单例(本项目默认)，全应用一份，启动时实例化、缓存复用；
 * - REQUEST：请求级，每个 HTTP 请求新建一份，请求结束即丢弃。
 *
 * 注：本项目按「最小实现」只支持 DEFAULT 与 REQUEST，且作用域只作用于 controller
 * (及其通过 REQUEST token 拿当前请求)；不实现 TRANSIENT、不实现「作用域冒泡」。
 */
export enum Scope {
  DEFAULT = 'DEFAULT',
  REQUEST = 'REQUEST',
}

/** @Injectable 的可选项：目前只有 scope */
export interface InjectableOptions {
  scope?: Scope
}

/**
 * @Injectable(options?) —— 标记一个类可被 DI 容器管理（对应 Nest 源码中的 Injectable）。
 *
 * 兼容两种写法(本项目历史上大量使用「无括号」形式)：
 *  - @Injectable           裸用：参数就是被装饰的类，直接打默认作用域；
 *  - @Injectable()         空调用：等价默认作用域；
 *  - @Injectable({ scope })工厂调用：把作用域写进类元数据。
 *
 * 通过「第一个参数是不是函数(类)」区分裸用与工厂用：是函数即裸用，立即装饰。
 *
 * 用法：
 *   @Injectable                                // 单例(裸用)
 *   @Injectable()                              // 单例
 *   @Injectable({ scope: Scope.REQUEST })      // 请求级
 */
export function Injectable(optionsOrTarget?: InjectableOptions | Function): any {
  // 裸用 @Injectable：optionsOrTarget 就是被装饰的类，直接写默认作用域
  if (typeof optionsOrTarget === 'function') {
    Reflect.defineMetadata(SCOPE_METADATA, Scope.DEFAULT, optionsOrTarget)
    return
  }
  // 工厂用 @Injectable() / @Injectable({ scope })：返回真正的类装饰器
  const options = optionsOrTarget ?? {}
  return (target: any) => {
    Reflect.defineMetadata(SCOPE_METADATA, options.scope ?? Scope.DEFAULT, target)
  }
}

/** 读取某个类的作用域；未标注则按 DEFAULT */
export function getScope(target: any): Scope {
  return Reflect.getMetadata(SCOPE_METADATA, target) ?? Scope.DEFAULT
}
