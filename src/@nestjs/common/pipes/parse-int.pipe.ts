import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'

/**
 * ParseIntPipe —— 把入参转成整数（对应 Nest 源码中的 ParseIntPipe）。
 *
 * 用于确保参数是合法整数：能转就返回 number，不能转就抛 BadRequestException。
 * 典型场景：@Param('id', ParseIntPipe) id: number —— 路径参数本是字符串，转成数字交给方法。
 */
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    // Nest 用 isNaN + 严格数字判断：仅接受能完整表示为整数的字符串
    const isNumeric =
      ['string', 'number'].includes(typeof value) &&
      value != null &&
      /^-?\d+$/.test(String(value).trim())
    if (!isNumeric) {
      throw new BadRequestException(
        `Validation failed (numeric string is expected)`,
      )
    }
    return parseInt(String(value), 10)
  }
}
