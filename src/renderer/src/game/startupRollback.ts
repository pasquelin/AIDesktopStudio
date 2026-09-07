export type StartupRollback = {
  add: (dispose: () => void) => void
  dispose: () => void
}

export function createStartupRollback(): StartupRollback {
  const disposers: (() => void)[] = []
  let disposed = false
  return {
    add: dispose => {
      if (disposed) dispose()
      else disposers.push(dispose)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      const failures: unknown[] = []
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        try {
          disposers[index]?.()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'exported game disposal failed')
    },
  }
}

export function failStartup(rollback: StartupRollback, cause: unknown): never {
  let disposalFailure: unknown = null
  try {
    rollback.dispose()
  } catch (disposalError) {
    disposalFailure = disposalError
  }
  if (disposalFailure) {
    throw new AggregateError([cause, disposalFailure], 'exported game startup failed', { cause })
  }
  throw cause
}
