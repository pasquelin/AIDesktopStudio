import type { StudioBridge } from '@shared/ipc'

export function fakeBridgeMissions(
  overrides: Partial<StudioBridge['missions']> | undefined,
): StudioBridge['missions'] {
  return {
    watch: () => Promise.resolve([]),
    create: () => Promise.reject(new Error('fake mission creation is not configured')),
    resume: () => Promise.reject(new Error('fake mission resume is not configured')),
    onChanged: () => () => {},
    onEvent: () => () => {},
    ...overrides,
  }
}
