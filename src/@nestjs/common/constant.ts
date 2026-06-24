export const INJECT_TOKEN = 'injectTokens'

/**
 * APP_PIPE —— 以「provider 方式」注册全局管道的特殊 token（与 APP_FILTER 对称）。
 *
 * 在任意模块的 providers 里写 { provide: APP_PIPE, useClass: XxPipe } 即可把
 * XxPipe 注册为全局管道。相比 app.useGlobalPipes(new XxPipe())，它走 DI 容器实例化，
 * 因此可以在构造里注入其它 provider；同一 token 可登记多个。
 */
export const APP_PIPE = 'APP_PIPE'

/**
 * APP_GUARD —— 以「provider 方式」注册全局守卫的特殊 token（与 APP_FILTER / APP_PIPE 对称）。
 *
 * 在任意模块的 providers 里写 { provide: APP_GUARD, useClass: XxGuard } 即可把
 * XxGuard 注册为全局守卫。相比 app.useGlobalGuards(new XxGuard())，它走 DI 容器实例化，
 * 因此可以在构造里注入其它 provider(如 Reflector)；同一 token 可登记多个。
 */
export const APP_GUARD = 'APP_GUARD'
