import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Reflector,
} from '@nestjs/common'
import { ROLES_KEY } from '../decorator/roles.decorator'

/**
 * RolesGuard —— 基于角色的访问守卫（对齐 Nest 文档中的 RolesGuard 示例）。
 *
 * 通过注入的 Reflector，从「方法 / 控制器类」上读取 @Roles 声明的所需角色，
 * 再与当前请求用户(req.user.roles)持有的角色比对：满足其一则放行，否则返回 false
 * (框架据此抛 403)。未声明 @Roles 的路由视为公开，直接放行。
 */
@Injectable
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 方法优先、其次控制器类：取「就近」声明的所需角色
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    // 没声明所需角色：公开路由，放行
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }
    // 取当前请求用户的角色(由鉴权中间件/守卫提前写到 req 上，这里用 mock 的 req.user)
    const req = context.switchToHttp().getRequest()
    const userRoles: string[] = (req as any).user?.roles ?? []
    // 用户拥有任一所需角色即放行
    return requiredRoles.some((role) => userRoles.includes(role))
  }
}
