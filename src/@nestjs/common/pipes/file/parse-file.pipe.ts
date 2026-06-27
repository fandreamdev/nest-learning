import { HttpException } from '../../exceptions/http-exception'
import { BadRequestException } from '../../exceptions/http-exception'
import { HttpStatus } from '../../exceptions/http-status.enum'
import { ArgumentMetadata, PipeTransform } from '../pipe-transform'
import { FileValidator, IFile } from './file-validator'

/** ParseFilePipe 的配置（对应 Nest 源码中的 ParseFileOptions） */
export interface ParseFileOptions {
  /** 一组文件校验器，按顺序执行，遇到第一个不通过即抛异常 */
  validators?: FileValidator[]
  /** 校验失败时使用的 HTTP 状态码，默认 400 */
  errorHttpStatusCode?: HttpStatus
  /** 自定义异常工厂：拿到错误消息后产出要抛的异常，覆盖默认行为 */
  exceptionFactory?: (error: string) => any
  /** 文件为空(未上传)时是否放行，默认 false(即缺文件视为错误) */
  fileIsRequired?: boolean
}

/**
 * ParseFilePipe —— 校验上传文件（对应 Nest 源码中的 ParseFilePipe）。
 *
 * 自身不含校验规则，规则来自构造时传入的一组 FileValidator(如 MaxFileSizeValidator、
 * FileTypeValidator)。transform 时按顺序逐个执行校验器，遇到第一个不通过的就用
 * exceptionFactory 抛异常；全部通过则原样返回文件。
 *
 * 用法(配合文件上传装饰器，如 @UploadedFile())：
 *   @UploadedFile(
 *     new ParseFilePipe({
 *       validators: [
 *         new MaxFileSizeValidator({ maxSize: 1024 * 1024 }),
 *         new FileTypeValidator({ fileType: 'image/jpeg' }),
 *       ],
 *     }),
 *   )
 *   file: Express.Multer.File
 */
export class ParseFilePipe implements PipeTransform<IFile | undefined> {
  private readonly validators: FileValidator[]
  private readonly fileIsRequired: boolean
  private readonly exceptionFactory: (error: string) => any

  constructor(options: ParseFileOptions = {}) {
    const {
      validators = [],
      errorHttpStatusCode = HttpStatus.BAD_REQUEST,
      exceptionFactory,
      fileIsRequired = true,
    } = options

    this.validators = validators
    this.fileIsRequired = fileIsRequired
    // 未提供工厂时，用 errorHttpStatusCode 构造默认异常(400 用语义化子类，其余用基类)
    this.exceptionFactory =
      exceptionFactory ??
      ((error: string) =>
        errorHttpStatusCode === HttpStatus.BAD_REQUEST
          ? new BadRequestException(error)
          : new HttpException(error, errorHttpStatusCode))
  }

  async transform(value: IFile | undefined, _metadata: ArgumentMetadata): Promise<IFile | undefined> {
    // 文件缺失处理：必填则报错，非必填则放行
    if (this.isFileMissing(value)) {
      if (this.fileIsRequired) {
        throw this.exceptionFactory('File is required')
      }
      return value
    }

    // 依次执行校验器，第一个不通过即抛异常(对齐 Nest 的 fail-fast)
    if (this.validators.length) {
      await this.validateFile(value as IFile)
    }
    return value
  }

  /** 逐个校验器执行，遇到第一个 isValid 为 false 的就抛异常 */
  private async validateFile(file: IFile): Promise<void> {
    for (const validator of this.validators) {
      const valid = await validator.isValid(file)
      if (!valid) {
        throw this.exceptionFactory(validator.buildErrorMessage(file))
      }
    }
  }

  /** 判断文件是否「缺失」：undefined/null，或空对象(无任何键) */
  private isFileMissing(value: IFile | undefined): boolean {
    return value == null || (typeof value === 'object' && Object.keys(value).length === 0)
  }
}
