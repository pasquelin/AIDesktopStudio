import { DEFAULT_CAMERA, MESH_ENTRIES, type GeometryDescriptor } from '@shared/domain/scene'
import { describe, expect, it } from 'vitest'
import { primitiveByKind } from './meshPrimitives'
import { lightByKind } from './lightTypes'
import {
  cameraFields,
  geometryFields,
  lightFields,
  materialFields,
  withField,
} from './propertyFields'
import { DEFAULT_MATERIAL } from './sceneState'

const names = (fields: { name: string }[]) => fields.map(field => field.name)

describe('geometryFields', () => {
  it('lists the parameters of the shape, and never its kind', () => {
    const fields = geometryFields({ kind: 'box', width: 1, height: 2, depth: 3 })

    expect(names(fields)).toEqual(['width', 'height', 'depth'])
    expect(fields[1]?.value).toBe(2)
  })

  /*
   * The panel is derived, never written per shape: a primitive with no fields would be a
   * primitive nobody can edit. Counted on what a panel CAN draw — a ribbon's run of points is a
   * list, edited on the shape — and every one of those still has to carry its spec.
   */
  it('describes every parameter of every buildable primitive', () => {
    for (const entry of MESH_ENTRIES) {
      const descriptor = primitiveByKind(entry.kind)?.create?.()
      if (!descriptor) continue

      // What a panel can draw: a ribbon carries a whole rail, which is dragged on the shape.
      const editable = Object.entries(descriptor).filter(
        ([name, value]) => name !== 'kind' && typeof value !== 'object',
      )
      const fields = geometryFields(descriptor)
      expect(fields.map(field => field.name)).toEqual(editable.map(([name]) => name))
      for (const field of fields) expect(field.spec).toBeDefined()
    }
  })

  it('gives segment counts a whole-number step', () => {
    const fields = geometryFields({
      kind: 'sphere',
      radius: 1,
      widthSegments: 32,
      heightSegments: 16,
    })

    expect(fields.find(field => field.name === 'widthSegments')?.spec).toMatchObject({
      control: 'number',
      step: 1,
    })
  })
})

describe('cameraFields', () => {
  it('describes the whole lens, and never its kind', () => {
    const fields = cameraFields(DEFAULT_CAMERA)

    expect(names(fields)).toEqual(['fov', 'near', 'far'])
    for (const field of fields) expect(field.spec).toBeDefined()
  })

  // The one field whose range a person judges by eye: how open the lens is, between two ends.
  it('gives the field of view both its ends', () => {
    expect(cameraFields(DEFAULT_CAMERA).find(field => field.name === 'fov')?.spec).toMatchObject({
      control: 'slider',
      min: 1,
      max: 170,
    })
  })
})

describe('lightFields', () => {
  it('describes every parameter of every light', () => {
    for (const kind of ['ambient', 'directional', 'hemisphere', 'point', 'spot']) {
      const descriptor = lightByKind(kind)?.create()
      if (!descriptor) throw new Error(`no builder for ${kind}`)

      const fields = lightFields(descriptor)
      expect(fields.length).toBe(Object.keys(descriptor).length - 1)
      for (const field of fields) expect(field.spec).toBeDefined()
    }
  })

  it('reads a colour as a colour and a target as a vector', () => {
    const fields = lightFields({
      kind: 'directional',
      color: '#ffffff',
      intensity: 1,
      target: { x: 0, y: 0, z: 0 },
    })

    expect(fields.find(field => field.name === 'color')?.spec).toEqual({ control: 'color' })
    expect(fields.find(field => field.name === 'target')?.spec).toMatchObject({
      control: 'vector3',
    })
  })
})

describe('materialFields', () => {
  it('offers roughness and metalness as bounded values', () => {
    const fields = materialFields(DEFAULT_MATERIAL, '#868a91')

    expect(fields.find(field => field.name === 'roughness')?.spec).toEqual({
      control: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
    })
  })

  // `null` means "the studio's own colour": the swatch shows what the viewport is painting
  // rather than disappearing.
  it('stands the viewport colour in for a material that carries none', () => {
    const fields = materialFields(DEFAULT_MATERIAL, '#868a91')

    expect(names(fields)).toEqual(['color', 'roughness', 'metalness', 'tilesPerMetre'])
    expect(fields[0]?.value).toBe('#868a91')
  })

  it('keeps the colour a material does carry', () => {
    const fields = materialFields({ ...DEFAULT_MATERIAL, color: '#ff0000' }, '#868a91')

    expect(fields[0]?.value).toBe('#ff0000')
  })
})

describe('withField', () => {
  it('replaces one parameter and leaves the rest', () => {
    const box: GeometryDescriptor = { kind: 'box', width: 1, height: 2, depth: 3 }

    expect(withField(box, 'height', 9)).toEqual({ kind: 'box', width: 1, height: 9, depth: 3 })
  })

  it('does not touch the descriptor it was given', () => {
    const box: GeometryDescriptor = { kind: 'box', width: 1, height: 2, depth: 3 }
    withField(box, 'width', 5)

    expect(box.width).toBe(1)
  })
})
