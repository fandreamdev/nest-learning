import { ArgumentMetadata, Inject, Injectable, PipeTransform } from '@nestjs/common'

@Injectable
export class MyPipe implements PipeTransform {
  constructor(@Inject('PREFIX') private prefix: string) {}
  transform(value: any, metadata: ArgumentMetadata) {
    console.log('prefix: ', this.prefix, ' value: ', value)
    return value
  }
}
