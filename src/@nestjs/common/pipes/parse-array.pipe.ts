import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'
import { ValidationPipe } from './validation.pipe'

/** ParseArrayPipe 的可选项 */
export interface ParseArrayPipeOptions {
  /**
   * 每个元素的「目标类型」(对齐 Nest，注意不是管道类)：
   * 可为原始类型构造器(Number/Boolean/String)，也可为 DTO 类。
   * 元素会以它作为 metatype 交给内部 ValidationPipe(transform:true) 转换/校验。
   * 例：new ParseArrayPipe({ items: Number }) => number[]
   */
  items?: new (...args: any[]) => any
  /** 当 value 是字符串时，用该分隔符切分成数组，默认逗号 */
  separator?: string
  /** 是否允许空值(undefined/null)，true 时空值返回空数组，默认 false */
  optional?: boolean
}

/**
 * ParseArrayPipe —— 把入参规整成数组，并可对每个元素做转换/校验（对应 Nest 源码中的 ParseArrayPipe）。
 *
 * 与真实 Nest 一致：items 是「元素目标类型」而非管道。本管道内部持有一个
 * ValidationPipe(transform:true)，把字符串按 separator 切成数组后，对每个元素以
 * items 作为 metatype 调用该 ValidationPipe —— 原始类型(Number/Boolean/String)走
 * 原始类型转换，DTO 类走 plainToInstance + 规则校验。这样无需另造「元素管道」。
 */
export class ParseArrayPipe implements PipeTransform<any, any[]> {
  // 内部复用的校验管道：逐元素转换/校验都委托给它(对齐 Nest 的做法)
  private readonly validationPipe = new ValidationPipe({ transform: true })
  private readonly separator: string
  private readonly optional: boolean

  constructor(private readonly options: ParseArrayPipeOptions = {}) {
    this.separator = options.separator ?? ','
    this.optional = options.optional ?? false
  }

  async transform(value: any, metadata: ArgumentMetadata): Promise<any[]> {
    if (value === undefined || value === null) {
      if (this.optional) return []
      throw new BadRequestException('Validation failed (array is expected)')
    }

    // 字符串按分隔符切；本就是数组则原样用；其它类型不接受
    let array: any[]
    if (Array.isArray(value)) {
      array = value
    } else if (typeof value === 'string') {
      array = value.split(this.separator)
    } else {
      throw new BadRequestException('Validation failed (array is expected)')
    }

    // 未指定元素类型：仅完成「切成数组」，元素原样返回
    if (!this.options.items) return array

    // 逐个元素委托内部 ValidationPipe：以 items 作为该元素的 metatype，沿用本参数来源类型。
    // 元素若是 DTO 校验失败，ValidationPipe 会抛 BadRequestException 冒泡出去。
    return Promise.all(
      array.map((item) =>
        this.validationPipe.transform(item, {
          type: metadata.type,
          metatype: this.options.items,
          data: metadata.data,
        }),
      ),
    )
  }
}
