import 'reflect-metadata'
import {
  PATH_METADATA,
  METHOD_METADATA,
  REDIRECT_URL_METADATA,
  REDIRECT_STATUS_METADATA,
  HTTP_CODE_METADATA,
  HEADERS_METADATA,
} from './constant'
export function Get(path: string = '') {
  return function getDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata(PATH_METADATA, path, descriptor.value)
    Reflect.defineMetadata(METHOD_METADATA, 'GET', descriptor.value)
  }
}

export function Post(path: string = '') {
  return function getDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata(PATH_METADATA, path, descriptor.value)
    Reflect.defineMetadata(METHOD_METADATA, 'POST', descriptor.value)
  }
}

export function Redirect(url: string = '/', status: number = 302) {
  return function redirectDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata(REDIRECT_URL_METADATA, url, descriptor.value)
    Reflect.defineMetadata(REDIRECT_STATUS_METADATA, status, descriptor.value)
  }
}

export function HttpCode(status: number = 302) {
  return function httpCodeDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata(HTTP_CODE_METADATA, status, descriptor.value)
  }
}

export function Header(key: string, value: string) {
  return function httpCodeDecorator(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, descriptor.value) ?? []
    headers.push({
      key,
      value,
    })
    Reflect.defineMetadata(HEADERS_METADATA, headers, descriptor.value)
  }
}
