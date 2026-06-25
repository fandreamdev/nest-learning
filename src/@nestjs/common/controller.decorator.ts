import 'reflect-metadata'
import { Constructor } from '.'
import { CONTROLLER_PREFIX_METADATA } from './constant'

interface ControllerOptions {
  prefix?: string
}

export function Controller(): ClassDecorator
export function Controller(prefix: string): ClassDecorator
export function Controller(options: ControllerOptions): ClassDecorator
export function Controller(prefixOrOptions?: string | ControllerOptions) {
  let options: ControllerOptions = {}
  if (typeof prefixOrOptions === 'string') {
    options.prefix = prefixOrOptions
  } else if (typeof prefixOrOptions === 'object') {
    options = prefixOrOptions
  } else {
    options.prefix = ''
  }
  return function controllerDecorator(target: Constructor) {
    Reflect.defineMetadata(CONTROLLER_PREFIX_METADATA, options.prefix || '', target)
  }
}
