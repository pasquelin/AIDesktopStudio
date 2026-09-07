import { test, type BenchFn, type BenchRunOptions } from 'vitest'

export function bench(name: string, fn: BenchFn): void
export function bench(name: string, fn: BenchFn, options: BenchRunOptions): void
export function bench(name: string, fn: BenchFn, options?: BenchRunOptions): void {
  test(name, async ({ bench: measure }) => {
    const registered = measure(name, fn)
    await registered.run(options)
  })
}
