import {
  BeforeApplicationShutdown,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Logger } from '@nestjs/core'

/**
 * LifecycleService —— 生命周期钩子演示。
 *
 * 实现全部 5 个钩子，启动/关闭时打印日志，直观展示触发时机与顺序：
 *  启动：onModuleInit -> onApplicationBootstrap
 *  关闭：onModuleDestroy -> beforeApplicationShutdown -> onApplicationShutdown
 */
@Injectable
export class LifecycleService
  implements
    OnModuleInit,
    OnApplicationBootstrap,
    OnModuleDestroy,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  onModuleInit() {
    Logger.log('onModuleInit', 'LifecycleService')
  }

  onApplicationBootstrap() {
    Logger.log('onApplicationBootstrap', 'LifecycleService')
  }

  onModuleDestroy() {
    Logger.log('onModuleDestroy', 'LifecycleService')
  }

  beforeApplicationShutdown(signal?: string) {
    Logger.log(`beforeApplicationShutdown (signal=${signal})`, 'LifecycleService')
  }

  onApplicationShutdown(signal?: string) {
    Logger.log(`onApplicationShutdown (signal=${signal})`, 'LifecycleService')
  }
}
