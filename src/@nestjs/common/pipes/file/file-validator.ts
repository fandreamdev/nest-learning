import { ArgumentMetadata } from '../pipe-transform'

/**
 * IFile —— ParseFilePipe / 校验器眼中的「文件」最小形状（对应 Nest 源码中的 IFile）。
 *
 * 真实上传文件(如 multer 的 Express.Multer.File)字段很多，但校验只关心这几样：
 *  - mimetype：MIME 类型(如 'image/png')，FileTypeValidator 据此判断
 *  - size：字节大小，MaxFileSizeValidator 据此判断
 *  - 其余字段(originalname/buffer 等)用宽松索引签名兜住，不强制
 */
export interface IFile {
  mimetype: string
  size: number
  [key: string]: any
}

/**
 * FileValidator —— 文件校验器抽象基类（对应 Nest 源码中的 FileValidator）。
 *
 * ParseFilePipe 本身不含校验规则，规则由一个个 FileValidator 提供。
 * 每个校验器持有自己的配置(validationOptions)，实现两件事：
 *  - isValid(file)：判断文件是否通过本条规则(可同步或异步)；
 *  - buildErrorMessage(file)：不通过时给出可读的错误消息。
 *
 * 自定义校验器只需继承它并实现这两个方法，即可塞进 ParseFilePipe 的 validators。
 */
export abstract class FileValidator<TOptions = Record<string, any>> {
  constructor(protected readonly validationOptions: TOptions) {}

  /** 文件是否通过本条校验；返回 false(或 reject)表示不通过 */
  abstract isValid(file?: IFile): boolean | Promise<boolean>

  /** 校验不通过时，用于拼装异常消息 */
  abstract buildErrorMessage(file?: IFile): string
}

/** 透传给 ParseFilePipe，校验器内部不需要 metadata，这里仅占位对齐签名 */
export type FileValidatorMetadata = ArgumentMetadata
