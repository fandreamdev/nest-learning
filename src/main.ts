import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import session from 'express-session'
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // 全局异常过滤器已通过 AppModule 的 APP_FILTER provider 注册(走 DI)，此处无需再 useGlobalFilters
  app.use(
    session({
      secret: 'xxxxxxx', // 用于加密会话的秘钥
      resave: false, // 在每次请求结束后是否强制保存会话，即使他没有改变
      saveUninitialized: false, // 是否保存未初始化的会话
      cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 定义会话的cookie配置，设置cookie的最大存活时间是一天
    }),
  )
  await app.listen(3000)
}

bootstrap()
