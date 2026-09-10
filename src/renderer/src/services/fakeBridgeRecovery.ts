import type { RecoveryWrite } from '@shared/domain/recovery'
import type { StudioBridge } from '@shared/ipc'

/**
 * The recovery area, as a double. Nothing is offered by default: a suite that has not said what
 * is waiting must not have a restore question answered behind it.
 */
export function fakeBridgeRecovery(
  overrides: Partial<StudioBridge['recovery']> | undefined,
): StudioBridge['recovery'] {
  return {
    write: () => Promise.resolve<RecoveryWrite>('written'),
    list: () => Promise.resolve([]),
    read: () => Promise.resolve(null),
    clear: () => Promise.resolve(),
    confirmRestore: () => Promise.resolve(false),
    ...overrides,
  }
}
