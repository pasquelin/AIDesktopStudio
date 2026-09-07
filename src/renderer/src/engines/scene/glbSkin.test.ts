/**
 * Putting a skeleton into a `.glb` and reading it back — the write half of `rigRead`, and the one
 * ⌘S performs. What it must never do is touch a picture: the file's own maps come back byte for
 * byte, which is exactly what `GLTFExporter` cannot promise.
 */
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { HUMANOID_BODY_ROLES } from '@shared/domain/humanoid'
import { glbChunksOf } from '@shared/domain/glbContainer'
import type { Rig } from '@shared/domain/rig'
import { glbSkinFaultOf, glbWithSkin, type GlbSkinPatch } from './glbSkin'
import { applyRig, positionsIn, skinnableMeshesOf } from '../character/rigBuild'
import { rigFit, type Bounds } from './rigFit'
import { rigFromObject } from './rigRead'
import { skinVertices } from '../character/skinVertices'
import { wireOf } from '../character/skinWeights'

const BOUNDS: Bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }

/** A character already rigged, as a file from Blender or a service comes. */
function animatableCharacter(): { holder: Object3D; rig: Rig } {
  const holder = bareCharacter()
  const rig = rigFit(BOUNDS)
  applyRig(
    holder,
    rig,
    skinnableMeshesOf(holder).flatMap((mesh: Mesh) => {
      const binding = skinVertices({ id: 0, ...wireOf(positionsIn(mesh, holder), rig) })
      return binding ? [{ mesh, binding }] : []
    }),
  )

  return { holder, rig }
}

function skinnedIn(root: Object3D): number {
  let found = 0
  root.traverse(object => {
    if (Reflect.get(object, 'isSkinnedMesh') === true) found += 1
  })

  return found
}

/** A bare mesh, as a downloaded character is before anybody rigs it. */
function bareCharacter(): Object3D {
  const holder = new Object3D()
  holder.add(new Mesh(new BoxGeometry(0.6, 1.8, 0.4), new MeshStandardMaterial()))

  return holder
}

async function written(model: Object3D): Promise<Uint8Array> {
  const bytes = await new GLTFExporter().parseAsync(model, { binary: true })
  if (!(bytes instanceof ArrayBuffer)) throw new Error('the exporter answered something else')

  return new Uint8Array(bytes)
}

function read(file: Uint8Array): Promise<Object3D> {
  const bytes = new ArrayBuffer(file.byteLength)
  new Uint8Array(bytes).set(file)

  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, '', gltf => resolve(gltf.scene), reject)
  })
}

/** The skeleton, the weights, and nothing hung in the file yet. */
function patchFor(model: Object3D, rig: Rig): GlbSkinPatch {
  const skins = skinnableMeshesOf(model).flatMap((mesh: Mesh, index: number) => {
    const binding = skinVertices({ id: 0, ...wireOf(positionsIn(mesh, model), rig) })
    return binding
      ? [{ mesh: index, primitive: 0, joints: binding.skinIndex, weights: binding.skinWeight }]
      : []
  })

  return { bones: rig.bones, skins, extras: {} }
}

describe('putting a skeleton into a file', () => {
  it('makes a bare mesh a character the studio reads back whole', async () => {
    const rig = rigFit(BOUNDS)
    const file = await written(bareCharacter())

    const back = rigFromObject(await read(glbWithSkin(file, patchFor(bareCharacter(), rig))))
    const fitted = new Map(rig.bones.map(one => [one.name, one]))

    expect(new Set(back?.bones.map(one => one.name))).toEqual(new Set(fitted.keys()))
    expect(new Set(back?.bones.flatMap(one => (one.role ? [one.role] : [])))).toEqual(
      new Set(HUMANOID_BODY_ROLES),
    )
    for (const one of back?.bones ?? []) {
      const from = fitted.get(one.name)
      expect(one.parent, one.name).toBe(from?.parent ?? null)
      expect(one.rest.position.y, one.name).toBeCloseTo(from?.rest.position.y ?? 0, 4)
    }
  })

  it('leaves what it was handed exactly as it was, so a save is never a re-encode', async () => {
    const file = await written(bareCharacter())
    const before = new Uint8Array(file)

    glbWithSkin(file, patchFor(bareCharacter(), rigFit(BOUNDS)))

    expect(file).toEqual(before)
  })

  // Written twice, the second pass has to REPLACE what the first left rather than hang a second
  // skeleton beside it.
  it('replaces its own skeleton instead of adding one on every save', async () => {
    const rig = rigFit(BOUNDS)
    const once = glbWithSkin(await written(bareCharacter()), patchFor(bareCharacter(), rig))
    const twice = glbWithSkin(once, patchFor(bareCharacter(), rig))

    expect(nodeCount(twice)).toBe(nodeCount(once))
    expect(rigFromObject(await read(twice))?.bones).toHaveLength(rig.bones.length)
  })

  it('carries the motions and the points of attachment the standard has no place for', async () => {
    const patch = {
      ...patchFor(bareCharacter(), rigFit(BOUNDS)),
      extras: { motions: [{ id: 'm1', name: 'Capoeira', assetId: 'asset-9' }] },
    }
    const file = glbWithSkin(await written(bareCharacter()), patch)

    expect((await read(file)).userData).toMatchObject({
      aidesktopstudio: { motions: [{ id: 'm1', name: 'Capoeira', assetId: 'asset-9' }] },
    })
  })

  it('patches only the extras when a model has no skeleton', async () => {
    const original = await written(bareCharacter())
    const file = glbWithSkin(original, {
      bones: [],
      skins: [],
      extras: { dress: { kind: 'image', assetId: 'texture-1' } },
    })

    expect((await read(file)).userData).toMatchObject({
      aidesktopstudio: { dress: { kind: 'image', assetId: 'texture-1' } },
    })
    expect(glbChunksOf(file)?.bin).toEqual(glbChunksOf(original)?.bin)
  })

  // 🛑 A character rigged elsewhere carries its own skin, and a save that stripped it would hand
  // back a file whose mesh follows nothing.
  it('leaves a skin this studio did not write exactly where it is', async () => {
    const { holder, rig } = animatableCharacter()
    const already = await written(holder)
    const patch = { bones: rig.bones, skins: [], extras: { motions: [] } }

    const back = await read(glbWithSkin(already, patch))

    expect(rigFromObject(back)?.bones.length).toBeGreaterThan(0)
    expect(skinnedIn(back)).toBeGreaterThan(0)
  })

  it('refuses bytes that are not a container, and says so before it writes', () => {
    const patch: GlbSkinPatch = { bones: rigFit(BOUNDS).bones, skins: [], extras: {} }

    expect(glbSkinFaultOf(new Uint8Array([1, 2, 3]), patch)).toBe('not-glb')
  })

  it('refuses a primitive it cannot append to, rather than writing half a skin', async () => {
    const file = await written(bareCharacter())
    const patch = patchFor(bareCharacter(), rigFit(BOUNDS))

    expect(glbSkinFaultOf(file, patch)).toBeNull()
    expect(glbSkinFaultOf(file, { ...patch, skins: [{ ...compressed(patch), mesh: 9 }] })).toBe(
      'unknown-primitive',
    )
  })
})

function compressed(patch: GlbSkinPatch) {
  const first = patch.skins[0]
  if (!first) throw new Error('the bare mesh gave no skin to work from')

  return first
}

function nodeCount(file: Uint8Array): number {
  const chunks = glbChunksOf(file)
  const gltf: unknown = chunks && JSON.parse(new TextDecoder().decode(chunks.json))
  return gltf && typeof gltf === 'object' && 'nodes' in gltf && Array.isArray(gltf.nodes)
    ? gltf.nodes.length
    : -1
}
