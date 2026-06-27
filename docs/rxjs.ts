import { catchError, from, map, Observable, of, tap, throwError, timeout } from 'rxjs'

// const observable = new Observable<number>((sub) => {
//   let counter = 0

//   const internal = setInterval(() => {
//     sub.next(counter++)
//   }, 1000)

//   return () => {
//     clearInterval(internal)
//     console.log('unSub')
//   }
// })

// const subscription = observable
//   .pipe(
//     tap((value) => console.log(value)),
//     map((val) => val * 2),
//   )
//   .subscribe((val) => {
//     console.log('sub', val)
//   })

// setTimeout(() => {
//   subscription.unsubscribe()
// }, 5000)

// throwError(() => new Error('An error occurred'))
//   .pipe(catchError((err) => of('Catch:' + err)))
//   .subscribe((val) => {
//     console.log(val)
//   })

from(
  new Promise((resolve) => {
    setTimeout(resolve, 5000)
  }),
)
  .pipe(timeout(1000))
  .subscribe({
    next: (val) => console.log(val),
    error: (err) => console.log(err),
  })
