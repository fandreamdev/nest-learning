# nest-learning

手写实现一个迷你版 NestJS，用来理解其核心机制：依赖注入、模块系统、中间件、异常过滤器等。底层 HTTP 基于 Express，装饰器元数据基于 `reflect-metadata`。

源码组织模仿真实 Nest：`src/@nestjs/common`(装饰器与接口) + `src/@nestjs/core`(运行时)，应用代码(`AppModule` 等)放在 `src` 下，通过路径别名 `@nestjs/*` 引用框架。

## 运行

```bash
npm install
npm run start        # ts-node 启动，监听 3000
npm run start:dev    # nodemon 热重载
```

启动后可访问：`GET /`、`GET /config`、`GET /users/*`、`GET /not-found`(异常演示) 等。

## 设计要点

框架按 Nest 的两阶段模型工作：

1. **扫描阶段**(`DependenciesScanner`)：从根模块出发递归遍历模块树，把每个 provider 的**定义**和**可见性**登记进容器(`NestContainer`)，此时不实例化。
2. **实例化阶段**(`Injector`)：定义图完整后，按 token 递归创建实例并缓存(单例)，再注册中间件与路由。

「实例唯一」(实例表)与「谁能看见」(可见性表)是两个正交维度，分别由容器的两张表管理。

## 已实现

### 依赖注入(DI)

- 构造注入：基于 `design:paramtypes` 自动解析构造参数类型
- `@Injectable` / `@Inject(token)` 显式指定注入 token
- 四种 provider 写法：类本身、`useValue`、`useClass`、`useFactory`(含 `inject`)
- 单例缓存、按需递归实例化(声明顺序无关)
- 依赖可见性校验(跨模块隔离)；按 token 的「归属模块」解析其构造依赖(支持同模块内 provider 互相注入)
- 可选依赖 `@Optional()`：解析不到时注入 `undefined` 而非报错
- 属性注入：`@Inject(token)` 写在属性上，框架 `new` 之后回填
- 循环依赖 `forwardRef(() => Xxx)`：延迟解包引用，对「在建中」的依赖返回惰性代理闭合循环
  (约束同 Nest：循环引用只能在方法里用，不能在构造函数体内)

### 作用域(Scope) — 最小实现

- `@Injectable({ scope })` + `Scope` 枚举：`DEFAULT`(单例) / `REQUEST`(请求级)
- `REQUEST` 作用域 controller：每个 HTTP 请求新建一份(不再启动时建一次复用)，请求结束即丢弃
- `@Inject(REQUEST)`：在 `REQUEST` 作用域 controller 构造里拿到「本次请求」的 `req` 对象
- `@Injectable` 兼容裸用(`@Injectable`)与工厂用(`@Injectable()` / `@Injectable({ scope })`)
- 范围说明：仅实现 controller 自身的 `REQUEST` 作用域 + `REQUEST` token；**不**做 `TRANSIENT`、
  **不**做「作用域冒泡」、不支持把普通 provider 标成 `REQUEST`(那需要请求级子容器)。
  实践中作用域很少用，请求级上下文通常优先用 `AsyncLocalStorage`

### 模块系统

- `@Module({ imports, controllers, providers, exports })`
- `imports` / `exports` 可见性织入，模块间隔离
- `exports` 支持 re-export(导出另一个模块)
- `@Global()` 全局模块，导出的 token 全局可见
- 动态模块：`DynamicModule`(forRoot 等静态方法返回配置对象)
- **异步动态模块**：`forRootAsync` 返回 `Promise<DynamicModule>`，扫描阶段 await 展开

### 控制器与路由

- `@Controller(prefix)`
- HTTP 方法：`@Get` / `@Post` / `@Put` / `@Delete` / `@Patch` / `@Options` / `@Head`(同一工厂生成，仅动词不同)
- 参数装饰器：`@Req` / `@Res` / `@Body` / `@Query` / `@Param` / `@Headers` / `@Session` / `@Ip` / `@Next`
- 自定义参数装饰器：`createParamDecorator`
- 响应处理：`@HttpCode`、`@Header`、`@Redirect`、`@Res({ passthrough })`
- async 处理方法

### 中间件

- `NestModule.configure(consumer)` + `MiddlewareConsumer`
- `consumer.apply(...).forRoutes(...).exclude(...)` 链式 API
- 类中间件(实现 `NestMiddleware`，支持 DI)与函数中间件
- `forRoutes` 支持字符串路径 / controller 类 / `{ path, method }`
- 按 HTTP 方法限定 + 路径前缀匹配 + `exclude` 排除

### 异常处理

- `HttpException` 基类 + 语义化子类(`NotFoundException`、`BadRequestException` 等)
- `HttpStatus` 状态码枚举
- `@Catch()` 异常过滤器 + `ExceptionFilter` 接口 + `ArgumentsHost`
- `app.useGlobalFilters(...)` 注册全局过滤器
- `@UseFilters(...)` 方法级 / 控制器级过滤器
- **三级优先级**：方法级 > 控制器级 > 全局 > 内置默认处理
- `APP_FILTER`：以 provider 方式注册全局过滤器(走 DI，可注入其它 provider)
- 过滤器实例 per-module 缓存(对齐 Nest，非全局单例)
- 过滤器自身抛异常时的兜底保护(退回默认处理，不悬挂请求)

### 管道(Pipes)

- `PipeTransform` 接口 + `ArgumentMetadata`(`type` / `metatype` / `data`)
- **四级绑定**：全局(`useGlobalPipes` / `APP_PIPE`) > 控制器级 / 方法级(`@UsePipes`) > 参数级(`@Body(pipe)`、`@Query('x', PipeA, PipeB)`)
- 管道链按「全局 → 控制器 → 方法 → 参数」顺序串行 transform，前者输出喂给后者
- `metatype` 取自 `design:paramtypes`，故 `ValidationPipe` 自动跳过 `@Req`/`@Res` 等非 DTO 参数
- 内置管道：`ParseIntPipe` / `ParseFloatPipe` / `ParseBoolPipe` / `ParseArrayPipe` / `ParseUUIDPipe` / `ParseEnumPipe` / `DefaultValuePipe`
- `ParseFilePipe`：校验上传文件，规则与管道分离 —— 由一组 `FileValidator` 提供(`MaxFileSizeValidator` 限大小、`FileTypeValidator` 限 MIME)，按序 fail-fast；支持 `fileIsRequired`、`errorHttpStatusCode`、`exceptionFactory`
- `ValidationPipe`：`toValidate` → `plainToInstance` → `validate` → 抛 `BadRequestException`(`message[]`)，结构对齐 Nest
- 配套轻量校验装饰器(`@IsString`/`@IsInt`/`@Min`/`@MinLength` 等)作为 class-validator 的等价替身
- `APP_PIPE`：以 provider 方式注册全局管道(走 DI，可注入其它 provider)
- 管道类实例 per-module 缓存(对齐 Nest，与过滤器同构)

### 守卫(Guards)

- `CanActivate` 接口 + `ExecutionContext`(在 `ArgumentsHost` 上扩展 `getClass()` / `getHandler()`)
- **三级绑定**：全局(`useGlobalGuards` / `APP_GUARD`) > 控制器级 / 方法级(`@UseGuards`)
- 执行时机：**中间件 → 守卫 → 拦截器(前) → 管道 → 处理方法**(守卫在拦截器/管道之前)
- 任一守卫 `canActivate` 返回 `false` 即抛 `ForbiddenException`(403)，交给异常过滤器
- `@SetMetadata` + `Reflector`(`get` / `getAllAndOverride` / `getAllAndMerge`)：守卫读取写在类/方法上的元数据
- `Reflector` 作为全局可见的内置 provider 自动登记，守卫可直接注入
- `APP_GUARD`：以 provider 方式注册全局守卫(走 DI，可注入其它 provider)
- 守卫类实例 per-module 缓存(对齐 Nest，与过滤器/管道同构)

### 拦截器(Interceptors)

- `NestInterceptor` 接口 + `CallHandler`(`handle()` 返回 RxJS `Observable`)，共享守卫的 `ExecutionContext`
- **三级绑定**：全局(`useGlobalInterceptors` / `APP_INTERCEPTOR`) > 控制器级 / 方法级(`@UseInterceptors`)
- 执行模型(对齐 Nest)：**守卫 → 拦截器(前置) → 管道 → 处理方法 → 拦截器(后置) → 发送响应**
- 「由外到内」包裹：`reduceRight` 把处理方法包成最内层 `CallHandler`，全局拦截器在最外层
- 后置逻辑对 `next.handle()` 返回的 Observable 做变换(`map`/`tap` 等)，`lastValueFrom` 取最终值作响应体
- `APP_INTERCEPTOR`：以 provider 方式注册全局拦截器(走 DI，可注入其它 provider)
- 拦截器类实例 per-module 缓存(对齐 Nest，与过滤器/管道/守卫同构)

### 生命周期钩子(Lifecycle Hooks)

- 启动钩子：`OnModuleInit` → `OnApplicationBootstrap`(所有 provider 实例化、路由注册完毕后正序触发)
- 关闭钩子：`OnModuleDestroy` → `BeforeApplicationShutdown` → `OnApplicationShutdown`(按初始化逆序，后建先拆)
- 钩子可为 async，框架逐个 `await`；shutdown 类钩子会收到触发的信号(如 `SIGTERM`)
- `app.enableShutdownHooks()`：监听 `SIGINT`/`SIGTERM`，收到后优雅关闭(先停 HTTP server 再跑关闭钩子)
- `app.close()`：手动触发优雅关闭，与信号路径共用同一流程(幂等，避免重复执行)
- 鸭子类型识别：实例上有对应方法即视为实现该钩子；按容器实例化顺序(Map 插入序)正序/逆序遍历

## 目录结构

```
src/
├── @nestjs/
│   ├── common/              # 装饰器、接口、token
│   │   ├── exceptions/      # HttpException、@Catch、ExceptionFilter、APP_FILTER
│   │   ├── pipes/           # PipeTransform、内置管道、ValidationPipe、校验装饰器、APP_PIPE
│   │   ├── guards/          # CanActivate、ExecutionContext、@UseGuards、APP_GUARD
│   │   ├── interceptors/    # NestInterceptor、CallHandler、@UseInterceptors、APP_INTERCEPTOR
│   │   ├── hooks/           # 生命周期钩子接口(OnModuleInit / OnApplicationShutdown 等)
│   │   ├── reflector.ts     # Reflector(元数据读取) + set-metadata.decorator(@SetMetadata)
│   │   ├── *.decorator.ts   # @Module/@Controller/@Get/@Inject/参数装饰器等
│   │   └── middleware.ts    # NestModule、MiddlewareConsumer 等接口
│   └── core/                # 运行时
│       ├── injector/        # NestContainer(容器) + Injector(实例化)
│       ├── scanner/         # DependenciesScanner(模块扫描)
│       ├── middleware/      # MiddlewareModule(中间件装配)
│       ├── exceptions/      # ExceptionsHandler(异常分发)
│       ├── pipes/           # PipesConsumer(管道执行)
│       ├── guards/          # GuardsConsumer(守卫执行)
│       ├── interceptors/    # InterceptorsConsumer(拦截器执行)
│       ├── router/          # RoutesResolver(路由注册)
│       └── nest-application.ts / nest-factory.ts
├── config/                  # ConfigModule 动态模块演示
├── user/ other/             # 业务模块演示
├── *.filter.ts              # 异常过滤器演示
├── logger.middleware.ts     # 中间件演示
├── app.module.ts            # 根模块
└── main.ts                  # 启动入口
```
