/**
 * Reading a skeleton a file already carries — the other half of `rigFit`, and what makes a
 * character rigged elsewhere editable here.
 */
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Bone, BoxGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { HUMANOID_BODY_ROLES } from '@shared/domain/humanoid'
import type { Rig } from '@shared/domain/rig'
import { applyRig, positionsIn, skinnableMeshesOf } from '../character/rigBuild'
import { rigFit, type Bounds } from './rigFit'
import { rigBonesOf, rigFromObject, rigReadFaultOf } from './rigRead'
import { skinVertices } from '../character/skinVertices'
import { wireOf } from '../character/skinWeights'

const BOUNDS: Bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }

function animatableCharacter(): { holder: Object3D; rig: Rig } {
  const holder = new Object3D()
  holder.add(new Mesh(new BoxGeometry(0.6, 1.8, 0.4), new MeshStandardMaterial()))

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

async function throughGltf(model: Object3D): Promise<Object3D> {
  const written = await new GLTFExporter().parseAsync(model, { binary: true })
  if (!(written instanceof ArrayBuffer)) throw new Error('the exporter answered something else')

  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(written, '', gltf => resolve(gltf.scene), reject)
  })
}

/** A bone under `holder`, hung on whatever object is named. */
function bone(name: string, under: Object3D, y: number): Bone {
  const made = new Bone()
  made.name = name
  made.position.set(0, y, 0)
  under.add(made)

  return made
}

describe('reading a skeleton off a model', () => {
  // Paired by NAME: the order is the file's own hierarchy, and a rig read back has no reason to
  // repeat the order the fitter happened to lay its bones in.
  it('gives back the very rig that was fitted, roles and rests alike', async () => {
    const { rig } = animatableCharacter()
    const read = rigFromObject(await throughGltf(animatableCharacter().holder))
    const fitted = new Map(rig.bones.map(one => [one.name, one]))

    expect(new Set(read?.bones.map(one => one.name))).toEqual(new Set(fitted.keys()))
    expect(new Set(read?.bones.flatMap(one => (one.role ? [one.role] : [])))).toEqual(
      new Set(HUMANOID_BODY_ROLES),
    )
    for (const one of read?.bones ?? []) {
      const from = fitted.get(one.name)
      expect(one.parent, one.name).toBe(from?.parent ?? null)
      expect(one.rest.position.x, one.name).toBeCloseTo(from?.rest.position.x ?? 0, 4)
      expect(one.rest.position.y, one.name).toBeCloseTo(from?.rest.position.y ?? 0, 4)
      expect(one.rest.position.z, one.name).toBeCloseTo(from?.rest.position.z ?? 0, 4)
    }
  })

  it('says a model carries an imported skeleton, never a locally fitted one', async () => {
    expect(rigFromObject(await throughGltf(animatableCharacter().holder))?.origin).toBe('imported')
  })

  // A rest read off the bone's own transform would be local to the TRUE parent, which is a space
  // `bonesOfRig` never rebuilds — it hangs each bone on the parent the RIG names.
  it('measures a rest against the parent the rig keeps, not the one the file happens to have', () => {
    const holder = new Object3D()
    const hips = bone('Hips', holder, 1)
    const spacer = new Object3D()
    spacer.position.set(0, 0.5, 0)
    hips.add(spacer)
    bone('Spine', spacer, 0.2)

    const read = rigBonesOf(holder).find(one => one.name === 'Spine')

    expect(read?.parent).toBe('Hips')
    expect(read?.rest.position.y).toBeCloseTo(0.7, 5)
  })

  it('drops a bone no name can address, and hangs its child on the one above', () => {
    const holder = new Object3D()
    const hips = bone('Hips', holder, 1)
    const nameless = new Bone()
    nameless.position.set(0, 0.3, 0)
    hips.add(nameless)
    bone('Spine', nameless, 0.2)

    expect(rigBonesOf(holder).map(one => ({ name: one.name, parent: one.parent }))).toEqual([
      { name: 'Hips', parent: null },
      { name: 'Spine', parent: 'Hips' },
    ])
  })

  it('holds several roots of a skeleton in one rig, rather than keeping the first', () => {
    const holder = new Object3D()
    bone('Hips', holder, 1)
    bone('PropRoot', holder, 0)

    expect(rigBonesOf(holder).filter(one => one.parent === null)).toHaveLength(2)
  })

  it('reads a posed file back at its bind pose, which is the pose a rig holds', async () => {
    const posed = await throughGltf(animatableCharacter().holder)
    const spine = posed.getObjectByName('Spine')
    if (!spine) throw new Error('the file came back without a spine')
    spine.rotation.set(0, 0, 1)

    expect(rigBonesOf(posed).find(one => one.name === 'Spine')?.rest.rotation.z).toBeCloseTo(0, 4)
  })

  // A name is all glTF has to say what a bone IS, so a skeleton spelled another way is read
  // wrongly until somebody puts it right — and that correction has to survive the file.
  it('lets the file put a role right where the name spells another', () => {
    const holder = new Object3D()
    bone('Bone_003', holder, 1)
    holder.userData = { aidesktopstudio: { roles: { Bone_003: 'Hips' } } }

    expect(rigFromObject(holder)?.bones[0]?.role).toBe('Hips')
  })

  it('gives no rig for a model that has no bone, and says which of the two is missing', () => {
    const holder = new Object3D()
    holder.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()))

    expect(rigFromObject(holder)).toBeNull()
    expect(rigReadFaultOf(holder)).toBe('no-bones')
  })

  it('gives no rig for a skeleton nothing can address, and says so apart', () => {
    const holder = new Object3D()
    holder.add(new Bone())

    expect(rigFromObject(holder)).toBeNull()
    expect(rigReadFaultOf(holder)).toBe('no-named-bone')
  })
})
