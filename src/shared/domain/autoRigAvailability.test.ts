import { describe, expect, it } from 'vitest'
import { autoRigAvailabilityOf, type AutoRigBackendDescriptor } from './autoRig'

const backend = (
  platformSupport?: AutoRigBackendDescriptor['platformSupport'],
): AutoRigBackendDescriptor => {
  const descriptor: AutoRigBackendDescriptor = {
    id: 'backend',
    requiresModel: false,
    modelIds: [],
    devices: ['cpu'],
    experimental: false,
    capabilities: {
      target: 'humanoid',
      skeleton: true,
      skinWeights: true,
      fingers: false,
      local: true,
    },
  }
  return platformSupport ? { ...descriptor, platformSupport } : descriptor
}

describe('Auto Rig platform availability', () => {
  it('keeps a backend without restrictions available', () => {
    expect(autoRigAvailabilityOf(backend(), 'linux', 'x64')).toBe('available')
  })

  it('reports unmeasured targets as untested', () => {
    const macOnly = backend([{ platform: 'darwin', architecture: 'arm64', status: 'available' }])

    expect(autoRigAvailabilityOf(macOnly, 'darwin', 'arm64')).toBe('available')
    expect(autoRigAvailabilityOf(macOnly, 'win32', 'x64')).toBe('untested')
  })
})
