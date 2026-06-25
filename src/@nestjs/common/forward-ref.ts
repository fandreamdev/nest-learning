/**
 * forwardRef —— 延迟引用包装（对应 Nest 源码中的 forwardRef）。
 *
 * 解决「装饰器执行时被引用的类还没定义」的问题——典型是两个类互相依赖(循环依赖)：
 * 模块加载顺序决定了其中一个在被引用时仍是 undefined。用 forwardRef(() => Xxx) 把引用
 * 包成一个惰性 thunk，框架在真正解析依赖时才调用 thunk 取到那时已定义好的类。
 *
 * 用法：
 *   constructor(@Inject(forwardRef(() => CatsService)) private cats: CatsService) {}
 */

/** forwardRef 的产物：带标记的惰性引用包装 */
export interface ForwardReference<T = any> {
  /** 调用它取到真正被引用的 token(类)。延迟到「解析依赖」时才执行，绕过定义顺序问题 */
  forwardRef: () => T
}

/** 把一个「返回 token 的函数」包装成 ForwardReference */
export function forwardRef<T = any>(fn: () => T): ForwardReference<T> {
  return { forwardRef: fn }
}

/** 判断一个值是否为 forwardRef 包装 */
export function isForwardReference(token: any): token is ForwardReference {
  return token && typeof token === 'object' && typeof token.forwardRef === 'function'
}

/** 若是 forwardRef 包装则解包取出真正 token，否则原样返回 */
export function resolveForwardRef(token: any): any {
  return isForwardReference(token) ? token.forwardRef() : token
}
