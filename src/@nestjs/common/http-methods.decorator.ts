import 'reflect-metadata'
export function Get(path: string = '') {
  return function getDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('path', path, descriptor.value)
    Reflect.defineMetadata('method', 'GET', descriptor.value)
  }
}

export function Post(path: string = '') {
  return function getDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('path', path, descriptor.value)
    Reflect.defineMetadata('method', 'POST', descriptor.value)
  }
}

export function Redirect(url: string = '/', status: number = 302) {
  return function redirectDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('redirectUrl', url, descriptor.value)
    Reflect.defineMetadata('redirectStatusCode', status, descriptor.value)
  }
}

export function HttpCode(status: number = 302) {
  return function httpCodeDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('httpCode', status, descriptor.value)
  }
}

export function Header(key: string, value: string) {
  return function httpCodeDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const headers = Reflect.getMetadata('httpHeaders', descriptor.value) ?? []
    headers.push({
      key,
      value,
    })
    Reflect.defineMetadata('httpHeaders', headers, descriptor.value)
  }
}
