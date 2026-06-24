import { ArgumentMetadata, PipeTransform } from './pipe-transform'

/**
 * DefaultValuePipe —— 给「空值」兜底默认值（对应 Nest 源码中的 DefaultValuePipe）。
 *
 * 当入参为 undefined / null(如未传的 @Query)时，用构造时给定的默认值替代；
 * 否则原样透传。常与其它管道串联：@Query('page', new DefaultValuePipe(1), ParseIntPipe)。
 */
export class DefaultValuePipe<T = any> implements PipeTransform<T> {
  constructor(private readonly defaultValue: T) {}

  transform(value: T, metadata: ArgumentMetadata): T {
    if (value === undefined || value === null) {
      return this.defaultValue
    }
    return value
  }
}
