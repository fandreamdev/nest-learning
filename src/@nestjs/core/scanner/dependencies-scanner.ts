import 'reflect-metadata'
import {
  DynamicModule,
  CONTROLLERS_METADATA,
  PROVIDERS_METADATA,
  IMPORTS_METADATA,
  EXPORTS_METADATA,
  GLOBAL_MODULE_WATERMARK,
  MODULE_WATERMARK,
  ModuleMetadataKey,
} from '@nestjs/common'
import { NestContainer } from '../injector/nest-container'

/**
 * DependenciesScanner —— 模块扫描器（对应 Nest 源码中的 DependenciesScanner）。
 *
 * 负责两阶段模型的「第一阶段」：从根模块出发，递归遍历整棵模块树，把每个模块
 * 自己的 provider 登记进容器（仅对本模块可见），并按 imports/exports/@Global
 * 把跨模块可见的 provider 织入消费方模块的可见性。扫描结束后，容器里的定义图
 * 就是完整的，Injector 才能在第二阶段安全地按需实例化。
 *
 * 关于「动态模块」与模块身份(module ref)：
 *  import 项可以是一个 DynamicModule 配置对象(由模块类的静态方法如 forRoot 返回)。
 *  本扫描器以「模块引用」作为模块身份：
 *   - 静态模块：身份就是模块类本身；
 *   - 动态模块：身份是 forRoot 返回的那个对象。每次调用 forRoot 都是新对象，
 *     因此 X.forRoot({a}) 与 X.forRoot({b}) 是两个互相独立的模块节点，
 *     各自携带各自的 providers/exports，不会相互污染。
 *  读取元数据统一走 getModuleMetadata：动态模块取「类上的静态声明 + 对象自带字段」的并集。
 */
export class DependenciesScanner {
  constructor(private readonly container: NestContainer) {}

  /**
   * 扫描入口：从根模块出发递归登记所有模块的 provider 定义。
   * @param rootModule 应用根模块（AppModule），也可以是一个 DynamicModule 对象
   * @returns 扫描到的全部模块引用（含根模块及其 imports 递归展开，按引用去重）
   *
   * 异步原因：imports 项可能是 forRootAsync 返回的 Promise<DynamicModule>，
   * 需要先 await 解析成真正的 DynamicModule 才能读取其元数据并继续递归。
   */
  async scan(rootModule: any): Promise<any[]> {
    // 先收集模块树上的所有模块引用(按引用去重)，再逐个登记
    const modules = await this.collectModules(rootModule)
    for (const module of modules) {
      await this.registerModule(module)
    }
    return modules
  }

  /**
   * 读取某个模块的「有效 controllers」(静态 + 动态合并)，供路由解析使用。
   * 公开方法：让外部(路由解析)无需感知动态模块细节。
   */
  getControllers(module: any): any[] {
    return this.getModuleMetadata(module, CONTROLLERS_METADATA)
  }

  /**
   * 由模块引用取其「模块类」：
   *  - 静态模块：引用本身就是类；
   *  - 动态模块：取 DynamicModule 对象上的 module 字段。
   * 供中间件装配(读取/实例化模块类以调用 configure)使用。
   */
  getModuleClass(moduleRef: any): any {
    return this.isDynamicModule(moduleRef) ? moduleRef.module : moduleRef
  }

  /**
   * 从根模块出发，沿 imports 递归收集所有模块引用（按引用去重）。
   * 静态模块以类为引用，动态模块以 DynamicModule 对象为引用。
   *
   * imports 项可能是 Promise<DynamicModule>(forRootAsync)，会先被 await 解析；
   * 解析得到的 DynamicModule 对象就是该模块的身份(module ref)。
   * @param rootModule 起点模块（类 / DynamicModule 对象 / Promise<DynamicModule>）
   */
  private async collectModules(rootModule: any): Promise<any[]> {
    const modules: any[] = []
    const visited = new Set<any>()
    const visit = async (moduleRef: any) => {
      // imports 项若是 Promise(forRootAsync)，先 await 拿到真正的 DynamicModule 再作为身份
      const resolved = await moduleRef
      // 按引用去重：同一个类/同一个动态对象只登记一次，避免重复登记与循环 imports 死循环。
      // 注意：不同的 forRoot 调用产生不同对象，会被视为不同模块，这正是我们想要的隔离。
      if (!resolved || visited.has(resolved)) return
      visited.add(resolved)
      modules.push(resolved)
      const imports = this.getModuleMetadata(resolved, IMPORTS_METADATA)
      for (const importedModule of imports) {
        await visit(importedModule)
      }
    }
    await visit(rootModule)
    return modules
  }

  /** 判断一个 import 项是否是 DynamicModule 对象（具有 module 字段的普通对象） */
  private isDynamicModule(moduleRef: any): moduleRef is DynamicModule {
    return moduleRef && typeof moduleRef === 'object' && 'module' in moduleRef
  }

  /**
   * 读取某个模块引用的「有效元数据」：
   *  - 动态模块：模块类上 @Module 的静态声明 + DynamicModule 对象自带的同名字段，二者并集；
   *  - 静态模块：直接读类上的 reflect-metadata。
   * 下游所有按模块读取 imports/providers/controllers/exports 的逻辑都走这里，
   * 从而对「静态模块 / 动态模块」透明。
   */
  private getModuleMetadata(moduleRef: any, key: ModuleMetadataKey): any[] {
    if (this.isDynamicModule(moduleRef)) {
      // 动态模块：类上的静态基础元数据 + 本次 forRoot 对象携带的动态字段
      const staticMeta = Reflect.getMetadata(key, moduleRef.module) ?? []
      const dynamicMeta = moduleRef[key] ?? []
      return [...staticMeta, ...dynamicMeta]
    }
    return Reflect.getMetadata(key, moduleRef) ?? []
  }

  /** 该模块是否为全局模块：@Global() 装饰，或动态模块配置里 global: true */
  private isGlobalModule(moduleRef: any): boolean {
    if (this.isDynamicModule(moduleRef)) {
      return (
        (Reflect.getMetadata(GLOBAL_MODULE_WATERMARK, moduleRef.module) ?? false) ||
        (moduleRef.global ?? false)
      )
    }
    return Reflect.getMetadata(GLOBAL_MODULE_WATERMARK, moduleRef) ?? false
  }

  /**
   * 登记单个模块：它自己声明的 provider 仅对本模块可见；
   * 它 imports 进来的模块所导出的 provider 则织入本模块的可见性。
   * @param moduleRef 模块引用（类或 DynamicModule 对象），同时作为可见性的 key
   */
  private async registerModule(moduleRef: any) {
    // 1) 本模块自己声明的 provider —— 仅对本模块(本引用)可见
    const providers = this.getModuleMetadata(moduleRef, PROVIDERS_METADATA)
    for (const provider of providers) {
      this.container.registerProvider(provider, moduleRef)
    }

    // 2) 处理 imports：把每个被导入模块「导出」的 provider 登记到「本模块」的可见性下。
    //    imports 项可能是 Promise<DynamicModule>(forRootAsync)，await 后得到的就是
    //    collectModules 阶段登记过的同一个对象(Promise 结果被缓存)，身份一致。
    const imports = this.getModuleMetadata(moduleRef, IMPORTS_METADATA)
    for (const importedModule of imports) {
      this.registerExports(await importedModule, moduleRef)
    }
  }

  /**
   * 把一个被 imports 的模块所「导出(exports)」的 provider 定义，织入消费方模块的可见性。
   * 只有被 exports 的 token 才对外可见，这是 Nest 模块隔离的核心契约。
   * @param moduleRef    被导入的模块引用（类或 DynamicModule 对象）
   * @param consumeRef   消费方模块引用：可见性记在它名下，表示「我 import 了你，才能注入你导出的东西」
   */
  private registerExports(moduleRef: any, consumeRef: any) {
    const importedProviders = this.getModuleMetadata(moduleRef, PROVIDERS_METADATA)
    const exports = this.getModuleMetadata(moduleRef, EXPORTS_METADATA)
    // @Global() 模块(或动态 global)：它导出的 token 对所有模块全局可见
    const isGlobal = this.isGlobalModule(moduleRef)

    for (const exportToken of exports) {
      // 导出的可能是另一个模块（re-export）：递归把那个模块导出的内容也展开进来
      if (this.isModule(exportToken)) {
        this.registerExports(exportToken, consumeRef)
        continue
      }
      // 否则在该模块的 providers 里找到对应定义并登记
      // 兼容两种写法：直接写类(provider === exportToken) 或对象写法(provider.provide === exportToken)
      const provider = importedProviders.find(
        (provider: any) => provider === exportToken || provider.provide === exportToken,
      )
      if (provider) {
        // 可见性记在「消费方」名下：imports 进来后，消费方模块才能注入它
        this.container.registerProvider(provider, consumeRef)
        // 全局模块导出的 token，额外登记进全局可见集合
        if (isGlobal) {
          this.container.registerGlobalToken(provider.provide ?? provider)
        }
      }
    }
  }

  /** 判断一个 token 是否是 @Module 装饰过的模块类，或一个 DynamicModule 对象 */
  private isModule(exportToken: any): boolean {
    if (this.isDynamicModule(exportToken)) {
      return true
    }
    return (
      exportToken &&
      exportToken instanceof Function &&
      Reflect.getMetadata(MODULE_WATERMARK, exportToken)
    )
  }
}
