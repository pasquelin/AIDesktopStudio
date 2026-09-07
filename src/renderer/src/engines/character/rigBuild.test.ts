import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Rig } from '@shared/domain/rig'
import { INFLUENCES } from './skinMessage'
import { emptyBinding } from './skinVertices'
import {
  applyRig,
  bonesOfRig,
  positionsIn,
  removeRig,
  restRig,
  skinnableMeshesOf,
  wearsRig,
} from './rigBuild'

const REST = (x: number, y: number, z: number) => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
})

const RIG: Rig = {
  origin: 'local',
  bones: [
    { name: 'Hips', parent: null, rest: REST(0, 1, 0), role: 'Hips' },
    { name: 'Spine', parent: 'Hips', rest: REST(0, 0.2, 0), role: 'Spine' },
    { name: 'Head', parent: 'Spine', rest: REST(0, 0.4, 0), role: 'Head' },
  ],
}

function modelWith(...meshes: Object3D[]): Group {
  const holder = new Group()
  for (const mesh of meshes) holder.add(mesh)
  return holder
}

const plainMesh = () => new Mesh(new BoxGeometry(), new MeshStandardMaterial())

const bindingFor = (mesh: Mesh) => emptyBinding(mesh.geometry.getAttribute('position').count)

describe('the bones a rig becomes', () => {
  it('parents them the way the rig spells it', () => {
    const { bones } = bonesOfRig(RIG)
    const spine = bones.find(bone => bone.name === 'Spine')

    expect(spine?.parent?.name).toBe('Hips')
  })

  it('hands back the roots apart, since they are what hangs on the model', () => {
    expect(bonesOfRig(RIG).roots.map(bone => bone.name)).toEqual(['Hips'])
  })

  // The weights index into this order: shuffling it would have every vertex follow another bone.
  it('keeps the rig own order, which is the order the weights index into', () => {
    expect(bonesOfRig(RIG).bones.map(bone => bone.name)).toEqual(['Hips', 'Spine', 'Head'])
  })

  it('rests each bone where the rig put it, in its parent space', () => {
    const spine = bonesOfRig(RIG).bones.find(bone => bone.name === 'Spine')

    expect(spine?.position.y).toBeCloseTo(0.2, 6)
  })
})

describe('which meshes can be bound', () => {
  it('finds the plain ones', () => {
    expect(skinnableMeshesOf(modelWith(plainMesh(), plainMesh()))).toHaveLength(2)
  })

  // A file that already carries a rig is left to the rigger that made it — rebinding it would
  // throw away weights someone painted.
  it('leaves an already skinned mesh alone', () => {
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial())

    expect(skinnableMeshesOf(modelWith(skinned))).toEqual([])
  })
})

describe('reading a mesh positions in its holder space', () => {
  // The bones are fitted to the holder's bounding box while a mesh inside a GLB carries a
  // transform of its own: measuring in the wrong one lands the whole rig beside the body.
  it('carries the mesh own transform into the numbers', () => {
    const mesh = plainMesh()
    mesh.position.set(10, 0, 0)
    const positions = positionsIn(mesh, modelWith(mesh))

    expect(positions[0]).toBeCloseTo(10.5, 5)
  })

  it('answers three floats per vertex', () => {
    const mesh = plainMesh()
    const count = mesh.geometry.getAttribute('position').count

    expect(positionsIn(mesh, modelWith(mesh))).toHaveLength(count * 3)
  })
})

describe('putting a rig on a model', () => {
  it('replaces the plain mesh by a skinned one bound to the bones', () => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    const skinned = skinnedIn(holder)
    expect(skinned).not.toBeNull()
    expect(skinned?.skeleton.bones.map(bone => bone.name)).toEqual(['Hips', 'Spine', 'Head'])
  })

  /**
   * 🛑 `bind` reads the mesh's own `matrixWorld`, and a mesh created and parented a line earlier
   * still carries the identity: the character then stood beside its skeleton. Measured on screen
   * the day the skeleton window stopped re-measuring on mount, which had been hiding it.
   */
  it('leaves the skin measured against the rest it was just given', () => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)
    holder.position.set(3, 0, 0)

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    const skinned = skinnedIn(holder)
    const hips = skinned?.skeleton.bones[0]
    // The inverse of a bone standing at the rest undoes exactly where that bone stands.
    expect(skinned?.skeleton.boneInverses[0]?.elements[12]).toBeCloseTo(-3, 5)
    expect(hips?.matrixWorld.elements[12]).toBeCloseTo(3, 5)
  })

  it('hangs the bones on the model, so they move with it', () => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    expect(holder.children.some(child => child.name === 'Hips')).toBe(true)
  })

  it('writes four influences per vertex onto the geometry', () => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)
    const count = mesh.geometry.getAttribute('position').count

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    const skinned = skinnedIn(holder)
    expect(skinned?.geometry.getAttribute('skinIndex').count).toBe(count)
    expect(skinned?.geometry.getAttribute('skinWeight').itemSize).toBe(INFLUENCES)
  })

  it('keeps the mesh where it stood, and what it was called', () => {
    const mesh = plainMesh()
    mesh.name = 'body'
    mesh.position.set(1, 2, 3)

    const holder = modelWith(mesh)
    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    const skinned = skinnedIn(holder)
    expect(skinned?.name).toBe('body')
    expect(skinned?.position.toArray()).toEqual([1, 2, 3])
  })

  it('preserves editor and rendering properties when replacing a mesh', () => {
    const mesh = plainMesh()
    const child = new Object3D()
    mesh.add(child)
    mesh.visible = false
    mesh.layers.set(3)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.renderOrder = 7
    mesh.frustumCulled = false
    mesh.userData = { assetId: 'body' }
    const holder = modelWith(mesh)

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    const skinned = skinnedIn(holder)
    expect(skinned).toMatchObject({
      visible: false,
      castShadow: true,
      receiveShadow: true,
      renderOrder: 7,
      frustumCulled: false,
      userData: { assetId: 'body' },
    })
    expect(skinned?.layers.mask).toBe(mesh.layers.mask)
    expect(child.parent).toBe(skinned)
  })

  it('restores every mesh when a multi-mesh commit fails', () => {
    const first = plainMesh()
    const second = plainMesh()
    const firstParent = modelWith(first)
    const secondParent = modelWith(second)
    const holder = modelWith(firstParent, secondParent)
    vi.spyOn(secondParent, 'add').mockImplementationOnce(() => {
      throw new Error('injected commit failure')
    })

    expect(() =>
      applyRig(holder, RIG, [
        { mesh: first, binding: bindingFor(first) },
        { mesh: second, binding: bindingFor(second) },
      ]),
    ).toThrow('injected commit failure')
    expect(first.parent).toBe(firstParent)
    expect(second.parent).toBe(secondParent)
    expect(holder.getObjectByProperty('isSkinnedMesh', true)).toBeUndefined()
    expect(holder.children.some(child => child instanceof Object3D && child.name === 'Hips')).toBe(
      false,
    )
  })

  /**
   * `Skeleton` takes each bone's inverse from its `matrixWorld` the moment it is built. Bones just
   * created carry the identity, so binding before the graph is updated leaves every inverse wrong
   * — and the character bursts apart on the first frame, at rest, with nothing to say why.
   */
  it('takes the bone inverses from where the bones actually stand', () => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    const inverse = skinnedIn(holder)?.skeleton.boneInverses[0]
    // Hips rest a metre up, so its inverse takes a metre back off.
    expect(inverse?.elements[13]).toBeCloseTo(-1, 6)
  })

  /**
   * `SkeletonUtils.clone` shares geometries with the cached source on purpose. Writing skin
   * attributes onto one would hand them to every other node built from the same file, and the
   * last rig posed would silently drive all of them.
   */
  it('leaves the shared geometry of the model cache alone', () => {
    const mesh = plainMesh()
    const shared = mesh.geometry
    const holder = modelWith(mesh)

    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    expect(shared.getAttribute('skinIndex')).toBeUndefined()
    expect(skinnedIn(holder)?.geometry.getAttribute('skinIndex')).toBeDefined()
  })

  it('leaves a model with nothing to bind untouched', () => {
    const holder = modelWith(new Object3D())

    applyRig(holder, RIG, [])

    expect(holder.children.some(child => child.name === 'Hips')).toBe(false)
  })
})

describe('taking a rig off a model', () => {
  it('hands back a plain mesh with no skin left on its geometry', () => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)
    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])

    removeRig(holder)

    const plain = holder.children.find((child): child is Mesh => child instanceof Mesh)
    expect(plain).toBeDefined()
    expect(plain).not.toBeInstanceOf(SkinnedMesh)
    // `Mesh.prototype.copy` ends on `this.geometry = source.geometry`: used here it handed the
    // SKINNED geometry back, and the dispose that follows freed the one the mesh was left with.
    expect(plain?.geometry.getAttribute('skinIndex')).toBeUndefined()
    expect(plain?.geometry.getAttribute('skinWeight')).toBeUndefined()
  })

  it('keeps what hung under the mesh, and the place it stood in', () => {
    const first = plainMesh()
    const mesh = plainMesh()
    const child = new Object3D()
    mesh.add(child)
    const holder = modelWith(first, mesh)
    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])
    const before = holder.children.indexOf(skinnedIn(holder) as Object3D)

    removeRig(holder)

    const plain = holder.children.find(
      (candidate): candidate is Mesh => candidate instanceof Mesh && candidate !== first,
    )
    expect(plain?.children).toContain(child)
    expect(holder.children.indexOf(plain as Object3D)).toBe(before)
  })

  it('does not dispose geometry shared with another instance of the same file', () => {
    const geometry = new BoxGeometry()
    const disposed: BufferGeometry[] = []
    const original = geometry.dispose.bind(geometry)
    geometry.dispose = () => {
      disposed.push(geometry)
      original()
    }
    const source = new SkinnedMesh(geometry, new MeshStandardMaterial())
    // `Mesh.clone` keeps the source geometry, which is the Mixamo/cache case this guards.
    const instance = source.clone() as SkinnedMesh
    const holder = modelWith(instance)

    applyRig(holder, RIG, [{ mesh: instance, binding: bindingFor(instance) }])
    removeRig(holder)

    expect(disposed).toEqual([])
    expect(source.geometry.getAttribute('position')).toBeDefined()
  })
})

describe('editing the rest of a rig a model already wears', () => {
  /** The same rig with one joint moved — which is every drag of the gizmo in the window. */
  const MOVED: Rig = {
    ...RIG,
    bones: RIG.bones.map(bone =>
      bone.name === 'Spine' ? { ...bone, rest: REST(0.3, 0.2, 0) } : bone,
    ),
  }

  const rigged = (): Object3D => {
    const mesh = plainMesh()
    const holder = modelWith(mesh)
    applyRig(holder, RIG, [{ mesh, binding: bindingFor(mesh) }])
    return holder
  }

  // What tells a rest EDIT from a rebuild: a joint moved changes where the bones stand and never
  // which ones there are.
  it('knows a model wearing these very bones from one that is not', () => {
    const holder = rigged()

    expect(wearsRig(holder, RIG)).toBe(true)
    expect(wearsRig(holder, MOVED)).toBe(true)
    expect(wearsRig(holder, { ...RIG, bones: RIG.bones.slice(0, 2) })).toBe(false)
    expect(wearsRig(modelWith(plainMesh()), RIG)).toBe(false)
  })

  it('refuses a rig hanging the same bones off one another differently', () => {
    const reparented: Rig = {
      ...RIG,
      bones: RIG.bones.map(bone => (bone.name === 'Head' ? { ...bone, parent: 'Hips' } : bone)),
    }

    expect(wearsRig(rigged(), reparented)).toBe(false)
  })

  it('puts the bones where the rig now rests', () => {
    const holder = rigged()

    restRig(holder, MOVED)

    expect(holder.getObjectByName('Spine')?.position.x).toBeCloseTo(0.3, 6)
  })

  /**
   * 🛑 The whole point, and the defect it was written for: a joint dragged onto the elbow it
   * belongs in must not drag the arm with it. The weights are per vertex and unchanged; what
   * changes is the pose they are measured FROM, so the deformation is the identity once more.
   */
  it('leaves the skin exactly where it was, which is what makes a skeleton editable', () => {
    const holder = rigged()
    const skinned = skinnedIn(holder)
    if (!skinned) throw new Error('the fixture binds one skinned mesh')

    const before = skinned.skeleton.boneInverses.map(one => one.elements.slice())
    restRig(holder, MOVED)
    const after = skinned.skeleton.boneInverses.map(one => one.elements.slice())

    // The bone that moved is measured from somewhere else now, and the ones that did not are not.
    expect(after[1]).not.toEqual(before[1])
    expect(after[0]).toEqual(before[0])
  })
})

function skinnedIn(holder: Object3D): SkinnedMesh | null {
  let found: SkinnedMesh | null = null
  holder.traverse(object => {
    if (object instanceof SkinnedMesh) found = object
  })
  return found
}
