import clc from 'cli-color'
export class Logger {
  private static lastLogTime = Date.now()
  static log(message: string, context: string = '') {
    const timestamp = new Date().toLocaleString()
    const pid = process.pid
    const currentTime = Date.now()
    const interval = currentTime - this.lastLogTime
    console.log(
      `[${clc.green('Nest')}] ${clc.green(pid)}  ${clc.green('-')} ${timestamp}   ${clc.green('LOG')} ${clc.yellow(`[${context}]`)} ${clc.green(message)} ${clc.yellow(`+${interval}ms`)}`,
    )
    this.lastLogTime = currentTime
  }

  /** 错误日志：红色输出，供异常处理等场景使用 */
  static error(message: string, context: string = '') {
    const timestamp = new Date().toLocaleString()
    const pid = process.pid
    const currentTime = Date.now()
    const interval = currentTime - this.lastLogTime
    console.error(
      `[${clc.red('Nest')}] ${clc.red(pid)}  ${clc.red('-')} ${timestamp}   ${clc.red('ERROR')} ${clc.yellow(`[${context}]`)} ${clc.red(message)} ${clc.yellow(`+${interval}ms`)}`,
    )
    this.lastLogTime = currentTime
  }
}
