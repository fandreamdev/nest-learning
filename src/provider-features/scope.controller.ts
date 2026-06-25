import { Controller, Get, Inject, Injectable, REQUEST, Scope } from '@nestjs/common'
import { Request } from 'express'

/**
 * REQUEST 作用域 controller 演示。
 *
 * @Injectable({ scope: Scope.REQUEST }) 让该 controller 每个 HTTP 请求新建一份(不再是单例)，
 * 并在构造里通过 @Inject(REQUEST) 拿到「本次请求」的 req 对象。
 *
 * 验证点：
 *  - id 每请求递增 → 证明确实每请求新建了一份实例(不是启动时建一次复用)；
 *  - path 为当前请求的 url → 证明 REQUEST token 解析为本次 req。
 *
 * 注(最小实现范围)：作用域只作用于 controller 自身 + REQUEST token；
 * 不做「作用域冒泡」，也不支持把普通 provider 标成 REQUEST(那需要请求级子容器)。
 */
@Controller('scope')
@Injectable({ scope: Scope.REQUEST })
export class ScopeController {
  // 每次构造自增，借此观察是否每请求都新建一份
  static counter = 0
  private readonly id: number

  constructor(@Inject(REQUEST) private readonly req: Request) {
    this.id = ++ScopeController.counter
  }

  @Get()
  check() {
    return { id: this.id, path: this.req.url }
  }
}
