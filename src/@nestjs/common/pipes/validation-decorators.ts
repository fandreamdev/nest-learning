import 'reflect-metadata'

/**
 * 轻量校验装饰器 —— class-validator 的极简自实现替身。
 *
 * 真实 Nest 的 ValidationPipe 依赖 class-validator(@IsString/@IsInt...) + class-transformer。
 * 本项目未引入这两个库，这里提供一组同名同义的装饰器，把「规则」以元数据记到属性上，
 * 由 ValidationPipe 读取并执行。规则模型与 class-validator 对齐：每条规则是
 * 「校验函数 + 失败消息」，@IsOptional 标记的属性在值缺省时跳过其余规则。
 */

/** 写在 DTO 类上的元数据 key：属性名 -> 该属性的规则列表 */
export const VALIDATION_RULES = 'validation:rules'
/** 写在 DTO 类上的元数据 key：被 @IsOptional 标记的属性名集合 */
export const VALIDATION_OPTIONAL = 'validation:optional'

export interface ValidationRule {
  /** 返回 true 表示通过 */
  validate: (value: any) => boolean
  /** 校验失败时的消息，$property 会被替换成属性名 */
  message: string
}

/** 往「类」上按属性追加一条校验规则 */
function addRule(target: any, property: string, rule: ValidationRule) {
  const ctor = target.constructor
  const rules: Record<string, ValidationRule[]> = Reflect.getMetadata(VALIDATION_RULES, ctor) ?? {}
  const list = rules[property] ?? []
  list.push(rule)
  rules[property] = list
  Reflect.defineMetadata(VALIDATION_RULES, rules, ctor)
}

/** @IsOptional —— 属性可缺省：值为 undefined/null 时跳过该属性的其余规则 */
export function IsOptional(): PropertyDecorator {
  return (target, property) => {
    const ctor = (target as any).constructor
    const optional: Set<string> = Reflect.getMetadata(VALIDATION_OPTIONAL, ctor) ?? new Set()
    optional.add(property as string)
    Reflect.defineMetadata(VALIDATION_OPTIONAL, optional, ctor)
  }
}

/** @IsString —— 必须是字符串 */
export function IsString(): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'string',
      message: '$property must be a string',
    })
}

/** @IsNumber —— 必须是数字(非 NaN) */
export function IsNumber(): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'number' && !isNaN(v),
      message: '$property must be a number',
    })
}

/** @IsInt —— 必须是整数 */
export function IsInt(): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => Number.isInteger(v),
      message: '$property must be an integer number',
    })
}

/** @IsBoolean —— 必须是布尔值 */
export function IsBoolean(): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'boolean',
      message: '$property must be a boolean value',
    })
}

/** @MinLength(n) —— 字符串最小长度 */
export function MinLength(min: number): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'string' && v.length >= min,
      message: `$property must be longer than or equal to ${min} characters`,
    })
}

/** @MaxLength(n) —— 字符串最大长度 */
export function MaxLength(max: number): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'string' && v.length <= max,
      message: `$property must be shorter than or equal to ${max} characters`,
    })
}

/** @Min(n) —— 数值最小值 */
export function Min(min: number): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'number' && v >= min,
      message: `$property must not be less than ${min}`,
    })
}

/** @Max(n) —— 数值最大值 */
export function Max(max: number): PropertyDecorator {
  return (target, property) =>
    addRule(target, property as string, {
      validate: (v) => typeof v === 'number' && v <= max,
      message: `$property must not be greater than ${max}`,
    })
}
