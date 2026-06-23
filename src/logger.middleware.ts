import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { LoggerService } from './log.service'

/**
 * 类中间件示例：实现 NestMiddleware，构造里注入 LoggerService(走 DI)。
 * 命中注册的路由时打印请求方法与路径，再 next() 放行。
 */
@Injectable
export class LoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(`[class middleware] ${req.method} ${req.originalUrl}`)
    next()
  }
}

/** 函数式中间件示例：直接是一个 (req,res,next) 函数，无需 DI。 */
export function functionMiddleware(req: Request, res: Response, next: NextFunction) {
  console.log('[function middleware]', req.originalUrl)
  next()
}
