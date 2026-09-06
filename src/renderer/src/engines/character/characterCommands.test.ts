import { describe, expect, it } from 'vitest'
import type { Rig } from '@shared/domain/rig'
import type { ModelDressRef } from '@shared/domain/scene'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import {
  addCharacterBone,
  addCharacterIkChain,
  addCharacterSocket,
  dressCharacter,
  linkCharacterMotion,
  removeCharacterBone,
  removeCharacterIkChain,
  removeCharacterSocket,
  renameCharacterBone,
  setCharacterBoneRest,
  setCharacterBoneRole,
  setCharacterAutoRig,
  setCharacterRig,
  unlinkCharacterMotion,
  wearCharacterMaterialAt,
} from './characterCommands'
import { EMPTY_CHARACTER, type CharacterState } from './characterState'

const RIG: Rig = {
  origin: 'imported',
  bones: [
    { name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM, role: 'Hips' },
    { name: 'LeftUpperLeg', parent: 'Hips', rest: IDENTITY_TRANSFORM },
    { name: 'LeftLowerLeg', parent: 'LeftUpperLeg', rest: IDENTITY_TRANSFORM },
    { name: 'LeftFoot', parent: 'LeftLowerLeg', rest: IDENTITY_TRANSFORM },
  ],
}

const RIGGED: CharacterState = { ...EMPTY_CHARACTER, assetId: 'asset-1', rig: RIG }

const SOCKET = { id: 's1', name: 'Paume droite', bone: 'LeftFoot', rest: IDENTITY_TRANSFORM }

describe('editing a character', () => {
  it('undoes an advanced rig with all of its backend-neutral skin bindings', () => {
    const binding = {
      mesh: 0,
      primitive: 0,
      skinIndex: new Uint16Array([0, 0, 0, 0]),
      skinWeight: new Float32Array([1, 0, 0, 0]),
    }
    const command = setCharacterAutoRig({
      rig: RIG,
      bindings: [binding],
      metadata: {
        backendId: 'make-it-animatable',
        sourceInfluences: 52,
        outputInfluences: 4,
        fingers: true,
      },
    })
    const after = command.apply(EMPTY_CHARACTER)

    expect(after.autoRigBindings).toEqual([binding])
    expect(command.revert(after)).toEqual(EMPTY_CHARACTER)
  })

  it('undoes what it did, which is the whole reason a rig is a document', () => {
    const command = removeCharacterBone('LeftFoot')
    const after = command.apply(RIGGED)

    expect(after.rig?.bones).toHaveLength(3)
    expect(command.revert(after)).toEqual(RIGGED)
  })

  it('hangs a bone taken out on the one above, rather than taking its children with it', () => {
    const after = removeCharacterBone('LeftLowerLeg').apply(RIGGED)

    expect(after.rig?.bones.find(one => one.name === 'LeftFoot')?.parent).toBe('LeftUpperLeg')
  })

  // A rig the reader would drop on the next open is never written: `rigFaultOf` is the one judge.
  it('refuses a name another bone already answers to', () => {
    const command = renameCharacterBone('LeftFoot', 'Hips')

    expect(command.refuses?.(RIGGED)).toBe(true)
    expect(command.apply(RIGGED)).toEqual(RIGGED)
  })

  it('refuses to rename a bone carrying an attachment point', () => {
    const state = { ...RIGGED, sockets: [SOCKET] }
    const command = renameCharacterBone('LeftFoot', 'RightFoot')

    expect(command.refuses?.(state)).toBe(true)
    expect(command.apply(state)).toEqual(state)
  })

  it('refuses to remove a bone carrying an attachment point', () => {
    const state = { ...RIGGED, sockets: [SOCKET] }
    const command = removeCharacterBone('LeftFoot')

    expect(command.refuses?.(state)).toBe(true)
    expect(command.apply(state)).toEqual(state)
  })

  it('takes a role from whichever bone held it, a rig holding one twice being unreadable', () => {
    const after = setCharacterBoneRole('LeftFoot', 'Hips').apply(RIGGED)

    expect(after.rig?.bones.find(one => one.name === 'Hips')?.role).toBeUndefined()
    expect(after.rig?.bones.find(one => one.name === 'LeftFoot')?.role).toBe('Hips')
  })

  // What makes a fit read off a bounding box usable at all: it lands a joint near where it
  // belongs, and this is the only gesture that puts it where it actually is.
  it('rests a joint where the gizmo left it, and puts it back on undo', () => {
    const moved = { ...IDENTITY_TRANSFORM, position: { x: 0.4, y: 1.2, z: 0 } }
    const command = setCharacterBoneRest('LeftFoot', moved)
    const after = command.apply(RIGGED)

    expect(after.rig?.bones.find(one => one.name === 'LeftFoot')?.rest).toEqual(moved)
    expect(command.revert(after)).toEqual(RIGGED)
  })

  it('moves nothing for a name the rig has not got, a gizmo outliving a rename', () => {
    const moved = { ...IDENTITY_TRANSFORM, position: { x: 9, y: 9, z: 9 } }

    expect(setCharacterBoneRest('Tail', moved).apply(RIGGED).rig?.bones).toEqual(RIG.bones)
  })

  it('names a child after its parent, so a document reads the same in either language', () => {
    const after = addCharacterBone('LeftFoot').apply(RIGGED)

    expect(after.rig?.bones.at(-1)?.name).toBe('LeftFoot.1')
  })

  // The handle is a bone one pulls: three's solver reaches for bones and knows nothing else.
  it('gives a chain its handle, and takes the handle back with the chain', () => {
    const added = addCharacterIkChain('LeftFoot').apply(RIGGED)
    expect(added.rig?.bones.some(one => one.name === 'LeftFoot.handle')).toBe(true)
    expect(added.rig?.ik).toHaveLength(1)

    const removed = removeCharacterIkChain('LeftFoot.handle').apply(added)
    expect(removed.rig?.bones.some(one => one.name === 'LeftFoot.handle')).toBe(false)
    expect(removed.rig?.ik).toEqual([])
  })

  it('refuses a chain on a bone this rig has not got', () => {
    expect(addCharacterIkChain('Tail').refuses?.(RIGGED)).toBe(true)
  })

  it('refuses a point of attachment on a bone nothing can follow', () => {
    expect(addCharacterSocket({ ...SOCKET, bone: 'Tail' }).refuses?.(RIGGED)).toBe(true)
  })

  it('refuses a second point of attachment answering to the same name', () => {
    const one = addCharacterSocket(SOCKET).apply(RIGGED)

    expect(addCharacterSocket({ ...SOCKET, id: 's2' }).refuses?.(one)).toBe(true)
    expect(removeCharacterSocket('s1').apply(one).sockets).toEqual([])
  })

  // A motion is a FILE: forgetting it here leaves it where it is, for the next character.
  it('links a motion once, and forgets it without taking the file with it', () => {
    const motion = { id: 'm1', name: 'Capoeira', assetId: 'asset-9' }
    const linked = linkCharacterMotion(motion).apply(RIGGED)

    expect(linked.motions).toEqual([motion])
    expect(linkCharacterMotion({ ...motion, id: 'm2' }).refuses?.(linked)).toBe(true)
    expect(unlinkCharacterMotion('m1').apply(linked).motions).toEqual([])
  })

  it('puts a skeleton on a character that had none, and takes it back off', () => {
    const command = setCharacterRig(RIG)
    const after = command.apply({ ...EMPTY_CHARACTER, assetId: 'asset-1' })

    expect(after.rig).toBe(RIG)
    expect(command.revert(after).rig).toBeNull()
  })

  it('keeps a reversible material dress on the character file', () => {
    const dress: ModelDressRef = { kind: 'materials', documentIds: ['material-1'] }
    const command = dressCharacter(dress)
    const dressed = command.apply(RIGGED)

    expect(dressed.dress).toEqual(dress)
    expect(command.revert(dressed)).toEqual(RIGGED)
    expect(dressCharacter(null).apply(dressed).dress).toBeUndefined()
  })

  it('keeps the remembered image when an assembled material arrives', () => {
    const covered = dressCharacter({ kind: 'image', assetId: 'pic-1' }).apply(RIGGED)

    expect(wearCharacterMaterialAt(0, 'material-1').apply(covered).dress).toEqual({
      kind: 'materials',
      documentIds: ['material-1'],
      imageAssetId: 'pic-1',
    })
  })
})
