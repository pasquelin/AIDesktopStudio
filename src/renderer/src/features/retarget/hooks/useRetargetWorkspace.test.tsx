import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { skeletonSignatureOf, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { RetargetSnapshot } from '../retargetChannel'
import type * as RetargetDraftModule from '../retargetDraft'
import { motionProfile } from '../retargetDraft'
import { motionClip, motionView } from '../retarget-fixtures'
import { wireClipOf } from '@/engines/scene/retarget'
import type { WireClip } from '@/engines/scene/retargetMessage'
import { useRetargetWorkspace } from './useRetargetWorkspace'

const state = vi.hoisted(() => ({
  snapshot: null as RetargetSnapshot | null,
  apply: vi.fn(),
  generation: 1,
  result: null as { key: string; clip: WireClip; generation: number } | null,
  exported: [] as ((glb: Uint8Array) => void)[],
}))
vi.mock('./useRetargetSession', () => ({
  useRetargetSession: () => ({ snapshot: state.snapshot, apply: state.apply, idle: vi.fn() }),
}))
vi.mock('./useRetargetPreview', () => ({
  useRetargetPreview: () => ({
    cancel: () => {
      state.generation += 1
    },
    result: state.result,
    current: (value: { generation?: number } | null) =>
      value !== null && value.generation === state.generation,
  }),
}))
vi.mock('../retargetDraft', async original => ({
  ...(await original<typeof RetargetDraftModule>()),
  exportRetarget: () => new Promise<Uint8Array>(resolve => state.exported.push(resolve)),
}))
afterEach(() => {
  state.snapshot = null
  state.result = null
  state.generation = 1
  state.exported = []
  state.apply.mockReset()
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

it('retains inspector data while a replacement source loads', async () => {
  const first = await motionView()
  const second = await motionView()
  const hook = renderHook(useRetargetWorkspace)
  act(() => hook.result.current.sourceReady(first))
  const profile = hook.result.current.sourceProfile
  act(() => hook.result.current.sourceReady(null))
  expect(hook.result.current.sourceLoading).toBe(true)
  expect(hook.result.current.source).toBe(first)
  expect(hook.result.current.sourceProfile).toBe(profile)
  act(() => hook.result.current.sourceReady(second))
  expect(hook.result.current.sourceLoading).toBe(false)
  expect(hook.result.current.source).toBe(second)
  hook.unmount()
  first.engine.dispose()
  second.engine.dispose()
})

it('drops an export finished after another source was chosen instead of applying the old clip', async () => {
  const view = await motionView([motionClip(1)])
  try {
    const hook = renderHook(useRetargetWorkspace)
    act(() => {
      hook.result.current.targetReady(view)
      hook.result.current.choose({ kind: 'asset', assetId: 'first', name: 'first' }, 'first')
    })
    state.result = { key: 'result', clip: wireClipOf(motionClip(1)), generation: state.generation }
    hook.rerender()
    let applied: Promise<void> | undefined
    act(() => {
      applied = hook.result.current.apply()
    })
    expect(hook.result.current.exporting).toBe(true)
    act(() =>
      hook.result.current.choose({ kind: 'asset', assetId: 'second', name: 'second' }, 'second'),
    )
    await act(async () => {
      state.exported[0]?.(new Uint8Array(16))
      await applied
    })
    expect(state.apply).not.toHaveBeenCalled()
    expect(hook.result.current.exporting).toBe(false)
    expect(hook.result.current.failure).toBe(false)
    hook.unmount()
  } finally {
    view.engine.dispose()
  }
})

it('does not apply a preview after another source is chosen in the same turn', async () => {
  const view = await motionView([motionClip(1)])
  try {
    const hook = renderHook(useRetargetWorkspace)
    act(() => hook.result.current.targetReady(view))
    state.result = { key: 'result', clip: wireClipOf(motionClip(1)), generation: state.generation }
    hook.rerender()
    act(() => {
      hook.result.current.choose({ kind: 'asset', assetId: 'second', name: 'second' }, 'second')
      void hook.result.current.apply()
    })
    expect(hook.result.current.exporting).toBe(false)
    expect(state.apply).not.toHaveBeenCalled()
    hook.unmount()
  } finally {
    view.engine.dispose()
  }
})
