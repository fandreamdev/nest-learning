import 'reflect-metadata'
import { BadRequestException } from '../exceptions/http-exception'
import { ArgumentMetadata, PipeTransform } from './pipe-transform'
import { VALIDATION_OPTIONAL, VALIDATION_RULES, ValidationRule } from './validation-decorators'

/** ValidationPipe 的可选项(对齐 Nest 同名子集) */
export interface ValidationPipeOptions {
  /** 剥离 DTO 上没有声明校验规则的多余属性，默认 false */
  whitelist?: boolean
  /** 出现多余属性时直接报错(需配合 whitelist 语义)，默认 false */
  forbidNonWhitelisted?: boolean
  /** 是否对原始值做基础类型转换(string->number/boolean)，默认 false。对齐 transform 选项 */
  transform?: boolean
}

/** 这些原生构造器不是「类 DTO」，无需校验，直接放行(对齐 Nest 的 toValidate) */
const NATIVE_TYPES = [String, Boolean, Number, Array, Object]

/**
 * ValidationPipe —— 基于 DTO 元数据校验/转换请求数据（对应 Nest 源码中的 ValidationPipe）。
 *
 * 流程与真实 Nest 一致：
 *  1. toValidate：metatype 缺失或是原生类型(String/Number...)则跳过，原样返回；
 *  2. plainToInstance：把普通对象转成 DTO 实例(本实现并按需做基础类型转换)；
 *  3. validate：读取 DTO 上由校验装饰器登记的规则逐条执行，收集错误；
 *  4. 有错误则抛 BadRequestException(400)，错误结构对齐 Nest({statusCode,message[],error})。
 *
 * 注：真实 Nest 依赖 class-validator + class-transformer，这里用本项目的轻量
 * 校验装饰器([[validation-decorators]])作为等价替身，结构与职责保持一致。
 */
export class ValidationPipe implements PipeTransform<any> {
  constructor(private readonly options: ValidationPipeOptions = {}) {}

  async transform(value: any, metadata: ArgumentMetadata): Promise<any> {
    const { metatype } = metadata
    // 1) 没有 metatype 或是原生类型：没有 DTO 规则可校验。
    //    但开启 transform 时仍要做「原始类型转换」(对齐 Nest PR #4117)：
    //    metatype 是 Number/Boolean/String 时把字符串值转成对应原始类型。
    if (!metatype || !this.toValidate(metatype)) {
      return this.options.transform ? this.transformPrimitive(value, metatype) : value
    }

    // 2) plainToInstance：把普通对象塑造成 DTO 实例(便于按类读规则、支持基础类型转换)
    const object = this.plainToInstance(metatype, value)

    // 3) validate：执行该 DTO 类登记的全部规则
    const errors = this.validateObject(metatype, object)

    // 4) 有错误统一抛 400，结构对齐 Nest
    if (errors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: errors,
        error: 'Bad Request',
      })
    }
    return object
  }

  /** 仅对「自定义类 DTO」校验：原生构造器(String/Number...)与无 metatype 一律跳过 */
  private toValidate(metatype: Function): boolean {
    return !NATIVE_TYPES.includes(metatype as any)
  }

  /**
   * 原始类型转换(对齐 Nest PR #4117 的 transformPrimitive)：
   * 在 transform:true 下，把字符串值按 metatype 转成对应原始类型。
   *  - Number：能转数字就转，否则原样(交由后续/其它管道处理)；
   *  - Boolean：'true'/'false' -> 布尔；
   *  - String：转成字符串；
   * metatype 不是这三者(如 Object、undefined)则原样返回。
   */
  private transformPrimitive(value: any, metatype?: Function): any {
    if (value === null || value === undefined) return value
    if (metatype === Number) {
      const n = Number(value)
      return isNaN(n) ? value : n
    }
    if (metatype === Boolean) {
      if (value === 'true' || value === true) return true
      if (value === 'false' || value === false) return false
      return value
    }
    if (metatype === String) {
      return String(value)
    }
    return value
  }

  /**
   * 把普通对象转换成 DTO 实例并拷贝属性。
   * 开启 transform 时，按属性声明的规则做基础类型转换(string->number/boolean)，
   * 模拟 class-transformer 的隐式转换。
   */
  private plainToInstance(metatype: new (...args: any[]) => any, value: any): any {
    if (value === null || typeof value !== 'object') {
      return value
    }
    const instance = new metatype()
    const rules: Record<string, ValidationRule[]> =
      Reflect.getMetadata(VALIDATION_RULES, metatype) ?? {}

    for (const key of Object.keys(value)) {
      let v = value[key]
      // 基础类型转换：仅在开启 transform 时，依据该属性声明的规则推断目标类型
      if (this.options.transform) {
        v = this.coerce(v, rules[key])
      }
      instance[key] = v
    }
    return instance
  }

  /** 依据属性规则把字符串值粗略转成 number/boolean(供 transform: true 使用) */
  private coerce(value: any, rules?: ValidationRule[]): any {
    if (!rules || typeof value !== 'string') return value
    const messages = rules.map((r) => r.message)
    const wantsNumber = messages.some((m) => m.includes('number') || m.includes('integer'))
    const wantsBoolean = messages.some((m) => m.includes('boolean'))
    if (wantsNumber && value.trim() !== '' && !isNaN(Number(value))) return Number(value)
    if (wantsBoolean && (value === 'true' || value === 'false')) return value === 'true'
    return value
  }

  /**
   * 执行某 DTO 实例的全部校验规则，返回扁平的错误消息数组(对齐 Nest 的 message[])。
   * @IsOptional 标记的属性在值缺省(undefined/null)时跳过其余规则。
   */
  private validateObject(metatype: Function, object: any): string[] {
    const rules: Record<string, ValidationRule[]> =
      Reflect.getMetadata(VALIDATION_RULES, metatype) ?? {}
    const optional: Set<string> = Reflect.getMetadata(VALIDATION_OPTIONAL, metatype) ?? new Set()
    const errors: string[] = []

    for (const property of Object.keys(rules)) {
      const value = object?.[property]
      // 可选属性且未提供：跳过
      if (optional.has(property) && (value === undefined || value === null)) {
        continue
      }
      for (const rule of rules[property]) {
        if (!rule.validate(value)) {
          errors.push(rule.message.replace(/\$property/g, property))
        }
      }
    }
    return errors
  }
}
