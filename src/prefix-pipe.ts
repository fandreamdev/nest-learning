import { ArgumentMetadata, Inject, Injectable, PipeTransform } from '@nestjs/common'

@Injectable
export class MyPipe implements PipeTransform {
  constructor(@Inject('PREFIX') private prefix: string) {}
  transform(value: any, metadata: ArgumentMetadata) {
    if (typeof value === 'string') {
      value = this.prefix + value
    }
    return value
  }
}
