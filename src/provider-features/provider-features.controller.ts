import { Controller, Get } from '@nestjs/common'
import { CircularA } from './circular-a.service'
import { CircularB } from './circular-b.service'
import { PropInjectService } from './prop-inject.service'

/**
 * 验证「更多 provider 特性」是否生效的演示路由。
 */
@Controller('provider-features')
export class ProviderFeaturesController {
  constructor(
    private readonly a: CircularA,
    private readonly b: CircularB,
    private readonly prop: PropInjectService,
  ) {}

  @Get()
  check() {
    return {
      circular: {
        aPingB: this.a.pingB(), // 'A -> B'：A 通过循环依赖代理调到 B
        bPingA: this.b.pingA(), // 'B -> A'：B 通过循环依赖代理调到 A
      },
      optional: this.a.hasOptional(), // false：未注册的可选依赖注入为 undefined
      propertyInjection: this.prop.reachA(), // 'prop -> A'：属性注入到位
    }
  }
}
