import { Inject } from '@nestjs/common'

export class LoggerService {
  log(message: string) {
    console.log('logger: ', message)
  }
}

export class UseValueService {
  log(message: string) {
    console.log('useValueService', message)
  }
}

export class UseFactoryService {
  constructor(private prefix: string) {}
  log(message: string) {
    console.log(this.prefix, 'useValueService', message)
  }
}

export class PrefixService {
  constructor(@Inject('PREFIX') private prefix: string) {}

  showPrefix() {
    console.log('show prefix', this.prefix)
  }
}
