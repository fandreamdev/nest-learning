import { IsInt, IsString, Min, MinLength } from '@nestjs/common'

export class UserCreateDto {
  // 用本项目内置的轻量校验装饰器(class-validator 的等价替身)声明规则，
  // 配合 ValidationPipe 在进入处理方法前自动校验请求体。
  @IsString()
  @MinLength(2)
  name!: string

  @IsInt()
  @Min(0)
  age!: number
}
