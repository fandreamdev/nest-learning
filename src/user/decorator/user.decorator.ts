import { ArgumentsHost } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'

export const User = createParamDecorator((data: any, ctx: ArgumentsHost) => {
  const request: any = ctx.switchToHttp().getRequest()
  return data ? request.user[data] : request.user
})
