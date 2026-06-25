import { Module } from '@nestjs/common'
import { ProviderFeaturesController } from './provider-features.controller'
import { ScopeController } from './scope.controller'
import { CircularA } from './circular-a.service'
import { CircularB } from './circular-b.service'
import { PropInjectService } from './prop-inject.service'

/**
 * 演示模块：循环依赖(forwardRef)、可选依赖(@Optional)、属性注入(@Inject 在属性上)、
 * 以及 REQUEST 作用域 controller(ScopeController)。
 */
@Module({
  controllers: [ProviderFeaturesController, ScopeController],
  providers: [CircularA, CircularB, PropInjectService],
})
export class ProviderFeaturesModule {}
