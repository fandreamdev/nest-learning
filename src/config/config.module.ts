import { DynamicModule, Module } from '@nestjs/common'

/**
 * 动态模块演示：ConfigModule。
 *
 * 通过静态方法 forRoot(options) 在运行时返回一个 DynamicModule 配置对象，
 * 把传入的 options 作为一个 useValue provider('CONFIG_OPTIONS')动态登记并导出，
 * 这样别的模块 import 后即可注入到这份运行时配置。
 *
 * 用法：imports: [ConfigModule.forRoot({ folder: '.env' })]
 */
@Module({
  providers: [
    {
      provide: 'OTHER_CONFIG',
      useValue: 'hello',
    },
  ],
  exports: ['OTHER_CONFIG'],
})
export class ConfigModule {
  static forRoot(options: Record<string, any>): DynamicModule {
    return {
      module: ConfigModule,
      // 把运行时传入的配置作为 provider 暴露出去
      providers: [
        {
          provide: 'CONFIG_OPTIONS',
          useValue: options,
        },
      ],
      // 导出后，import 了 ConfigModule 的模块才能注入 'CONFIG_OPTIONS'
      exports: ['CONFIG_OPTIONS'],
    }
  }

  /**
   * 异步动态模块：整个 DynamicModule 的「构造」就是异步的——
   * forRootAsync 本身是 async，返回 Promise<DynamicModule>。
   * 适用于「要先 await 拿到配置，才能决定这批 providers」的场景
   * (如启动时先读文件/查库/拉远程配置，再据此组装模块)。
   *
   * 框架的扫描阶段(DependenciesScanner.collectModules)会 await 这个 Promise，
   * 解析出真正的 DynamicModule 后再登记，因此对下游完全透明。
   *
   * 用法：imports: [ConfigModule.forRootAsync({ load: async () => ({...}) })]
   */
  static async forRootAsync(options: {
    load: (...args: any[]) => Promise<Record<string, any>> | Record<string, any>
  }): Promise<DynamicModule> {
    // 在「构造模块」阶段就 await 拿到最终配置(模拟读文件/远程拉取)
    const config = await options.load()
    return {
      module: ConfigModule,
      providers: [
        {
          provide: 'CONFIG_OPTIONS',
          // 此时 config 已是确定的值，直接用 useValue 暴露
          useValue: config,
        },
      ],
      exports: ['CONFIG_OPTIONS'],
    }
  }
}
