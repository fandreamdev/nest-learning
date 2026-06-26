import 'reflect-metadata'

/**
 * @SetMetadata(key, value) —— 把任意自定义元数据写到 controller 类或处理方法上
 * （对应 Nest 源码中的 SetMetadata）。
 *
 * 它是「元数据」与「读取它的守卫/拦截器」之间的桥梁：业务用它(或基于它封装的
 * 语义化装饰器，如 @Roles)声明需求，守卫再用 Reflector 把它读出来做决策。
 *
 * 作用范围由装饰位置决定：方法上 -> 写到方法；类上 -> 写到类。
 *
 * 用法：
 *   @SetMetadata('roles', ['admin'])            // 直接用
 *   export const Roles = (...roles: string[]) => SetMetadata('roles', roles)  // 封装语义化装饰器
 */
export function SetMetadata(metadataKey: any, metadataValue: any) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(metadataKey, metadataValue, descriptor.value)
    } else {
      Reflect.defineMetadata(metadataKey, metadataValue, target)
    }
    return descriptor ?? target
  }
}
