// @vitest-environment jsdom
import {
  Bone,
  Group,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Skeleton,
  SkinnedMesh,
  WebGLRenderer,
} from 'three'
import { expect, it, vi } from 'vitest'
import { STUDIO_METADATA_KEY } from '@shared/domain/studioMetadata'
import { FirstPersonBody } from './FirstPersonBody'
import { SceneRenderer } from './SceneRenderer'
import { sceneFromTemplate } from './sceneTemplates'
import { playerPartsOf } from './playerModule'

function character(headName = 'Head'): SkinnedMesh {
  const body = new Bone()
  body.name = 'Hips'
  const head = new Bone()
  head.name = headName
  body.add(head)
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 2, 0], 3),
  )
  geometry.setIndex([0, 1, 2, 3, 4, 5])
  geometry.setAttribute(
    'skinIndex',
    new Float32BufferAttribute(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      4,
    ),
  )
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(
      Array.from({ length: 24 }, (_, index) => (index % 4 === 0 ? 1 : 0)),
      4,
    ),
  )
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
  mesh.add(body)
  mesh.bind(new Skeleton([body, head]))
  return mesh
}

function cameraPass(mesh: SkinnedMesh): number[] {
  // Render callbacks only use the supplied geometry; no GPU is needed for their contract.
  const renderer = Object.create(WebGLRenderer.prototype)
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  mesh.onBeforeRender(
    renderer,
    scene,
    camera,
    mesh.geometry,
    Array.isArray(mesh.material) ? new MeshBasicMaterial() : mesh.material,
    new Group(),
  )
  const indices = Array.from(mesh.geometry.index?.array ?? [])
  mesh.onAfterRender(
    renderer,
    scene,
    camera,
    mesh.geometry,
    Array.isArray(mesh.material) ? new MeshBasicMaterial() : mesh.material,
    new Group(),
  )
  return indices
}

it('draws the body and the full shadow without modifying the shared model', () => {
  const mesh = character()
  const original = mesh.geometry
  const mask = new FirstPersonBody()
  mask.sync(mesh)
  expect(cameraPass(mesh)).toEqual([0, 1, 2, 3, 3, 3])
  expect(Array.from(mesh.geometry.index?.array ?? [])).toEqual([0, 1, 2, 3, 4, 5])
  expect(Array.from(original.index?.array ?? [])).toEqual([0, 1, 2, 3, 4, 5])
  mask.dispose()
  expect(mesh.geometry).toBe(original)
})

it.each(['profile', 'file'])(
  'rebinds a replacement character using its %s head mapping',
  source => {
    const mask = new FirstPersonBody()
    const old = character()
    const original = old.geometry
    mask.sync(old)
    const replacement = character('Joint42')
    if (source === 'file')
      replacement.userData[STUDIO_METADATA_KEY] = { character: { roles: { Joint42: 'Head' } } }
    mask.sync(
      replacement,
      source === 'profile' ? signature => ({ signature, roles: { Joint42: 'Head' } }) : undefined,
    )
    expect(old.geometry).toBe(original)
    expect(cameraPass(replacement)).toEqual([0, 1, 2, 3, 3, 3])
    mask.dispose()
  },
)

it('masks the actual Play viewport and restores the model in third person', () => {
  const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn(), chrome: false })
  const state = sceneFromTemplate('firstPerson')
  const body = playerPartsOf(state.nodes)?.body
  expect(body).toBeDefined()
  const mesh = character()
  const original = mesh.geometry
  renderer['documentOrder'] = state.nodes
  renderer['world'] = state.world
  renderer['objects'].set(body?.id ?? '', mesh)
  renderer['dressPane'](0, new PerspectiveCamera())
  expect(cameraPass(mesh)).toEqual([0, 1, 2, 3, 3, 3])
  renderer['world'] = { ...state.world, play: { ...state.world.play, camera: 'thirdPerson' } }
  renderer['dressPane'](0, new PerspectiveCamera())
  expect(mesh.geometry).toBe(original)
  renderer.dispose()
})
