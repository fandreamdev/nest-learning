import 'reflect-metadata'

/** @UsePipes 写在 controller 类 / 处理方法上的元数据 key：记录绑定的管道 */
export const USE_PIPES_WATERMARK = 'use:pipes'

/**
 * 参数装饰器(@Body/@Query/@Param...)上额外存放的「参数级管道」元数据 key。
 * 与 params 元数据分开存：管道按参数下标存放，转换时按下标取出。
 */
export const PARAM_PIPES_METADATA = 'pipes:param'

/**
 * 参数的「类型」——对应 Nest 的 Paramtype。
 * 表示这个值来自请求的哪个部分，管道可据此决定是否处理(如 ValidationPipe 只校验 body)。
 *  - body：@Body          - query：@Query
 *  - param：@Param        - custom：自定义参数装饰器 / @Req @Res 等其它来源
 */
export type Paramtype = 'body' | 'query' | 'param' | 'custom'

/**
 * ArgumentMetadata —— 传给管道 transform 的第二个参数（对应 Nest 源码中的 ArgumentMetadata）。
 *
 * 描述「正在被处理的这个参数」的元信息，管道据此判断要不要处理、怎么处理：
 *  - type：参数来源(body/query/param/custom)
 *  - metatype：参数的 TS 类型构造器(如 UserCreateDto、Number)，来自 design:paramtypes，可能为 undefined
 *  - data：装饰器传入的字符串(如 @Query('age') 里的 'age')
 */
export interface ArgumentMetadata {
  type: Paramtype
  metatype?: new (...args: any[]) => any
  data?: string
}

/**
 * PipeTransform —— 管道接口（对应 Nest 源码中的 PipeTransform）。
 *
 * 管道是带 transform 方法的类(或对象)，对路由处理方法的「参数值」做两件事之一：
 *  - 转换(transformation)：把输入值变成期望的形式(如 '123' -> 123)；
 *  - 校验(validation)：值合法就原样返回，不合法就抛异常(通常 BadRequestException)。
 *
 * transform 接收原始值 value 与该参数的元信息 metadata，返回处理后的值(可为 Promise)。
 */
export interface PipeTransform<T = any, R = any> {
  transform(value: T, metadata: ArgumentMetadata): R | Promise<R>
}

/** @UsePipes 接受的管道：已实例化的管道，或管道类(由框架按 DI 实例化) */
export type PipeParam = PipeTransform | (new (...args: any[]) => PipeTransform)

/**
 * @UsePipes(...pipes) —— 把管道绑定到 controller 类或某个处理方法。
 *
 * 作用范围由装饰位置决定：
 *  - 加在方法上：只对该路由的参数生效(方法级)；
 *  - 加在 controller 类上：对该 controller 所有路由的参数生效(控制器级)。
 *
 * 执行顺序：全局 -> 控制器级 -> 方法级 -> 参数级(@Body(pipe) 等)，值依次串行流过。
 * 管道既可传实例，也可传类(类会被当作 provider 实例化，支持构造注入)。
 *
 * 用法：
 *   @UsePipes(new ValidationPipe())
 *   @UsePipes(ValidationPipe)
 */
export function UsePipes(...pipes: PipeParam[]) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // 方法级：写到该处理方法上
      Reflect.defineMetadata(USE_PIPES_WATERMARK, pipes, descriptor.value)
    } else {
      // 控制器级：写到 controller 类上
      Reflect.defineMetadata(USE_PIPES_WATERMARK, pipes, target)
    }
  }
}
