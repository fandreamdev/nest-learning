import 'reflect-metadata'
import { ArgumentMetadata, PipeTransform } from '@nestjs/common'

/**
 * PipesConsumer —— 管道执行器（对应 Nest 源码中的 PipesConsumer）。
 *
 * 两个职责：
 *  1. 持有「全局管道」实例(useGlobalPipes / APP_PIPE 注册的)，供路由解析时取用；
 *  2. apply：把某个参数值依次喂给一串管道(全局->控制器->方法->参数级)，串行 await，
 *     前一个管道的输出作为后一个的输入，得到最终实参。
 *
 * 与 Nest 一致：管道链按上述顺序执行，任一管道抛异常都会中断并冒泡给异常处理。
 */
export class PipesConsumer {
  // 全局管道实例，按注册顺序存放，最先作用于参数值
  private readonly globalPipes: PipeTransform[] = []

  /** 追加一批全局管道(useGlobalPipes / APP_PIPE 调用) */
  addGlobalPipes(pipes: PipeTransform[]) {
    this.globalPipes.push(...pipes)
  }

  /** 取全局管道(供路由解析时拼到每个参数的管道链最前面) */
  getGlobalPipes(): PipeTransform[] {
    return this.globalPipes
  }

  /**
   * 把一个参数值依次流过给定管道链，返回最终值。
   * @param value    参数原始值(从 req 解析出来的)
   * @param metadata 该参数的元信息(type/metatype/data)
   * @param pipes    已排好序的管道链(全局 + 控制器 + 方法 + 参数级)
   */
  async apply(value: any, metadata: ArgumentMetadata, pipes: PipeTransform[]): Promise<any> {
    let result = value
    for (const pipe of pipes) {
      // 串行 await：管道可能是 async(如 ValidationPipe)，且后一个依赖前一个的输出
      result = await pipe.transform(result, metadata)
    }
    return result
  }
}
