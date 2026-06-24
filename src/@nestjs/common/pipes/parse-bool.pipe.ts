import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'

/**
 * ParseBoolPipe —— 把入参转成布尔值（对应 Nest 源码中的 ParseBoolPipe）。
 * 只接受 'true'/'false'(或对应布尔值)，其它一律抛 BadRequestException。
 */
export class ParseBoolPipe implements PipeTransform<string | boolean, boolean> {
  transform(value: string | boolean, metadata: ArgumentMetadata): boolean {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    throw new BadRequestException(`Validation failed (boolean string is expected)`)
  }
}
