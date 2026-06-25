import 'reflect-metadata'
import { GLOBAL_MODULE_WATERMARK } from './constant'

export function Global() {
  return function globalDecorator(target: any) {
    Reflect.defineMetadata(GLOBAL_MODULE_WATERMARK, true, target)
  }
}
