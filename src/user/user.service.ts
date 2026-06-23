import { Injectable } from '@nestjs/common'

@Injectable
export class UserService {
  getUser() {
    console.log('userService getUser')
  }
}
