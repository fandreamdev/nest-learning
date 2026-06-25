import 'reflect-metadata'
import { OPTIONAL_DEPS_METADATA } from './constant'

/**
 * @Optional() —— 标记某个依赖为「可选」（对应 Nest 源码中的 Optional）。
 *
 * 默认情况下，依赖解析不到(token 在该模块不可见或未注册)会直接报错。加了 @Optional()
 * 后，这个位置的依赖若解析不到，框架会注入 undefined 而非抛错——适合「有就用、没有就算了」
 * 的可选依赖(如可选的配置、可选的日志器)。
 *
 * 按构造参数下标记录，Injector 解析该参数失败时据此放行。
 *
 * 用法：
 *   constructor(@Optional() @Inject('CONFIG') private config?: Config) {}
 */
export function Optional() {
  return function optionalDecorator(
    target: any,
    _propertyKey: string | symbol | undefined,
    parameterIndex?: number,
  ) {
    if (typeof parameterIndex !== 'number') return
    const optional = Reflect.getMetadata(OPTIONAL_DEPS_METADATA, target) ?? []
    optional[parameterIndex] = true
    Reflect.defineMetadata(OPTIONAL_DEPS_METADATA, optional, target)
  }
}
