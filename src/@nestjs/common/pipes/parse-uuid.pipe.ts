import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'

/** ParseUUIDPipe 的可选项：限定 UUID 版本(3/4/5)，不传则接受任意版本 */
export interface ParseUUIDPipeOptions {
  version?: '3' | '4' | '5'
}

// 不同版本 UUID 的正则(对齐 Nest 内部使用的 uuid 校验规则)
const UUID_REGEX: Record<string, RegExp> = {
  '3': /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  '4': /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  '5': /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  all: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
}

/**
 * ParseUUIDPipe —— 校验入参是否为合法 UUID（对应 Nest 源码中的 ParseUUIDPipe）。
 * 合法则原样返回字符串，非法抛 BadRequestException。可通过 version 限定具体版本。
 */
export class ParseUUIDPipe implements PipeTransform<string, string> {
  private readonly version: string

  constructor(options: ParseUUIDPipeOptions = {}) {
    this.version = options.version ?? 'all'
  }

  transform(value: string, metadata: ArgumentMetadata): string {
    const regex = UUID_REGEX[this.version] ?? UUID_REGEX.all
    if (typeof value !== 'string' || !regex.test(value)) {
      throw new BadRequestException(
        `Validation failed (uuid${this.version === 'all' ? '' : ' v' + this.version} is expected)`,
      )
    }
    return value
  }
}
