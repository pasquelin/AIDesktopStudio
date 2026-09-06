import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { skeletonSignatureOf, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { RetargetSnapshot } from '../retargetChannel'
import { motionView } from '../retarget-fixtures'
import { motionProfile } from '../retargetDraft'
import { useRetargetWorkspace } from './useRetargetWorkspace'

const state = vi.hoisted(() => ({ snapshot: null as RetargetSnapshot | null }))
vi.mock('./useRetargetSession', () => ({
  useRetargetSession: () => ({ snapshot: state.snapshot }),
}))
vi.mock('./useRetargetPreview', () => ({ useRetargetPreview: () => ({ cancel: vi.fn() }) }))
afterEach(() => {
  state.snapshot = null
})

it.each(['topology', 'legacy'])('keeps remembered %s exclusions ahead of rig roles', async kind => {
  const view = await motionView()
  try {
    const detected = motionProfile(view.bones)
    const profile: SkeletonProfile = {
      signature:
        kind === 'legacy'
          ? skeletonSignatureOf(view.bones.map(bone => bone.name))
          : detected.signature,
      roles: {},
      ignored: ['Hips'],
    }
    state.snapshot = {
      assetId: 'hero',
      name: 'Hero',
      revision: 1,
      incarnation: 'open',
      profiles: [profile],
      rig: {
        origin: 'local',
        bones: [{ name: 'Hips', parent: null, role: 'Hips', rest: IDENTITY_TRANSFORM }],
      },
    }
    const hook = renderHook(useRetargetWorkspace)
    act(() => {
      hook.result.current.targetReady(view)
      hook.result.current.sourceReady(view)
    })
    expect(hook.result.current.targetProfile?.ignored).toEqual(['Hips'])
    expect(hook.result.current.targetProfile?.roles.Hips).toBeUndefined()
    expect(hook.result.current.sourceProfile?.ignored).toEqual(['Hips'])
    expect(hook.result.current.targetProfile?.signature).toBe(detected.signature)
    hook.unmount()
  } finally {
    view.engine.dispose()
  }
})

it('keeps the selected source clip index and defaults only when absent', () => {
  const hook = renderHook(useRetargetWorkspace)
  act(() =>
    hook.result.current.choose(
      { kind: 'asset', assetId: 'motion', name: 'second', clipIndex: 1 },
      'second',
    ),
  )
  expect(hook.result.current.clipIndex).toBe(1)
  act(() => hook.result.current.choose({ kind: 'asset', assetId: 'other', name: 'first' }, 'first'))
  expect(hook.result.current.clipIndex).toBe(0)
})
