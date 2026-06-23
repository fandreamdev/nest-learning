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
