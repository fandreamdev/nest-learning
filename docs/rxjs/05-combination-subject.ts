/**
 * 05 组合多个流 + Subject —— 把多条流合到一起, 以及「可手动推值」的流
 *
 * 运行: npm run example --silent docs/rxjs/05-combination-subject.ts
 *
 * 掌握要点: merge / concat / combineLatest / forkJoin / zip, Subject / BehaviorSubject
 */
import { of, interval, merge, concat, combineLatest, forkJoin, zip, Subject, BehaviorSubject } from 'rxjs'
import { take, map, delay } from 'rxjs/operators'

const a$ = interval(300).pipe(take(2), map((v) => 'A' + v)) // A0 A1
const b$ = interval(400).pipe(take(2), map((v) => 'B' + v)) // B0 B1

// ── merge: 多条流交错合并, 谁有值发谁 ───────────────────
merge(a$, b$).subscribe((v) => console.log('merge:', v)) // A0 B0 A1 B1 (按时间)

// ── concat: 前一条流结束后才订阅下一条 (顺序拼接) ────────
concat(of('first'), of('second')).subscribe((v) => console.log('concat:', v)) // first second

// ── combineLatest: 任一流发值时, 组合「各流最新值」───────
//    适合: 多个表单字段联动计算
combineLatest([a$, b$]).subscribe(([a, b]) => console.log('combineLatest:', a, b))

// ── forkJoin: 等所有流都 complete, 只取各自「最后一个值」─
//    适合: 并行发多个请求, 全部完成后一起处理 (类似 Promise.all)
forkJoin({
  user: of('用户数据').pipe(delay(300)),
  config: of('配置数据').pipe(delay(500)),
}).subscribe((res) => console.log('forkJoin:', res)) // { user, config }

// ── zip: 按「索引」一一配对 (等齐了才发) ─────────────────
zip(of(1, 2, 3), of('x', 'y')).subscribe((v) => console.log('zip:', v)) // [1,x] [2,y]

// ── Subject: 既是 Observable 又是 Observer, 可手动 next 推值 ─
const subject = new Subject<string>()
subject.subscribe((v) => console.log('Subject 订阅者1:', v))
subject.next('hello') // 手动推一个值, 所有订阅者都收到
subject.next('world')

// ── BehaviorSubject: 带「当前值」, 新订阅者立刻收到最近一次值 ─
//    适合: 存放状态 (当前登录用户、主题等)
const state = new BehaviorSubject<number>(0) // 初始值 0
state.subscribe((v) => console.log('BehaviorSubject 订阅者:', v)) // 立刻收到 0
state.next(1) // 收到 1
console.log('当前值:', state.value) // 还能同步读 .value
