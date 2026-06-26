import { Injectable, NestMiddleware } from '@nestjs/common'

@Injectable
export class UserMiddleware implements NestMiddleware {
  use(req: any, res: any, next: (error?: any) => void) {
    ;(req as any).user = {
      name: 'tom1',
      age: 100,
      // 模拟鉴权层写入的角色：从 x-roles 头取(逗号分隔)，供 RolesGuard 演示判定
      roles: ((req.headers['x-roles'] as string) ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
    }
    next()
  }
}
