import 'reflect-metadata'
import { INJECT_TOKEN, PROPERTY_DEPS_METADATA } from './constant'

/**
 * @Inject(token) —— 显式指定注入的 token（对应 Nest 源码中的 Inject）。
 *
 * 两种使用位置，由参数装饰器/属性装饰器的调用签名区分：
 *  - 构造参数上：按参数下标把 token 记到类的 INJECT_TOKEN 元数据(原有行为)；
 *  - 类属性上：把 { key: 属性名, token } 追加到 PROPERTY_DEPS_METADATA，
 *    由 Injector 在 new 之后做「属性注入」——给该属性赋上解析出的实例。
 *
 * token 既可是字符串/类，也可是 forwardRef(() => Xxx)(循环依赖时延迟取类)。
 */
export function Inject(token: any) {
  return function injectDecorator(
    target: any,
    propertyKey?: string | symbol,
    parameterIndex?: number,
  ) {
    // 构造参数注入：parameterIndex 是数字 → 按下标记录到「构造类」上
    if (typeof parameterIndex === 'number') {
      const existingInjectedTokens = Reflect.getMetadata(INJECT_TOKEN, target) ?? []
      existingInjectedTokens[parameterIndex] = token
      Reflect.defineMetadata(INJECT_TOKEN, existingInjectedTokens, target)
      return
    }

    // 属性注入：装饰在实例属性上 → target 是「原型」，元数据记到其 constructor(类)上，
    // 与 Injector 读取端(按类读 PROPERTY_DEPS_METADATA)对齐。
    if (propertyKey !== undefined) {
      const ctor = target.constructor
      const properties = Reflect.getMetadata(PROPERTY_DEPS_METADATA, ctor) ?? []
      properties.push({ key: propertyKey, token })
      Reflect.defineMetadata(PROPERTY_DEPS_METADATA, properties, ctor)
    }
  }
}
