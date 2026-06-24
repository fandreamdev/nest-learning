import 'reflect-metadata'
import { PipeParam, Paramtype, PARAM_PIPES_METADATA } from './pipes/pipe-transform'

export interface ParamMetadata {
  parameterIndex: number
  key: string
  factory: Function
  data?: any
}

/** key('Body'/'Query'/...) -> 该参数来源对应的 Paramtype，供管道的 ArgumentMetadata 使用 */
const KEY_TO_PARAMTYPE: Record<string, Paramtype> = {
  Body: 'body',
  Query: 'query',
  Param: 'param',
}

/**
 * 把某个参数声明的管道(@Body(pipe) / @Query('age', pipe) 里写的)登记到方法上，
 * 按参数下标存放。与 params 元数据分开存，转换时按下标取出对应管道链。
 */
function definePipesForParam(target: any, propertyKey: string, parameterIndex: number, pipes: PipeParam[]) {
  if (!pipes.length) return
  const existing = Reflect.getMetadata(PARAM_PIPES_METADATA, target, propertyKey) || []
  existing[parameterIndex] = pipes
  Reflect.defineMetadata(PARAM_PIPES_METADATA, existing, target, propertyKey)
}

/**
 * createParamDecorator —— 生成参数装饰器（对应 Nest 的 createParamDecorator 与内置参数装饰器工厂）。
 *
 * 返回的装饰器签名兼容 Nest：第一个参数可为 data(字符串，如 @Query('age'))，其后跟若干管道；
 * 也可省略 data 直接传管道(如 @Body(ValidationPipe))。管道按参数下标登记，运行时对该参数值生效。
 */
export const createParamDecorator = (keyOrFactory: string | Function) => {
  return (dataOrPipe?: any, ...rest: PipeParam[]) =>
    (target: any, propertyKey: string, parameterIndex: number) => {
      // 区分第一个参数是 data(字符串) 还是直接传入的管道：
      // 字符串当 data，其余为管道；否则第一个参数起都视为管道，data 为 undefined。
      const isData = typeof dataOrPipe === 'string'
      const data = isData ? dataOrPipe : undefined
      const pipes = isData ? rest : [dataOrPipe, ...rest].filter(Boolean)

      const existingParams = Reflect.getMetadata(`params:${propertyKey}`, target, propertyKey) || []
      if (keyOrFactory instanceof Function) {
        existingParams[parameterIndex] = {
          parameterIndex,
          key: 'DecoratorFactory',
          factory: keyOrFactory,
          data,
        }
      } else {
        existingParams[parameterIndex] = { parameterIndex, key: keyOrFactory, data }
      }
      Reflect.defineMetadata(`params:${propertyKey}`, existingParams, target, propertyKey)

      definePipesForParam(target, propertyKey, parameterIndex, pipes)
    }
}

/** 由参数装饰器的 key 推断它的 Paramtype；未列出的(@Req/@Res 等)归为 custom */
export const getParamtype = (key: string): Paramtype => KEY_TO_PARAMTYPE[key] ?? 'custom'

export const Request = createParamDecorator('Request')
export const Req = Request
export const Response = createParamDecorator('Response')
export const Res = Response
export const Body = createParamDecorator('Body')
export const Query = createParamDecorator('Query')
export const Headers = createParamDecorator('Headers')
export const Session = createParamDecorator('Session')
export const Ip = createParamDecorator('Ip')
export const Param = createParamDecorator('Param')
export const Next = createParamDecorator('Next')
