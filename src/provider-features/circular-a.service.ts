import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common'
import { CircularB } from './circular-b.service'

/**
 * CircularA —— 与 CircularB 互相注入(循环依赖)。
 *
 * 注意：循环依赖的两个类必须分处不同文件。否则同文件内 class 声明的 TDZ(暂时性死区)
 * 会让 TS 发出的 design:paramtypes 在装饰阶段就访问到尚未初始化的对方类而抛错。
 * 分文件后，跨模块引用在加载完成前是 undefined(不抛错)，forwardRef 再延迟取到真身。
 */
@Injectable
export class CircularA {
  constructor(
    // 构造注入 B：B 此刻可能仍在构造中 → 注入惰性代理，访问成员时才转发到真身
    @Inject(forwardRef(() => CircularB)) private readonly b: CircularB,
    // 可选依赖：'NON_EXISTENT' 未注册，@Optional 让它注入 undefined 而非抛错
    @Optional() @Inject('NON_EXISTENT') private readonly maybe?: any,
  ) {}

  whoAmI() {
    return 'A'
  }

  // 在方法里使用循环依赖：此时 B 已构造完成，代理透明转发
  pingB(): string {
    return `A -> ${this.b.whoAmI()}`
  }

  hasOptional(): boolean {
    return this.maybe !== undefined
  }
}
