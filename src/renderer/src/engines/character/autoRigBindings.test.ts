import { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import type { AutoRigResult } from '@shared/domain/autoRig'
import { autoRigBindingsFor } from './autoRigBindings'

const binding = (mesh: number, value: number) => ({
  mesh,
  primitive: 0,
  skinIndex: new Uint16Array([0, 0, 0, 0]),
  skinWeight: new Float32Array([value, 1 - value, 0, 0]),
})

describe('Auto Rig mesh targets', () => {
  it('resolves bindings by glTF identity instead of array order', () => {
    const first = new Mesh()
    const second = new Mesh()
    const result: AutoRigResult = {
      rig: { bones: [], origin: 'local' },
      bindings: [binding(1, 0.75), binding(0, 1)],
      metadata: { backendId: 'test', sourceInfluences: 4, outputInfluences: 4, fingers: false },
    }

    const resolved = autoRigBindingsFor(result, [
      { mesh: 0, primitive: 0, object: first },
      { mesh: 1, primitive: 0, object: second },
    ])

    expect(resolved?.map(one => one.mesh)).toEqual([second, first])
  })

  it('refuses duplicate bindings that leave a target unresolved', () => {
    const result: AutoRigResult = {
      rig: { bones: [], origin: 'local' },
      bindings: [binding(0, 1), binding(0, 0.75)],
      metadata: { backendId: 'test', sourceInfluences: 4, outputInfluences: 4, fingers: false },
    }

    expect(
      autoRigBindingsFor(result, [
        { mesh: 0, primitive: 0, object: new Mesh() },
        { mesh: 1, primitive: 0, object: new Mesh() },
      ]),
    ).toBeNull()
  })
})
