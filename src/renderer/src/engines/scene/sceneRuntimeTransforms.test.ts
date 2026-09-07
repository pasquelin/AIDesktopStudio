// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { SceneRenderer } from './SceneRenderer'
import { meshNode, groupNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE } from './sceneState'
import { animationTrack, timelineWith } from './animation-fixtures'
import { SECOND } from '@shared/domain/time'

const raised = (y: number) => ({ ...IDENTITY_TRANSFORM, position: { x: 0, y, z: 0 } })

describe('runtime transform application', () => {
  it('keeps an earlier snapshot unchanged after a later runtime placement', () => {
    const engine = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    try {
      engine.apply({ ...EMPTY_SCENE, nodes: [meshNode('a')] })
      engine.applyRuntimeTransforms([{ id: 'a', transform: raised(1) }])
      const before = engine.runtimeValidationSnapshot()
      engine.applyRuntimeTransforms([{ id: 'a', transform: raised(2) }])
      expect(before.undoRedo.find(node => node.id === 'a')?.transform.position.y).toBe(1)
      expect(before.transforms.logical.find(node => node.id === 'a')?.transform.position.y).toBe(1)
    } finally {
      engine.dispose()
    }
  })
  it('copies runtime poses and restores the authored matrices on a full apply', () => {
    const engine = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    const state = { ...EMPTY_SCENE, nodes: [meshNode('a'), meshNode('b', 'a')] }
    const pose = raised(3)
    try {
      engine.apply(state)
      expect(engine.applyRuntimeTransforms([{ id: 'a', transform: pose }])).toBe(true)
      pose.position.y = 9
      const moved = engine.runtimeValidationSnapshot().transforms.rendered
      expect(moved.find(node => node.id === 'a')?.matrix?.[13]).toBe(3)
      expect(moved.find(node => node.id === 'b')?.matrix?.[13]).toBe(3)
      expect(state.nodes[0]?.transform.position.y).toBe(0)
      engine.apply(state)
      const stopped = engine.runtimeValidationSnapshot().transforms.rendered
      expect(stopped.find(node => node.id === 'a')?.matrix?.[13]).toBe(0)
      expect(stopped.find(node => node.id === 'b')?.matrix?.[13]).toBe(0)
    } finally {
      engine.dispose()
    }
  })

  it('rejects an unsupported batch atomically before moving any mesh', () => {
    const engine = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    try {
      engine.apply({ ...EMPTY_SCENE, nodes: [meshNode('a'), groupNodeFixture('group')] })
      expect(
        engine.applyRuntimeTransforms([
          { id: 'a', transform: raised(3) },
          { id: 'group', transform: raised(5) },
        ]),
      ).toBe(false)
      expect(
        engine.runtimeValidationSnapshot().transforms.rendered.find(node => node.id === 'a')
          ?.matrix?.[13],
      ).toBe(0)
    } finally {
      engine.dispose()
    }
  })

  it('matches full application with timeline poses and preserves a subsequent document edit', () => {
    const delta = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    const full = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    const track = animationTrack(
      'move',
      'position',
      [
        { time: 0, value: { x: 0, y: 0, z: 0 } },
        { time: SECOND, value: { x: 2, y: 0, z: 0 } },
      ],
      { target: { nodeId: 'a', property: 'position' } },
    )
    const state = {
      ...EMPTY_SCENE,
      nodes: [meshNode('a'), meshNode('b', 'a')],
      animation: timelineWith([track]),
    }
    try {
      delta.apply(state)
      full.apply(state)
      delta.setPlayhead(SECOND / 2)
      full.setPlayhead(SECOND / 2)
      expect(delta.applyRuntimeTransforms([{ id: 'a', transform: raised(4) }])).toBe(true)
      full.apply({
        ...state,
        nodes: [{ ...meshNode('a'), transform: raised(4) }, meshNode('b', 'a')],
      })
      expect(delta.runtimeValidationSnapshot().transforms).toEqual(
        full.runtimeValidationSnapshot().transforms,
      )

      const edited = {
        ...state,
        nodes: [{ ...meshNode('a'), name: 'Edited', transform: raised(7) }],
      }
      delta.apply(edited)
      expect(delta.applyRuntimeTransforms([{ id: 'a', transform: raised(8) }])).toBe(true)
      delta.apply(edited)
      expect(
        delta.runtimeValidationSnapshot().transforms.rendered.find(node => node.id === 'a')
          ?.matrix?.[13],
      ).toBe(7)
      expect(edited.nodes[0]?.name).toBe('Edited')
      expect(edited.nodes[0]?.transform.position.y).toBe(7)
    } finally {
      delta.dispose()
      full.dispose()
    }
  })
})
