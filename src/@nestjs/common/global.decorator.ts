import 'reflect-metadata'

export function Global() {
  return function globalDecorator(target: any) {
    Reflect.defineMetadata('isGlobal', true, target)
  }
}
