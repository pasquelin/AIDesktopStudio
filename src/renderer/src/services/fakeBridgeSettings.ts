import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { StudioBridge } from '@shared/ipc'

const noSubscription = (): (() => void) => () => {}

/** The settings a window replicates, as a suite that never wrote one would read them. */
export function fakeBridgeSettings(
  overrides: Partial<StudioBridge['settings']> | undefined,
): StudioBridge['settings'] {
  return {
    read: () => Promise.resolve(DEFAULT_SETTINGS),
    write: () => Promise.resolve(DEFAULT_SETTINGS),
    forgetProject: () => Promise.resolve(DEFAULT_SETTINGS),
    moveProject: () => Promise.resolve(DEFAULT_SETTINGS),
    authState: () => Promise.resolve({ authenticated: false, reason: 'missing' }),
    open: () => Promise.resolve(),
    runAction: () => Promise.resolve(),
    setPending: () => Promise.resolve(),
    onChange: noSubscription,
    onSection: noSubscription,
    ...overrides,
  }
}
