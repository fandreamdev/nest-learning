import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'

/**
 * ParseFloatPipe —— 把入参转成浮点数（对应 Nest 源码中的 ParseFloatPipe）。
 * 能转就返回 number，不能转就抛 BadRequestException。
 */
export class ParseFloatPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const isNumeric =
      ['string', 'number'].includes(typeof value) &&
      value != null &&
      !isNaN(parseFloat(String(value))) &&
      isFinite(value as any)
    if (!isNumeric) {
      throw new BadRequestException(`Validation failed (numeric string is expected)`)
    }
    return parseFloat(String(value))
  }
}
