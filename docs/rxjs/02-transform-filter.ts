/**
 * 02 转换 & 过滤 Operator —— 在 pipe 里「加工」流里的值
 *
 * 运行: npm run example --silent docs/rxjs/02-transform-filter.ts
 *
 * 掌握要点: pipe 的链式组合, map / filter / tap / scan / take / debounceTime
 */
import { of, interval, from } from 'rxjs'
import {
  map,
  filter,
  tap,
  scan,
  take,
  takeWhile,
  distinctUntilChanged,
} from 'rxjs/operators'

// ── map: 一对一变换每个值 ───────────────────────────────
of(1, 2, 3)
  .pipe(map((x) => x * 10))
  .subscribe((v) => console.log('map:', v)) // 10 20 30

// ── filter: 只放行满足条件的值 ──────────────────────────
of(1, 2, 3, 4, 5, 6)
  .pipe(filter((x) => x % 2 === 0))
  .subscribe((v) => console.log('filter:', v)) // 2 4 6

// ── tap: 不改变值, 只「旁路」做副作用 (打日志/调试最常用) ─
of('a', 'b')
  .pipe(
    tap((v) => console.log('tap 看到:', v)), // 副作用
    map((v) => v.toUpperCase()),
  )
  .subscribe((v) => console.log('tap 之后:', v)) // A B

// ── scan: 像 reduce, 但每步都发出累计值 (做累加器/状态) ──
of(1, 2, 3, 4)
  .pipe(scan((acc, cur) => acc + cur, 0))
  .subscribe((v) => console.log('scan 累计:', v)) // 1 3 6 10

// ── take / takeWhile: 截断流 ────────────────────────────
interval(200)
  .pipe(take(3))
  .subscribe((v) => console.log('take:', v)) // 0 1 2 然后结束

from([1, 2, 3, 10, 4])
  .pipe(takeWhile((x) => x < 5)) // 一旦不满足就 complete
  .subscribe((v) => console.log('takeWhile:', v)) // 1 2 3 (遇到 10 停)

// ── distinctUntilChanged: 跳过连续重复值 ────────────────
from([1, 1, 2, 2, 2, 3, 1])
  .pipe(distinctUntilChanged())
  .subscribe((v) => console.log('distinct:', v)) // 1 2 3 1
