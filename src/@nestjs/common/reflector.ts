import 'reflect-metadata'

/**
 * Reflector —— 元数据读取工具（对应 Nest 源码中的 Reflector）。
 *
 * 守卫/拦截器通过它，从 @SetMetadata(及其封装的语义化装饰器如 @Roles)写在
 * controller 类或处理方法上的元数据里取值。它本身是个可注入的 provider：
 * 由框架自动登记，守卫在构造里注入即可使用。
 *
 * 提供与 Nest 同名的读取方法：
 *  - get：从单个目标读取；
 *  - getAllAndOverride：方法/类两处都读，「方法优先」取第一个有值的(覆盖语义)；
 *  - getAllAndMerge：方法/类两处都读并合并(数组拼接 / 对象浅合并)。
 */
export class Reflector {
  /** 从单个目标(类或方法)读取某 key 的元数据 */
  get<T = any>(metadataKey: string, target: Function): T {
    return Reflect.getMetadata(metadataKey, target) as T
  }

  /**
   * 在多个目标(通常是 [handler, class])上读取，取「第一个有值」的——方法级覆盖控制器级。
   * 适合「就近覆盖」语义：方法上声明了就用方法的，否则回退到类上的。
   */
  getAllAndOverride<T = any>(metadataKey: string, targets: Function[]): T | undefined {
    for (const target of targets) {
      const value = Reflect.getMetadata(metadataKey, target)
      if (value !== undefined && value !== null) {
        return value as T
      }
    }
    return undefined
  }

  /**
   * 在多个目标上读取并合并：数组则拼接，对象则浅合并，其它取最后一个非空值。
   * 适合「叠加」语义：类上和方法上的元数据都生效。
   */
  getAllAndMerge<T = any>(metadataKey: string, targets: Function[]): T {
    const values = targets
      .map((target) => Reflect.getMetadata(metadataKey, target))
      .filter((v) => v !== undefined && v !== null)

    if (values.length === 0) return [] as unknown as T

    if (values.every((v) => Array.isArray(v))) {
      return ([] as any[]).concat(...values) as unknown as T
    }
    if (values.every((v) => typeof v === 'object')) {
      return Object.assign({}, ...values) as T
    }
    return values[values.length - 1] as T
  }
}
