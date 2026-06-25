import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { CircularA } from './circular-a.service'

/**
 * CircularB —— 与 CircularA 互相注入(循环依赖)，分处不同文件见 circular-a.service 说明。
 */
@Injectable
export class CircularB {
  // 反向构造注入 A，同样用 forwardRef 闭环
  constructor(@Inject(forwardRef(() => CircularA)) private readonly a: CircularA) {}

  whoAmI() {
    return 'B'
  }

  pingA(): string {
    return `B -> ${this.a.whoAmI()}`
  }
}
