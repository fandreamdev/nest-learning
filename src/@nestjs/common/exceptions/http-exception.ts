import { HttpStatus } from './http-status.enum'

/**
 * HttpException —— 所有 HTTP 异常的基类（对应 Nest 源码中的 HttpException）。
 *
 * 携带两样东西：HTTP 状态码 + 响应体(response)。
 * response 可以是字符串(简单消息)或对象(自定义结构)，由过滤器决定如何写回。
 *
 * 业务里 throw new HttpException('xx', 400)，或用下方的语义化子类
 * (NotFoundException 等)，最终都会被全局异常过滤器统一捕获并格式化。
 */
export class HttpException extends Error {
  constructor(
    private readonly response: string | Record<string, any>,
    private readonly status: number,
  ) {
    // Error 的 message 取响应体里的可读消息，方便日志
    super(typeof response === 'string' ? response : (response as any)?.message ?? 'Http Exception')
    this.name = this.constructor.name
  }

  getStatus(): number {
    return this.status
  }

  /** 取响应体：字符串原样返回，对象原样返回(由过滤器决定如何包装) */
  getResponse(): string | Record<string, any> {
    return this.response
  }
}

/**
 * 语义化子类：本质都是「预设了状态码」的 HttpException。
 * 第一个参数允许覆盖默认消息(字符串或对象)。
 */
export class BadRequestException extends HttpException {
  constructor(response: string | Record<string, any> = 'Bad Request') {
    super(response, HttpStatus.BAD_REQUEST)
  }
}

export class UnauthorizedException extends HttpException {
  constructor(response: string | Record<string, any> = 'Unauthorized') {
    super(response, HttpStatus.UNAUTHORIZED)
  }
}

export class ForbiddenException extends HttpException {
  constructor(response: string | Record<string, any> = 'Forbidden') {
    super(response, HttpStatus.FORBIDDEN)
  }
}

export class NotFoundException extends HttpException {
  constructor(response: string | Record<string, any> = 'Not Found') {
    super(response, HttpStatus.NOT_FOUND)
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(response: string | Record<string, any> = 'Internal Server Error') {
    super(response, HttpStatus.INTERNAL_SERVER_ERROR)
  }
}
