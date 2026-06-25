import 'reflect-metadata'
import {
  PATH_METADATA,
  METHOD_METADATA,
  REDIRECT_URL_METADATA,
  REDIRECT_STATUS_METADATA,
  HTTP_CODE_METADATA,
  HEADERS_METADATA,
} from './constant'

/**
 * 生成「HTTP 方法装饰器」的工厂（对应 Nest 源码中的 RequestMapping）。
 *
 * @Get/@Post/@Put/@Delete/@Patch/@Options/@Head 的逻辑完全一致——只是写入的
 * METHOD_METADATA 值不同。统一由本工厂按给定的 HTTP 动词产出装饰器，避免逐个复制样板：
 * 把路径写进 PATH_METADATA、把动词写进 METHOD_METADATA，路由解析时据此注册到 express。
 */
const createMappingDecorator = (method: string) => (path: string = '') => {
  return function methodDecorator(
    _target: any,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata(PATH_METADATA, path, descriptor.value)
    Reflect.defineMetadata(METHOD_METADATA, method, descriptor.value)
  }
}

export const Get = createMappingDecorator('GET')
export const Post = createMappingDecorator('POST')
export const Put = createMappingDecorator('PUT')
export const Delete = createMappingDecorator('DELETE')
export const Patch = createMappingDecorator('PATCH')
export const Options = createMappingDecorator('OPTIONS')
export const Head = createMappingDecorator('HEAD')

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
