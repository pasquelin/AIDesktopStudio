import { describe, expect, it } from 'vitest'
import type { Rig } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { retargetMessageOf } from './retargetChannel'

const rig: Rig = {
  origin: 'local',
  bones: [{ name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM }],
}
const snapshot = { assetId: 'hero', name: 'Hero', revision: 1, incarnation: 'session', rig }

describe('the retarget session boundary', () => {
  it('accepts a valid snapshot and preserves its skin arrays', () => {
    const message = {
      kind: 'snapshot',
      snapshot: {
        ...snapshot,
        bindings: [
          {
            mesh: 0,
            primitive: 0,
            skinIndex: new Uint16Array(4),
            skinWeight: new Float32Array([1, 0, 0, 0]),
          },
        ],
      },
    }
    expect(retargetMessageOf(message)).toEqual(message)
  })

  it('refuses corrupted skin bindings before they reach the viewport', () => {
    const corrupt = [
      {
        mesh: -1,
        primitive: 0,
        skinIndex: new Uint16Array(4),
        skinWeight: new Float32Array([1, 0, 0, 0]),
      },
      {
        mesh: 0,
        primitive: 0,
        skinIndex: new Uint16Array([1, 0, 0, 0]),
        skinWeight: new Float32Array([1, 0, 0, 0]),
      },
      {
        mesh: 0,
        primitive: 0,
        skinIndex: new Uint16Array(4),
        skinWeight: new Float32Array([NaN, 0, 0, 0]),
      },
      {
        mesh: 0,
        primitive: 0,
        skinIndex: new Uint16Array(3),
        skinWeight: new Float32Array([1, 0, 0]),
      },
    ]
    for (const binding of corrupt) {
      expect(
        retargetMessageOf({ kind: 'snapshot', snapshot: { ...snapshot, bindings: [binding] } }),
      ).toBeNull()
    }
  })

  it('refuses truncated animation payloads and malformed confirmed profiles', () => {
    const apply = {
      kind: 'apply',
      requestId: 'request',
      revision: 1,
      incarnation: 'session',
      name: 'Walk',
      glb: new Uint8Array(16),
    }
    expect(retargetMessageOf(apply)).toEqual(apply)
    expect(retargetMessageOf({ ...apply, glb: new Uint8Array(12) })).toBeNull()
    expect(retargetMessageOf({ ...apply, profiles: [{}] })).toBeNull()
  })
})

it('accepts an origin rig request only with its character incarnation', () => {
  expect(retargetMessageOf({ kind: 'editRig', incarnation: 'session' })).toEqual({
    kind: 'editRig',
    incarnation: 'session',
  })
  expect(retargetMessageOf({ kind: 'editRig' })).toBeNull()
})
