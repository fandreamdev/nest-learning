/**
 * 全局常量登记处 —— 所有「元数据 key」与「特殊注入 token」的唯一定义来源。
 *
 * 设计原则：任何 Reflect.defineMetadata / getMetadata 用到的字符串 key，以及 APP_* 这类
 * 特殊 token，都集中在此定义；其它文件一律从这里 import，杜绝「写入方与读取方各写一遍
 * 字符串字面量」导致的拼写漂移。装饰器负责「写」、core 负责「读」，两端共享同一常量。
 */

// ——— 依赖注入(DI) ———

/** @Inject('token') 写在类上的元数据 key：按参数下标记录显式指定的注入 token */
export const INJECT_TOKEN = 'injectTokens'

/** TS 的 emitDecoratorMetadata 自动写入的「构造/方法参数类型」key(内置约定，值固定) */
export const PARAMTYPES_METADATA = 'design:paramtypes'

// ——— 模块系统 ———

/** @Module 写在模块类上：标记「这是一个模块」 */
export const MODULE_WATERMARK = 'isModule'
/** @Global / 动态模块 global:true：标记「该模块导出的 token 全局可见」 */
export const GLOBAL_MODULE_WATERMARK = 'isGlobal'
/** @Module({ controllers }) 元数据 key */
export const CONTROLLERS_METADATA = 'controllers'
/** @Module({ providers }) 元数据 key */
export const PROVIDERS_METADATA = 'providers'
/** @Module({ imports }) 元数据 key */
export const IMPORTS_METADATA = 'imports'
/** @Module({ exports }) 元数据 key */
export const EXPORTS_METADATA = 'exports'

/** getModuleMetadata 可读取的模块元数据 key 联合类型 */
export type ModuleMetadataKey =
  | typeof CONTROLLERS_METADATA
  | typeof PROVIDERS_METADATA
  | typeof IMPORTS_METADATA
  | typeof EXPORTS_METADATA

// ——— 控制器 / 路由 ———

/** @Controller(prefix) 写在 controller 类上的路由前缀 */
export const CONTROLLER_PREFIX_METADATA = 'prefix'
/** @Get/@Post... 写在处理方法上的 HTTP 方法(GET/POST...) */
export const METHOD_METADATA = 'method'
/** @Get/@Post... 写在处理方法上的路径 */
export const PATH_METADATA = 'path'
/** @HttpCode 写在处理方法上的响应状态码 */
export const HTTP_CODE_METADATA = 'httpCode'
/** @Header 写在处理方法上的响应头列表 */
export const HEADERS_METADATA = 'httpHeaders'
/** @Redirect 写在处理方法上的重定向目标 URL */
export const REDIRECT_URL_METADATA = 'redirectUrl'
/** @Redirect 写在处理方法上的重定向状态码 */
export const REDIRECT_STATUS_METADATA = 'redirectStatusCode'

// ——— 参数装饰器 ———

/**
 * 参数元数据 key 的前缀：实际 key 为 `params:<方法名>`，按方法各存一份(参数按下标排布)。
 * 用函数生成，避免「写入方与读取方各拼一次模板字符串」。
 */
export const routeParamsMetadataKey = (propertyKey: string | symbol) =>
  `params:${String(propertyKey)}`
/** 参数级管道(@Body(pipe) / @Query('age', pipe))写在方法上的元数据 key(按参数下标存放) */
export const PARAM_PIPES_METADATA = 'pipes:param'

// ——— 增强器(Enhancers)的 @UseXxx 水印 ———

/** @Catch(...) 写在过滤器类上：声明该过滤器捕获的异常类型 */
export const CATCH_WATERMARK = 'catch:exceptions'
/** @UseFilters(...) 写在类/方法上：绑定的异常过滤器 */
export const USE_FILTERS_WATERMARK = 'use:filters'
/** @UsePipes(...) 写在类/方法上：绑定的管道 */
export const USE_PIPES_WATERMARK = 'use:pipes'
/** @UseGuards(...) 写在类/方法上：绑定的守卫 */
export const USE_GUARDS_WATERMARK = 'use:guards'
/** @UseInterceptors(...) 写在类/方法上：绑定的拦截器 */
export const USE_INTERCEPTORS_WATERMARK = 'use:interceptors'

// ——— 全局增强器的 provider 注册 token ———

/**
 * APP_FILTER —— 以「provider 方式」注册全局异常过滤器的特殊 token。
 *
 * 在任意模块的 providers 里写 { provide: APP_FILTER, useClass: XxFilter } 即可把
 * XxFilter 注册为全局过滤器。相比 app.useGlobalFilters(new XxFilter())，它走 DI 容器
 * 实例化，因此可以在构造里注入其它 provider；同一 token 可登记多个。
 */
export const APP_FILTER = 'APP_FILTER'

/**
 * APP_PIPE —— 以「provider 方式」注册全局管道的特殊 token（与 APP_FILTER 对称）。
 * 用法：{ provide: APP_PIPE, useClass: XxPipe }，走 DI，可注入其它 provider，可登记多个。
 */
export const APP_PIPE = 'APP_PIPE'

/**
 * APP_GUARD —— 以「provider 方式」注册全局守卫的特殊 token（与 APP_FILTER 对称）。
 * 用法：{ provide: APP_GUARD, useClass: XxGuard }，走 DI，可注入其它 provider(如 Reflector)。
 */
export const APP_GUARD = 'APP_GUARD'

/**
 * APP_INTERCEPTOR —— 以「provider 方式」注册全局拦截器的特殊 token（与 APP_FILTER 对称）。
 * 用法：{ provide: APP_INTERCEPTOR, useClass: XxInterceptor }，走 DI，可注入其它 provider。
 */
export const APP_INTERCEPTOR = 'APP_INTERCEPTOR'
