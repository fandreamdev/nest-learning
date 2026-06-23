import 'reflect-metadata'

export interface ParamMetadata {
  parameterIndex: number
  key: string
  factory: Function
  data?: any
}

export const createParamDecorator = (keyOrFactory: string | Function) => {
  return (data?: any) => (target: any, propertyKey: string, parameterIndex: number) => {
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
  }
}

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
