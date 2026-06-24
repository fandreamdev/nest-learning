import { Header, HttpCode, Next, Param, Redirect, Res } from '@nestjs/common'
import { Post } from '@nestjs/common'
import { Req, Query, Session, Body, Controller, Get, Ip } from '@nestjs/common'
import {
  DefaultValuePipe,
  ParseArrayPipe,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseIntPipe,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { UserCreateDto } from './dto/user-creat.dto'
import { User } from './decorator/user.decorator'
import { Roles } from './decorator/roles.decorator'
import { RolesGuard } from './guard/roles.guard'

// 演示用枚举：ParseEnumPipe 校验入参是否为其合法成员
enum UserRole {
  Admin = 'admin',
  User = 'user',
}

@Controller('users')
export class UserController {
  @Get('req')
  handleRequest(@Req() request: Request, @Body() name: string, @Query('age') query: any) {
    console.log(request.url)
    console.log(request.path)
    console.log(request.method)
    console.log(query)
    return 'users'
  }

  @Get('session')
  handleSession(@Session() session: any, @Session('count') count: number, @Ip() ip: string) {
    console.log(session)
    console.log(count)
    if (session.count) {
      session.count++
    } else {
      session.count = 1
    }
    return 'session' + session.count + '-' + ip
  }

  @Get('params/:username/:age')
  handleParams(@Param() p: any, @Param('username') username: string) {
    console.log(p)
    console.log(username)
    return 'params'
  }

  // 参数级管道：@Param('id', ParseIntPipe) 把路径参数转成 number；
  // @Query 用 DefaultValuePipe 兜底后再 ParseBoolPipe，演示管道串联。
  @Get('detail/:id')
  handleDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query('active', new DefaultValuePipe('false'), ParseBoolPipe) active: boolean,
  ) {
    return { id, idType: typeof id, active, activeType: typeof active }
  }

  // ParseArrayPipe：items 是「元素目标类型」(Number)，非管道。
  // ?ids=1,2,3 先按逗号切，再逐元素由内部 ValidationPipe 转成 number。
  @Get('ids')
  handleIds(@Query('ids', new ParseArrayPipe({ items: Number, separator: ',' })) ids: number[]) {
    return { ids, allNumber: ids.every((i) => typeof i === 'number') }
  }

  // ParseEnumPipe：构造接收「枚举对象」UserRole，校验 ?role= 是否为其合法成员。
  // ?role=admin 通过；?role=guest 抛 400。
  @Get('role')
  handleRole(@Query('role', new ParseEnumPipe(UserRole)) role: UserRole) {
    return { role, isAdmin: role === UserRole.Admin }
  }

  // 守卫演示：@UseGuards(RolesGuard) 绑定守卫，@Roles('admin') 声明所需角色。
  // RolesGuard 注入 Reflector 读取 @Roles，与 req.user.roles(由 x-roles 头模拟)比对。
  // 带 x-roles: admin 头放行，否则抛 403。
  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('admin')
  handleAdmin() {
    return 'admin area'
  }

  // 方法级管道：@UsePipes(ValidationPipe) 对该方法所有参数生效，
  // 校验请求体是否符合 UserCreateDto 上声明的规则。
  @Post('create')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  handleBody(@Body() user: UserCreateDto) {
    console.log(user)
    return JSON.stringify(user)
  }

  @Get('res')
  handleResponse(@Res({ passthrough: true }) response: Response) {
    return 'response'
  }

  @Get('next')
  handleNext(@Next() next: NextFunction) {
    next()
    return 'response'
  }

  @Get('redirect')
  @Redirect('/users/res')
  handleRedirect() {
    return {
      url: 'https://www.baidu.com',
    }
  }

  @Get('headers')
  @Header('name', 'tom')
  @Header('age', '12')
  handleHeader() {
    return 'ok'
  }

  @Get('customParamsDecorator')
  customParamsDecorator(@User() user: UserCreateDto, @User('name') name: string) {
    console.log('customParamsDecoratorName: ', name)
    return user
  }
}
