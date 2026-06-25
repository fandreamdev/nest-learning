import { Inject, Injectable } from '@nestjs/common'
import { CircularA } from './circular-a.service'

/**
 * PropInjectService —— 属性注入演示：@Inject 写在属性上，不走构造函数，
 * 由框架在 new 之后回填该属性。
 */
@Injectable
export class PropInjectService {
  @Inject(CircularA)
  private readonly circularA!: CircularA

  reachA(): string {
    return `prop -> ${this.circularA.whoAmI()}`
  }
}
