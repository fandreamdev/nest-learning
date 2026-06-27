/**
 * 01 创建型 Operator —— 怎么「造」一个 Observable
 *
 * 运行: npm run example --silent docs/rxjs/01-creation.ts
 *
 * 掌握要点: of / from 的区别, 以及 interval / timer / fromEvent 等常用源
 */
import { of, from, interval, timer, range, EMPTY, throwError } from 'rxjs'
import { take } from 'rxjs/operators'

// ── of: 把「参数本身」逐个发出, 不拆开 ──────────────────
of(1, 2, 3).subscribe((v) => console.log('of(1,2,3):', v)) // 1 2 3
of([1, 2, 3]).subscribe((v) => console.log('of([...]):', v)) // [1,2,3] 整个数组一次发出

// ── from: 把「可迭代 / Promise」拆开逐个发出 ──────────────
from([1, 2, 3]).subscribe((v) => console.log('from([...]):', v)) // 1 2 3 数组被展开
from('abc').subscribe((v) => console.log('from(str):', v)) // a b c 字符串可迭代
from(Promise.resolve(42)).subscribe((v) => console.log('from(promise):', v)) // 42

// ── range: 发出一段连续整数 ──────────────────────────────
range(10, 3).subscribe((v) => console.log('range:', v)) // 10 11 12

// ── interval: 每隔 N ms 发出递增整数 (无限, 需自己截断) ──
interval(300)
  .pipe(take(3)) // 只取前 3 个否则永不结束
  .subscribe((v) => console.log('interval:', v)) // 0 1 2 (每 300ms)

// ── timer: 延迟后发出, 可选周期重复 ──────────────────────
timer(1000).subscribe(() => console.log('timer: 1秒后发一次')) // 单次
timer(0, 500)
  .pipe(take(2))
  .subscribe((v) => console.log('timer 周期:', v)) // 0 立即, 1 在 500ms

// ── EMPTY: 不发任何值, 直接 complete ─────────────────────
EMPTY.subscribe({ complete: () => console.log('EMPTY: 直接完成') })

// ── throwError: 直接发出一个错误 ─────────────────────────
throwError(() => new Error('boom')).subscribe({
  error: (e) => console.log('throwError:', e.message),
})
