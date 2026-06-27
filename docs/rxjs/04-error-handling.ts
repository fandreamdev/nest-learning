/**
 * 04 错误处理 & 完成 —— 让流在出错时优雅恢复
 *
 * 运行: npm run example --silent docs/rxjs/04-error-handling.ts
 *
 * 掌握要点: catchError / retry / timeout / finalize, 以及 subscribe 的三个回调
 */
import { of, throwError, timer, from } from 'rxjs'
import { catchError, retry, timeout, finalize, map, mergeMap } from 'rxjs/operators'

// ── subscribe 的完整形态: next / error / complete ───────
of(1, 2, 3).subscribe({
  next: (v) => console.log('next:', v),
  error: (e) => console.log('error:', e),
  complete: () => console.log('complete: 流正常结束'), // 出错则不会走到这
})

// ── catchError: 捕获错误, 返回一个「替代流」继续 ─────────
throwError(() => new Error('原始错误'))
  .pipe(catchError((err) => of('已兜底: ' + err.message))) // 用 of 换成正常值
  .subscribe((v) => console.log('catchError:', v)) // 已兜底: 原始错误

// ── retry: 出错后重试 N 次再放弃 ────────────────────────
let attempt = 0
from([1])
  .pipe(
    map(() => {
      attempt++
      if (attempt < 3) throw new Error(`第 ${attempt} 次失败`)
      return `第 ${attempt} 次成功`
    }),
    retry(5), // 最多重试 5 次
  )
  .subscribe((v) => console.log('retry:', v)) // 第 3 次成功

// ── timeout: 超时未发值就抛 TimeoutError ────────────────
//    (这正是你原来 rxjs.ts 里那个例子的用法)
timer(2000) // 2 秒后才发值
  .pipe(
    timeout(800), // 但 800ms 就超时
    catchError((err) => of('超时了: ' + err.name)),
  )
  .subscribe((v) => console.log('timeout:', v)) // 超时了: TimeoutError

// ── finalize: 无论成功/失败/取消, 结束时都执行 (清理资源) ─
of('做点事')
  .pipe(finalize(() => console.log('finalize: 一定会执行的收尾')))
  .subscribe((v) => console.log('finalize 前:', v))
