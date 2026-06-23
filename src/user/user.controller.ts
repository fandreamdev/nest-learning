import { Header, HttpCode, Next, Param, Redirect, Res } from '@nestjs/common'
import { Post } from '@nestjs/common'
import { Req, Query, Session, Body, Controller, Get, Ip } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { UserCreateDto } from './dto/user-creat.dto'
import { User } from './decorator/user.decorator'

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

  @Post('create')
  @HttpCode(200)
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
