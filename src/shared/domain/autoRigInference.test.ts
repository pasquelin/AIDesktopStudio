import { describe, expect, it } from 'vitest'
import { autoRigOptionsOf, DEFAULT_AUTO_RIG_OPTIONS } from './autoRigInference'
import { IDENTITY_TRANSFORM } from './transform'
import type { HumanoidRole } from './humanoid'
import type { RigBone } from './rig'

describe('Auto Rig inference defaults', () => {
  it('uses the upstream-safe fallback for stylized or joined fingers', () => {
    expect(DEFAULT_AUTO_RIG_OPTIONS).toEqual({
      fingers: 'simplified',
      useSurfaceNormals: false,
      weightPostProcessing: true,
    })
  })
})

const bone = (name: string, role?: HumanoidRole): RigBone => ({
  name,
  parent: null,
  rest: IDENTITY_TRANSFORM,
  ...(role ? { role } : {}),
})

describe('the settings that would rebuild the rig in place', () => {
  /** Regenerating with untouched settings used to drop the thirty bones the first pass asked for. */
  it('asks for detailed fingers again when the rig carries them', () => {
    expect(autoRigOptionsOf([bone('Hips', 'Hips'), bone('LeftIndex1', 'LeftIndex1')])).toEqual({
      ...DEFAULT_AUTO_RIG_OPTIONS,
      fingers: 'detailed',
    })
    expect(autoRigOptionsOf([bone('Hips', 'Hips')])).toEqual(DEFAULT_AUTO_RIG_OPTIONS)
    expect(autoRigOptionsOf(undefined)).toEqual(DEFAULT_AUTO_RIG_OPTIONS)
  })
})
