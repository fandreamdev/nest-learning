import 'reflect-metadata'
import { Constructor } from '.'

export type ProviderType =
  | Function
  | { provide: string; useValue: any }
  | { provide: string; useClass: Function }
  | { provide: string; useFactory: Function; inject: any[] }

interface ModuleMetadata {
  // imports 项可以是：静态模块类、同步返回的 DynamicModule，
  // 或异步动态模块 forRootAsync 返回的 Promise<DynamicModule>(扫描阶段会被 await 解析)
  imports?: (Function | DynamicModule | Promise<DynamicModule>)[]
  controllers?: Function[]
  providers?: ProviderType[]
  // exports 既可以导出 provider 定义本身，也可以只写它的 token(字符串/symbol/类)
  exports?: (ProviderType | string | symbol)[]
}

/**
 * DynamicModule —— 动态模块配置对象。
 *
 * 与静态模块(直接 import 一个 @Module 类)不同，动态模块通过模块类上的静态方法
 * (约定俗成如 forRoot / forFeature / register)在「运行时」返回这样一个对象，
 * 从而根据传入的 options 动态决定该模块的 providers / exports 等。
 *
 * - module：该配置所属的模块类(必填)，作为这批动态元数据的归属锚点
 * - global：为 true 时等价于给该模块加 @Global()，其 exports 全局可见
 * 其余字段语义与 @Module 装饰器中的同名字段一致，会与类上静态声明的元数据合并。
 */
export interface DynamicModule extends ModuleMetadata {
  module: Function
  global?: boolean
}


export function Module(moduleMetadata: ModuleMetadata) {
  return function moduleDecorator(target: Constructor) {
    Reflect.defineMetadata('controllers', moduleMetadata.controllers, target)
    Reflect.defineMetadata('providers', moduleMetadata.providers, target)
    Reflect.defineMetadata('imports', moduleMetadata.imports, target)
    Reflect.defineMetadata('exports', moduleMetadata.exports, target)

    Reflect.defineMetadata('isModule', true, target)
  }
}
