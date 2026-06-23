import { Injectable } from '@nestjs/common'
import { UserService } from '../user/user.service'

@Injectable
export class OtherService {
  constructor(private userService: UserService) {}

  log(message: string) {
    console.log('print in other')
    this.userService.getUser()
    console.log('otherService:', message)
  }
}
