import { useEffect } from 'react'
import type { LogLevel } from '@shared/ipc'
import { cachedToken } from '@/engines/core/palette'
import { getBridge } from '@/services/bridge'

/**
 * Prints what the main process logs into this window's devtools console. Without it the API
 * calls are invisible from here — they leave from the main process, so no Network entry is
 * ever recorded — and a failure reduced to a code says nothing about what actually broke.
 */
export function useMainLogs(): void {
  useEffect(
    () => getBridge()?.diagnostics.onLog(entry => print(entry.level, entry.scope, entry.message)),
    [],
  )
}

function print(level: LogLevel, scope: string, message: string): void {
  const line = `%c[main:${scope}]%c ${message}`
  // Read from the theme rather than repeated: the accent is a token, and a copy of it here
  // would keep its old value the day the token moves. Cached per theme — a burst of log lines
  // must not resolve style over the whole shell once each.
  const badge = `color:${cachedToken('--color-accent')};font-weight:600`

  /* oxlint-disable no-console -- mirroring the main process's console is the whole point */
  if (level === 'error') console.error(line, badge, '')
  else if (level === 'warn') console.warn(line, badge, '')
  else console.log(line, badge, '')
  /* eslint-enable no-console */
}
