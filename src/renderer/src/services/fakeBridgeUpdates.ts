import type { StudioBridge } from '@shared/ipc'

export function fakeBridgeUpdates(
  overrides: Partial<StudioBridge['updates']> | undefined,
): StudioBridge['updates'] {
  return {
    state: () => Promise.resolve({ phase: 'idle' }),
    install: () => Promise.resolve(),
    onState: () => () => {},
    ...overrides,
  }
}
