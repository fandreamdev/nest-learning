import 'reflect-metadata'
import { INJECT_TOKEN } from './constant'
export function Inject(token: string) {
  return function injectDecorator(
    target: any,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) {
    const existingInjectedTokens = Reflect.getMetadata(INJECT_TOKEN, target) ?? []
    existingInjectedTokens[parameterIndex] = token
    Reflect.defineMetadata(INJECT_TOKEN, existingInjectedTokens, target)
  }
}
