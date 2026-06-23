import { APP_FILTER, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { AppController } from './app.controller'
import { LoggerService, UseFactoryService, UseValueService } from './log.service'
import { UserModule } from './user/user.module'
import { OtherModule } from './other/other.module'
import { ConfigModule } from './config/config.module'
import { LoggerMiddleware, functionMiddleware } from './logger.middleware'
import { AllExceptionsFilter } from './all-exceptions.filter'

@Module({
  imports: [
    UserModule,
    OtherModule,
    ConfigModule.forRootAsync({
      // forRootAsync 返回 Promise<DynamicModule>：先异步拿到配置，再据此组装模块。
      // 扫描阶段会 await 这个 Promise，解析出真正的 DynamicModule 后登记。
      load: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { folder: '.env', debug: true, source: 'async' }
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    LoggerService,
    {
      provide: 'PREFIX',
      useValue: 'prefix1',
    },
    {
      provide: 'useValue',
      useClass: UseValueService,
    },
    {
      provide: 'useFactory',
      inject: ['PREFIX'],
      useFactory: (prefix: string) => new UseFactoryService(prefix),
    },
    {
      // APP_FILTER：以 provider 方式注册全局过滤器，走 DI(过滤器可注入 LoggerService)
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * 注册中间件：
   *  - LoggerMiddleware(类中间件，注入 LoggerService) 作用于所有路由，但排除 /config
   *  - functionMiddleware(函数中间件) 只作用于 GET /users 前缀
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .exclude({ path: '/config', method: RequestMethod.GET })
      .forRoutes('*')

    consumer.apply(functionMiddleware).forRoutes({ path: '/users', method: RequestMethod.GET })
  }
}
