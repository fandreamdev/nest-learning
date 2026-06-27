import { FileValidator, IFile } from './file-validator'

/** MaxFileSizeValidator 的配置 */
export interface MaxFileSizeValidatorOptions {
  /** 允许的最大字节数(含)；超过即不通过 */
  maxSize: number
  /** 自定义错误消息：可传字符串，或根据 maxSize 动态生成 */
  message?: string | ((maxSize: number) => string)
}

/**
 * MaxFileSizeValidator —— 限制文件大小（对应 Nest 源码中的 MaxFileSizeValidator）。
 *
 * 用法：new MaxFileSizeValidator({ maxSize: 1024 * 1024 }) // 最大 1MB
 */
export class MaxFileSizeValidator extends FileValidator<MaxFileSizeValidatorOptions> {
  isValid(file?: IFile): boolean {
    if (!this.validationOptions || !file) {
      return false
    }
    return file.size <= this.validationOptions.maxSize
  }

  buildErrorMessage(): string {
    const { message, maxSize } = this.validationOptions
    if (typeof message === 'function') {
      return message(maxSize)
    }
    if (message) {
      return message
    }
    return `Validation failed (expected size is less than ${maxSize})`
  }
}
