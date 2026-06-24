import { SetMetadata } from '@nestjs/common'

/** 该路由放行所需的角色，写到类/方法上，供 RolesGuard 通过 Reflector 读取 */
export const ROLES_KEY = 'roles'

/**
 * @Roles(...roles) —— 声明访问某路由所需的角色。
 * 基于通用的 @SetMetadata 封装的语义化装饰器(对齐 Nest 文档里的示例)。
 *
 * 用法：@Roles('admin')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
