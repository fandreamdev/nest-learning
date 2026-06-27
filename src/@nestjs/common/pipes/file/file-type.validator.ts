import { FileValidator, IFile } from './file-validator'

/** FileTypeValidator 的配置 */
export interface FileTypeValidatorOptions {
  /** 允许的 MIME 类型：字符串(子串匹配)或正则(test 匹配) */
  fileType: string | RegExp
  /** 自定义错误消息 */
  message?: string
}

/**
 * FileTypeValidator —— 限制文件 MIME 类型（对应 Nest 源码中的 FileTypeValidator）。
 *
 * 与 Nest 一致：fileType 为字符串时按「子串包含」匹配，为正则时按 test 匹配。
 * 用法：
 *   new FileTypeValidator({ fileType: 'image/jpeg' })
 *   new FileTypeValidator({ fileType: /(jpg|jpeg|png)$/ })
 */
export class FileTypeValidator extends FileValidator<FileTypeValidatorOptions> {
  isValid(file?: IFile): boolean {
    if (!this.validationOptions || !file?.mimetype) {
      return false
    }
    const { fileType } = this.validationOptions
    return !!file.mimetype.match(fileType)
  }

  buildErrorMessage(): string {
    return (
      this.validationOptions.message ??
      `Validation failed (expected type is ${this.validationOptions.fileType})`
    )
  }
}
