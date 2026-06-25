import 'reflect-metadata'

/**
 * 生命周期钩子接口（对应 Nest 源码中的 lifecycle hooks）。
 *
 * 这些钩子不在请求链路上，而是挂在「应用启动」与「应用关闭」两个时间窗口。
 * provider 实现对应接口的方法，框架会在恰当时机依次调用(可为 async，框架会 await)。
 *
 * 触发顺序：
 *  启动：所有 provider 实例化完毕后  -> onModuleInit -> onApplicationBootstrap
 *  关闭：app.close()/进程信号触发    -> onModuleDestroy -> beforeApplicationShutdown -> onApplicationShutdown
 * 关闭阶段按「初始化的逆序」调用，符合「后建先拆」的直觉。
 */

/**
 * OnModuleInit —— 模块依赖就绪后调用。
 * 此时该 provider 的依赖都已实例化完毕，适合做依赖到位后的初始化(如建立连接、预热缓存)。
 */
export interface OnModuleInit {
  onModuleInit(): any | Promise<any>
}

/**
 * OnApplicationBootstrap —— 所有模块初始化完成、应用即将开始监听前调用。
 * 比 onModuleInit 更晚：那时整个应用的 provider 都已 init 过，适合做需要「全局就绪」的启动逻辑。
 */
export interface OnApplicationBootstrap {
  onApplicationBootstrap(): any | Promise<any>
}

/**
 * OnModuleDestroy —— 应用关闭流程的第一步，逐个 provider 收到销毁通知。
 * 适合释放该 provider 自己持有的资源(定时器、连接等)。
 */
export interface OnModuleDestroy {
  onModuleDestroy(): any | Promise<any>
}

/**
 * BeforeApplicationShutdown —— onModuleDestroy 之后、onApplicationShutdown 之前调用。
 * 可拿到触发关闭的系统信号(如 'SIGINT')，适合做关闭前的收尾(等待在途任务完成等)。
 */
export interface BeforeApplicationShutdown {
  beforeApplicationShutdown(signal?: string): any | Promise<any>
}

/**
 * OnApplicationShutdown —— 关闭流程的最后一步。
 * 同样能拿到信号，适合做最终清理(断开数据库、注销服务发现等)。
 */
export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): any | Promise<any>
}
