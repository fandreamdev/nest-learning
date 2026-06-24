import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeParam, PipeTransform } from './pipe-transform'

/** ParseArrayPipe 的可选项 */
export interface ParseArrayPipeOptions {
  /** 数组每个元素再交给这个管道类逐个转换(如 ParseIntPipe -> number[]) */
  items?: new (...args: any[]) => PipeTransform
  /** 当 value 是字符串时，用该分隔符切分成数组，默认逗号 */
  separator?: string
  /** 是否允许空数组，默认 true */
  optional?: boolean
}

/**
 * ParseArrayPipe —— 把入参规整成数组，并可对每个元素再做转换（对应 Nest 源码中的 ParseArrayPipe）。
 *
 * 既能处理本就是数组的值，也能把 'a,b,c' 这类字符串按分隔符切成数组；
 * 若给了 items 管道，则对每个元素逐个 transform(常配 ParseIntPipe 得到 number[])。
 */
export class ParseArrayPipe implements PipeTransform<any, any[]> {
  private readonly itemPipe?: PipeTransform
  private readonly separator: string
  private readonly optional: boolean

  constructor(options: ParseArrayPipeOptions = {}) {
    this.itemPipe = options.items ? new options.items() : undefined
    this.separator = options.separator ?? ','
    this.optional = options.optional ?? true
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

    if (!this.itemPipe) return array
    // 逐个元素过 items 管道(可能 async)，元数据沿用本参数的，但 type 视为该元素
    return Promise.all(
      array.map((item) => this.itemPipe!.transform(item, { ...metadata, type: metadata.type })),
    )
  }
}
