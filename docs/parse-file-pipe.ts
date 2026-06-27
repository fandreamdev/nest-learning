/**
 * ParseFilePipe 示例 —— 校验上传文件
 *
 * 运行: npm run example --silent docs/parse-file-pipe.ts
 *
 * 演示: 大小校验 / 类型校验 / 缺文件(必填与非必填) / 自定义状态码
 */
import {
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  IFile,
} from '../src/@nestjs/common'
import { HttpStatus } from '../src/@nestjs/common/exceptions/http-status.enum'
import { ArgumentMetadata } from '../src/@nestjs/common'

const meta: ArgumentMetadata = { type: 'custom' }

// 造两个假文件
const okFile: IFile = { mimetype: 'image/jpeg', size: 500 * 1024, originalname: 'a.jpg' } // 500KB jpeg
const bigPng: IFile = { mimetype: 'image/png', size: 5 * 1024 * 1024, originalname: 'b.png' } // 5MB png

async function run() {
  // ① 全部通过: 1MB 限制 + jpeg, okFile 满足
  const pipe = new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: 1024 * 1024 }),
      new FileTypeValidator({ fileType: 'image/jpeg' }),
    ],
  })
  console.log('① 合法文件:', (await pipe.transform(okFile, meta))?.originalname)

  // ② 超过大小: bigPng 5MB > 1MB
  try {
    await pipe.transform(bigPng, meta)
  } catch (e: any) {
    console.log('② 大小不过:', e.message, '| status =', e.getStatus())
  }

  // ③ 类型不符: 只允许 jpeg, 给 png(用正则也行)
  const typePipe = new ParseFilePipe({
    validators: [new FileTypeValidator({ fileType: /image\/(jpg|jpeg)/ })],
  })
  try {
    await typePipe.transform(bigPng, meta)
  } catch (e: any) {
    console.log('③ 类型不过:', e.message)
  }

  // ④ 缺文件 + 必填(默认): 抛错
  try {
    await pipe.transform(undefined, meta)
  } catch (e: any) {
    console.log('④ 缺文件(必填):', e.message)
  }

  // ⑤ 缺文件 + 非必填: 放行返回 undefined
  const optionalPipe = new ParseFilePipe({ fileIsRequired: false })
  console.log('⑤ 缺文件(非必填):', await optionalPipe.transform(undefined, meta))

  // ⑥ 自定义状态码: 422 而非 400
  const pipe422 = new ParseFilePipe({
    validators: [new MaxFileSizeValidator({ maxSize: 1024 })],
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  })
  try {
    await pipe422.transform(okFile, meta)
  } catch (e: any) {
    console.log('⑥ 自定义状态码:', e.message, '| status =', e.getStatus())
  }
}

run()
