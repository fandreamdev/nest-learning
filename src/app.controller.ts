import { Controller, Get, Inject } from '@nestjs/common'
import { HttpException, HttpStatus, NotFoundException, UseFilters } from '@nestjs/common'
import { LoggerService, PrefixService, UseFactoryService, UseValueService } from './log.service'
import { UserService } from './user/user.service'
import { OtherService } from './other/other.service'
import { HttpExceptionFilter } from './http-exception.filter'

@Controller()
export class AppController {
  constructor(
    private loggerService: LoggerService,
    @Inject('useValue') private useValueService: UseValueService,
    @Inject('useFactory') private useFactoryService: UseFactoryService,
    private userService: UserService,
    private otherService: OtherService,
    @Inject('CONFIG_OPTIONS') private configOptions: Record<string, any>,
    @Inject('OTHER_CONFIG') private otherConfig: string,
    private prefixService: PrefixService,
  ) {}
  @Get('')
  async index() {
    this.loggerService.log('hello')
    this.useValueService.log('world')
    this.useFactoryService.log('nihao1')
    this.userService.getUser()
    return 'hello'
  }

  @Get('config')
  async config() {
    // 返回动态模块 ConfigModule.forRoot 传入的运行时配置，验证动态模块生效
    this.configOptions['other'] = this.otherConfig
    return this.configOptions
  }

  @Get('other')
  async other() {
    this.otherService.log('other')
  }

  @Get('exception')
  async exception() {
    // 非 HttpException 的普通错误：会被全局过滤器兜底为 500
    throw new Error('未识别')
  }

  @Get('http-exception')
  @UseFilters(HttpExceptionFilter)
  async httpException() {
    // 方法级 @UseFilters(HttpExceptionFilter)：本路由的 HttpException 由它处理(优先于全局)
    throw new HttpException({ message: '自定义错误', code: 'E_CUSTOM' }, HttpStatus.BAD_REQUEST)
  }

  @Get('not-found')
  async notFound() {
    // 语义化子类：等价于 HttpException('xxx', 404)
    throw new NotFoundException('资源不存在')
  }

  @Get('prefix')
  async prefixPage() {
    this.prefixService.showPrefix()
    return 'ok'
  }
}
