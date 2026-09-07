/**
 * A character made animatable, written to the open format and read back.
 *
 * The studio's 3D documents are glTF now, and a rig is the one part of a model whose meaning
 * could go missing on the way: glTF carries the skin and the joints in standard, but it has no
 * place at all for "this bone is the left elbow". Nothing writes those roles into the file, and
 * nothing needs to — the local rigger names each bone after its role, and `boneRoles` reads the
 * name back off the loaded scene. This is the test that the round trip therefore loses nothing.
 */
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { HUMANOID_BODY_ROLES } from '@shared/domain/humanoid'
import { applyRig, positionsIn, skinnableMeshesOf } from '../character/rigBuild'
import { rigFit, rigFitFaultOf, type Bounds } from './rigFit'
import { rigStateOf, type RigState } from './rigState'
import { skinVertices } from '../character/skinVertices'
import { wireOf } from '../character/skinWeights'

/** A body-sized box: the fit reads a bounding box and nothing else, and this one stands upright. */
const BOUNDS: Bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }

/** The whole of "make animatable", off the UI thread's work but through the same modules. */
function animatableCharacter(): Object3D {
  if (rigFitFaultOf(BOUNDS)) throw new Error('the fit refused a body-sized box')

  const holder = new Object3D()
  holder.add(new Mesh(new BoxGeometry(0.6, 1.8, 0.4), new MeshStandardMaterial()))

  const rig = rigFit(BOUNDS)
  applyRig(
    holder,
    rig,
    skinnableMeshesOf(holder).flatMap((mesh: Mesh) => {
      // `null` is what a cancelled walk answers, and nothing cancels this one.
      const binding = skinVertices({ id: 0, ...wireOf(positionsIn(mesh, holder), rig) })
      return binding ? [{ mesh, binding }] : []
    }),
  )

  return holder
}

async function throughGltf(model: Object3D): Promise<RigState> {
  const written = await new GLTFExporter().parseAsync(model, { binary: true })
  if (!(written instanceof ArrayBuffer)) throw new Error('the exporter answered something else')

  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(written, '', gltf => resolve(rigStateOf(gltf.scene)), reject)
  })
}

describe('a character made animatable, written as glTF', () => {
  it('is a rigged character before it is written', () => {
    expect(rigStateOf(animatableCharacter()).status).toBe('riggedCharacter')
  })

  it('comes back a rigged character rather than an unnamed skinned mesh', async () => {
    expect((await throughGltf(animatableCharacter())).status).toBe('riggedCharacter')
  })

  it('comes back with every one of its twenty-two roles', async () => {
    const state = await throughGltf(animatableCharacter())

    expect(new Set(state.bones.flatMap(bone => (bone.role ? [bone.role] : [])))).toEqual(
      new Set(HUMANOID_BODY_ROLES),
    )
  })
})
