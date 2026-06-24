import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'

/** ParseEnumPipe 的可选项 */
export interface ParseEnumPipeOptions {
  /** 值为 undefined/null 时是否放行(原样返回)，默认 false */
  optional?: boolean
  /** 自定义异常工厂：校验失败时用它产出要抛的异常，默认抛 BadRequestException */
  exceptionFactory?: (error: string) => any
}

/**
 * ParseEnumPipe —— 校验入参是否为某枚举的合法成员（对应 Nest 源码中的 ParseEnumPipe）。
 *
 * 与真实 Nest 一致：构造接收「枚举对象本身」(不是类型)，transform 时取该枚举的所有「值」，
 * 判断入参是否命中其一；命中则原样返回，否则交给 exceptionFactory 抛异常(默认 400)。
 *
 * 用法：
 *   enum Role { Admin = 'admin', User = 'user' }
 *   @Query('role', new ParseEnumPipe(Role)) role: Role
 */
export class ParseEnumPipe<T = any> implements PipeTransform<T> {
  private readonly exceptionFactory: (error: string) => any

  constructor(
    private readonly enumType: T,
    private readonly options: ParseEnumPipeOptions = {},
  ) {
    if (!enumType) {
      // 对齐 Nest：未传枚举对象属于使用错误，构造期直接报错
      throw new Error('ParseEnumPipe: "enumType" is required but was not provided')
    }
    this.exceptionFactory =
      options.exceptionFactory || ((error: string) => new BadRequestException(error))
  }

  async transform(value: T, metadata: ArgumentMetadata): Promise<T> {
    // optional 且为空值：放行(对齐 Nest，不做强校验)
    if (this.options.optional && (value === undefined || value === null)) {
      return value
    }
    if (!this.isEnum(value)) {
      throw this.exceptionFactory('Validation failed (enum string is expected)')
    }
    return value
  }

  /**
   * 判断 value 是否为枚举的合法成员：取枚举对象的所有值，看是否包含 value。
   * 与 Nest 同：数值枚举存在反向映射(键->名)，这里不额外过滤，名与值均可命中(宽松匹配)。
   */
  private isEnum(value: T): boolean {
    const enumValues = Object.keys(this.enumType as object).map(
      (key) => (this.enumType as any)[key],
    )
    return enumValues.includes(value)
  }
}
