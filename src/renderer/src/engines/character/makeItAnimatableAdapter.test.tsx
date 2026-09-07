import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  BoxGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { rigFaultOf } from '@shared/domain/rig'
import {
  adaptMakeItAnimatable,
  dominantFour,
  type MakeItAnimatableOutput,
} from './makeItAnimatableAdapter'
import { applyRig, bonesOfRig } from './rigBuild'
import { glbWithSkin } from '../scene/glbSkin'
import { rigFromObject } from '../scene/rigRead'

function output(overrides: Partial<MakeItAnimatableOutput> = {}): MakeItAnimatableOutput {
  return {
    jointNames: ['Hips', 'Spine', 'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3'],
    parents: new Int16Array([-1, 0, 1, 2, 3]),
    joints: new Float32Array([0, 1, 0, 0, 2, 0, 1, 2, 0, 1.2, 2, 0, 1.4, 2, 0]),
    tails: new Float32Array([0, 2, 0, 1, 2, 0, 1.2, 2, 0, 1.4, 2, 0, 1.6, 2, 0]),
    weights: new Float32Array([
      0.1, 0.2, 0.3, 0.15, 0.25, 0.7, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05, 0.1, 0.3, 0.5,
    ]),
    sourceInfluences: 5,
    modelToInput: new Float32Array(
      new Matrix4()
        .compose(
          new Vector3(4, 0, 0),
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
          new Vector3(2, 2, 2),
        )
        .invert().elements,
    ),
    inputToModel: new Float32Array(
      new Matrix4().compose(
        new Vector3(4, 0, 0),
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
        new Vector3(2, 2, 2),
      ).elements,
    ),
    primitives: [
      { mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 2 },
      { mesh: 1, primitive: 0, vertexOffset: 2, vertexCount: 1 },
    ],
    ...overrides,
  }
}

describe('Make-It-Animatable adaptation', () => {
  it('converts global joints into a valid local AI Desktop Studio rig', () => {
    const adaptation = adaptMakeItAnimatable(output())

    expect(adaptation.fault).toBeNull()
    expect(rigFaultOf(adaptation.result?.rig.bones ?? [])).toBeNull()
    expect(adaptation.result?.rig.bones[0]?.rest.position.x).toBeCloseTo(2, 6)
    expect(adaptation.result?.rig.bones[0]?.rest.position.y).toBeCloseTo(0, 6)
    expect(adaptation.result?.rig.bones[2]?.role).toBe('LeftLittle1')
    if (!adaptation.result) throw new Error('Expected a valid adaptation')
    const { bones, roots } = bonesOfRig(adaptation.result.rig)
    const holder = new Object3D()
    holder.add(...roots)
    holder.updateWorldMatrix(false, true)
    expect(bones[1]?.getWorldPosition(new Vector3()).x).toBeCloseTo(0, 6)
    expect(bones[1]?.getWorldPosition(new Vector3()).y).toBeCloseTo(0, 6)
    const spineAxis = new Vector3(0, 1, 0).applyQuaternion(
      bones[1]?.getWorldQuaternion(new Quaternion()) ?? new Quaternion(),
    )
    expect(spineAxis.y).toBeCloseTo(1, 6)
  })

  it('keeps original primitive boundaries while reducing each vertex to four influences', () => {
    const adaptation = adaptMakeItAnimatable(output())
    const bindings = adaptation.result?.bindings ?? []

    expect(
      bindings.map(binding => [binding.mesh, binding.primitive, binding.skinWeight.length]),
    ).toEqual([
      [0, 0, 8],
      [1, 0, 4],
    ])
    for (const binding of bindings) {
      for (let vertex = 0; vertex < binding.skinWeight.length / 4; vertex += 1) {
        const sum = binding.skinWeight.slice(vertex * 4, vertex * 4 + 4).reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(1, 6)
      }
    }
    expect([...(bindings[0]?.skinIndex.slice(0, 4) ?? [])]).toEqual([2, 4, 1, 3])
  })

  it('orients editable limb, spine, neck and head bones along their rest segments', () => {
    const names = [
      'Hips',
      'Spine',
      'Spine1',
      'Spine2',
      'Neck',
      'Head',
      'LeftShoulder',
      'LeftArm',
      'LeftForeArm',
      'LeftHand',
      'LeftUpLeg',
      'LeftLeg',
      'LeftFoot',
    ]
    const parents = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 0, 10, 11]
    const heads = names.flatMap((_, index) => [index * 0.1, index, index * -0.05])
    const tails = names.flatMap((_, index) => [index * 0.1 + 0.2, index + 0.8, index * -0.05 + 0.1])
    const weights = new Float32Array(names.length)
    weights[0] = 1
    const adaptation = adaptMakeItAnimatable({
      jointNames: names,
      parents: Int16Array.from(parents),
      joints: Float32Array.from(heads),
      tails: Float32Array.from(tails),
      weights,
      sourceInfluences: names.length,
      modelToInput: new Float32Array(new Matrix4().elements),
      inputToModel: new Float32Array(new Matrix4().elements),
      primitives: [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 1 }],
    })
    if (!adaptation.result) throw new Error('Expected oriented bones')
    const { bones, roots } = bonesOfRig(adaptation.result.rig)
    const holder = new Object3D()
    holder.add(...roots)
    holder.updateWorldMatrix(false, true)

    for (const [index, bone] of bones.entries()) {
      const expected = new Vector3(
        (tails[index * 3] ?? 0) - (heads[index * 3] ?? 0),
        (tails[index * 3 + 1] ?? 0) - (heads[index * 3 + 1] ?? 0),
        (tails[index * 3 + 2] ?? 0) - (heads[index * 3 + 2] ?? 0),
      ).normalize()
      const axis = new Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion()))
      expect(axis.dot(expected), bone.name).toBeCloseTo(1, 5)
    }
  })

  it('shares one inferred vertex range across primitives of the same source mesh', () => {
    const adaptation = adaptMakeItAnimatable(
      output({
        primitives: [
          { mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 2 },
          { mesh: 0, primitive: 1, vertexOffset: 0, vertexCount: 2 },
          { mesh: 1, primitive: 0, vertexOffset: 2, vertexCount: 1 },
        ],
      }),
    )

    expect(adaptation.fault).toBeNull()
    expect(adaptation.result?.bindings.map(binding => binding.skinWeight.length)).toEqual([8, 8, 4])
    expect(adaptation.result?.bindings[0]?.skinWeight).toEqual(
      adaptation.result?.bindings[1]?.skinWeight,
    )
  })

  it('refuses corrupt weights before they reach Three.js', () => {
    const weights = output().weights.slice()
    weights[3] = Number.NaN

    expect(adaptMakeItAnimatable(output({ weights })).fault).toBe('invalid-weights')
    expect(dominantFour(new Float32Array([0, 0, 0]), 3)).toBeNull()
  })

  it('refuses preprocessing transforms that are not mutual inverses', () => {
    expect(
      adaptMakeItAnimatable(output({ modelToInput: new Float32Array(new Matrix4().elements) }))
        .fault,
    ).toBe('invalid-transform')
  })

  it('refuses a primitive map that would silently assign weights to the wrong mesh', () => {
    expect(
      adaptMakeItAnimatable(
        output({ primitives: [{ mesh: 0, primitive: 0, vertexOffset: 1, vertexCount: 3 }] }),
      ).fault,
    ).toBe('invalid-primitive-map')
  })

  it('drives an AI Desktop Studio SkinnedMesh after applyRig', () => {
    const adaptation = adaptMakeItAnimatable(
      output({ primitives: [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 3 }] }),
    )
    if (!adaptation.result) throw new Error('Expected a valid adaptation')
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([0, 1, 0, 0, 2, 0, 1.4, 2, 0], 3))
    const holder = new Object3D()
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    holder.add(mesh)
    const binding = adaptation.result.bindings[0]
    if (!binding) throw new Error('Expected one binding')

    applyRig(holder, adaptation.result.rig, [{ mesh, binding }])
    const skin = holder.getObjectByProperty('isSkinnedMesh', true)
    expect(skin).toBeInstanceOf(SkinnedMesh)
    if (!(skin instanceof SkinnedMesh)) throw new Error('Expected a skinned mesh')
    const before = skin.applyBoneTransform(
      2,
      new Vector3().fromBufferAttribute(skin.geometry.getAttribute('position'), 2),
    )
    const finger = skin.skeleton.bones.find(bone => bone.name === 'LeftHandPinky2')
    if (!finger) throw new Error('Expected the finger bone')
    finger.rotation.z = Math.PI / 2
    holder.updateWorldMatrix(false, true)
    const after = skin.applyBoneTransform(
      2,
      new Vector3().fromBufferAttribute(skin.geometry.getAttribute('position'), 2),
    )

    expect(after.distanceTo(before)).toBeGreaterThan(0.01)
  })

  it('survives a standard GLB export and reimport without its backend', async () => {
    const vertices = new BoxGeometry().getAttribute('position').count
    const adaptation = adaptMakeItAnimatable({
      jointNames: ['Hips'],
      parents: new Int16Array([-1]),
      joints: new Float32Array([0, 0, 0]),
      tails: new Float32Array([0, 1, 0]),
      weights: new Float32Array(vertices).fill(1),
      sourceInfluences: 1,
      modelToInput: new Float32Array(new Matrix4().elements),
      inputToModel: new Float32Array(new Matrix4().elements),
      primitives: [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: vertices }],
    })
    if (!adaptation.result) throw new Error('Expected a valid adaptation')
    const holder = new Object3D()
    holder.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
    const exported = await new GLTFExporter().parseAsync(holder, { binary: true })
    if (!(exported instanceof ArrayBuffer)) throw new Error('Expected a binary glTF')
    const binding = adaptation.result.bindings[0]
    if (!binding) throw new Error('Expected one binding')
    const rigged = glbWithSkin(new Uint8Array(exported), {
      bones: adaptation.result.rig.bones,
      skins: [
        {
          mesh: binding.mesh,
          primitive: binding.primitive,
          joints: binding.skinIndex,
          weights: binding.skinWeight,
        },
      ],
      extras: {},
    })

    const reopened = await readGlb(rigged)
    const reopenedSkin = reopened.getObjectByProperty('isSkinnedMesh', true)

    expect(rigFromObject(reopened)?.bones.map(bone => bone.name)).toEqual(['Hips'])
    expect(reopenedSkin).toBeInstanceOf(SkinnedMesh)
    if (!(reopenedSkin instanceof SkinnedMesh)) throw new Error('Expected a reopened skin')
    const indices = reopenedSkin.geometry.getAttribute('skinIndex')
    const weights = reopenedSkin.geometry.getAttribute('skinWeight')
    expect(Array.from(indices.array).every(index => Number(index) === 0)).toBe(true)
    for (let vertex = 0; vertex < weights.count; vertex += 1) {
      expect(weights.getX(vertex)).toBeCloseTo(1, 6)
      expect(weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex)).toBeCloseTo(0, 6)
    }
  })

  it('preserves a constructed multi-mesh character through rigging and GLB reimport', async () => {
    const holder = new Object3D()
    const parts = ['Body', 'Hair', 'Shoes'].map((name, index) => {
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
      mesh.name = name
      mesh.position.y = index
      holder.add(mesh)
      return mesh
    })
    const counts = parts.map(mesh => mesh.geometry.getAttribute('position').count)
    const vertices = counts.reduce((sum, count) => sum + count, 0)
    const original = await new GLTFExporter().parseAsync(holder, { binary: true })
    if (!(original instanceof ArrayBuffer)) throw new Error('Expected a binary glTF')
    let vertexOffset = 0
    const primitives = counts.map((vertexCount, mesh) => {
      const primitive = { mesh, primitive: 0, vertexOffset, vertexCount }
      vertexOffset += vertexCount
      return primitive
    })
    const adaptation = adaptMakeItAnimatable({
      jointNames: ['Hips'],
      parents: new Int16Array([-1]),
      joints: new Float32Array([0, 0, 0]),
      tails: new Float32Array([0, 1, 0]),
      weights: new Float32Array(vertices).fill(1),
      sourceInfluences: 1,
      modelToInput: new Float32Array(new Matrix4().elements),
      inputToModel: new Float32Array(new Matrix4().elements),
      primitives,
    })
    if (!adaptation.result) throw new Error('Expected a valid multi-mesh adaptation')

    const rigged = glbWithSkin(new Uint8Array(original), {
      bones: adaptation.result.rig.bones,
      skins: adaptation.result.bindings.map(binding => ({
        mesh: binding.mesh,
        primitive: binding.primitive,
        joints: binding.skinIndex,
        weights: binding.skinWeight,
      })),
      extras: {},
    })
    const reopened = await readGlb(rigged)
    const meshes: SkinnedMesh[] = []
    reopened.traverse(object => {
      if (object instanceof SkinnedMesh) meshes.push(object)
    })

    expect(meshes.map(mesh => mesh.name)).toEqual(['Body', 'Hair', 'Shoes'])
    expect(meshes.map(mesh => mesh.geometry.getAttribute('skinWeight').count)).toEqual(counts)
    expect(new Set(meshes.map(mesh => mesh.skeleton))).toHaveLength(1)
    expect(rigFromObject(reopened)?.bones.map(bone => bone.name)).toEqual(['Hips'])
  })
})

function readGlb(file: Uint8Array): Promise<Object3D> {
  const bytes = new ArrayBuffer(file.byteLength)
  new Uint8Array(bytes).set(file)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, '', gltf => resolve(gltf.scene), reject)
  })
}
