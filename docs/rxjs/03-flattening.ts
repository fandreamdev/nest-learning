/**
 * 03 高阶 Operator —— 流里套流, 处理「异步任务」最关键的一组
 *
 * 运行: npm run example --silent docs/rxjs/03-flattening.ts
 *
 * 掌握要点: switchMap / mergeMap / concatMap / exhaustMap 的区别
 * 这四个是实战里用得最多、也最容易选错的。区别全在「上一个内层流没结束时, 来了新值怎么办」
 */
import { of, interval } from 'rxjs'
import { switchMap, mergeMap, concatMap, exhaustMap, take, delay, map } from 'rxjs/operators'

// 模拟一个「耗时异步请求」: 输入 id, 800ms 后返回结果
const fakeRequest = (id: number) => of(`结果<${id}>`).pipe(delay(800))

// 外层每 300ms 发一个 id: 0 1 2 (注意比请求 800ms 快, 会发生重叠)
const ids$ = interval(300).pipe(take(3))

// ── switchMap: 来新值就「取消」上一个未完成的内层流 ──────
//    适合: 搜索框输入、只要最新结果的场景
ids$.pipe(switchMap((id) => fakeRequest(id))).subscribe((v) => console.log('switchMap:', v))
// 只打印最后一个 结果<2> (前两个请求被新输入取消)

// ── mergeMap: 全部并发, 谁先回来先发出 (不保证顺序) ──────
//    适合: 互相独立、要全部执行的并发任务
ids$.pipe(mergeMap((id) => fakeRequest(id))).subscribe((v) => console.log('mergeMap:', v))
// 三个都打印, 顺序按完成时间

// ── concatMap: 排队, 上一个内层流结束才开始下一个 ────────
//    适合: 必须按顺序执行 (写数据库、有依赖的请求)
ids$.pipe(concatMap((id) => fakeRequest(id))).subscribe((v) => console.log('concatMap:', v))
// 严格 结果<0> 结果<1> 结果<2>, 但总耗时最长

// ── exhaustMap: 内层流没结束前, 新值直接「忽略」───────────
//    适合: 防连点提交按钮、登录请求去重
ids$.pipe(exhaustMap((id) => fakeRequest(id))).subscribe((v) => console.log('exhaustMap:', v))
// 只打印 结果<0> (执行期间到来的 1、2 被丢弃)
