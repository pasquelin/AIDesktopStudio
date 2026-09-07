import {
  withMovedPoint,
  withoutPoint,
  withPointAfter,
  withPointAppended,
  withPointAtEnd,
} from '@/engines/scene/cameraPath'
import {
  dressModel,
  setGeometry,
  setMaterialOn,
  setShadowOn,
  setSpriteOn,
  setTextOn,
  wearMaterialAt,
} from '@/engines/scene/commands'
import { GEOMETRY_SPECS, withField } from '@/engines/scene/propertyFields'
import { carriesMaterial } from '@/engines/scene/sceneState'
import { documentNamedOfKind, useDocuments } from '@/stores/documents'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { readColor } from '@shared/domain/color'
import {
  MATERIAL_SLOTS,
  type MaterialDescriptor,
  type SpriteDescriptor,
  type TextDescriptor,
} from '@shared/domain/scene'
import { withAsset, type ActionHandlers } from './actionHandler'
import { boolOf, namedOf, numberOf, textOf } from './actionInputs'

import {
  assetRef,
  canShadow,
  editNode,
  fontFrom,
  numbersFor,
  POINT_AXES,
  texturesFrom,
  vectorOf,
} from './sceneHandlerCore'
import { editPath } from './sceneNodeActions'

export const SCENE_NODE_APPEARANCE_HANDLERS: ActionHandlers = {
  'node.setMeshMaterial': input =>
    editNode(
      input,
      node => {
        if (!carriesMaterial(node)) return null
        // Neither a text's outline nor a cut result is a primitive, so their UVs never go through
        // the tiling — the field the inspector drops for both is refused here rather than filed
        // and ignored.
        if (node.type !== 'mesh' && input.tilesPerMetre !== undefined) return null

        const textures = texturesFrom(input)
        if (!textures) return null

        const roughness = numberOf(input, 'roughness')
        const metalness = numberOf(input, 'metalness')
        const tilesPerMetre = numberOf(input, 'tilesPerMetre')
        const changes: Partial<MaterialDescriptor> = {
          ...(input.color === undefined
            ? {}
            : { color: readColor(input, 'color', node.material.color ?? '') }),
          ...(roughness === null ? {} : { roughness }),
          ...(metalness === null ? {} : { metalness }),
          ...(tilesPerMetre === null ? {} : { tilesPerMetre }),
          ...textures,
        }

        return Object.keys(changes).length === 0 ? null : setMaterialOn([node], changes)
      },
      node => (carriesMaterial(node) ? namedOf(input, node.material) : {}),
    ),

  'node.setPrimitiveParameters': input =>
    editNode(input, node => {
      if (node.type !== 'mesh') return null

      const written = numbersFor(input, node.geometry, GEOMETRY_SPECS[node.geometry.kind])
      if (!written || Object.keys(written).length === 0) return null

      // The whole descriptor at once rather than one field per command: `setGeometryOn` is built
      // from the geometry as it stands when the command is MADE, so chaining three would keep
      // only the last. `withField` is what the inspector folds a field in with.
      return setGeometry(
        node.id,
        Object.entries(written).reduce(
          (geometry, [name, value]) => withField(geometry, name, value),
          node.geometry,
        ),
      )
    }),

  'node.setShadowCastAndReceive': input =>
    editNode(input, node => {
      const changes = {
        ...(input.castShadow === undefined ? {} : { castShadow: boolOf(input, 'castShadow') }),
        ...(input.receiveShadow === undefined
          ? {}
          : { receiveShadow: boolOf(input, 'receiveShadow') }),
      }
      if (Object.keys(changes).length === 0) return null

      // `setShadowOn` skips a node that cannot hold what it was given — a light catches nothing —
      // and a skipped node leaves an empty command, which reads as done. Refused instead.
      return canShadow(node, changes) ? setShadowOn([node], changes) : null
    }),

  'node.setSpriteSettings': input =>
    editNode(input, node => {
      if (node.type !== 'sprite') return null

      const opacity = numberOf(input, 'opacity')
      const changes: Partial<SpriteDescriptor> = {
        ...(input.color === undefined
          ? {}
          : { color: readColor(input, 'color', node.sprite.color ?? '') }),
        ...(opacity === null ? {} : { opacity }),
        ...(input.map === undefined ? {} : { map: assetRef(input, 'map') }),
      }

      return Object.keys(changes).length === 0 ? null : setSpriteOn([node], changes)
    }),

  'node.setTextSettings': input =>
    editNode(input, node => {
      if (node.type !== 'text') return null

      const font = fontFrom(input, node.text.font)
      const value = textOf(input, 'value')
      const curveSegments = numberOf(input, 'curveSegments')
      // Their own keys because a geometry already holds both: a box has a depth in scene units
      // and a letter has one out of its own plane, and one word for the two said neither.
      const size = numberOf(input, 'textSize')
      const depth = numberOf(input, 'textDepth')

      const changes: Partial<TextDescriptor> = {
        ...(value === null ? {} : { value }),
        ...(font === null ? {} : { font }),
        ...(curveSegments === null ? {} : { curveSegments }),
        ...(size === null ? {} : { size }),
        ...(depth === null ? {} : { depth }),
      }

      return Object.keys(changes).length === 0 ? null : setTextOn([node], changes)
    }),

  'node.setPathShape': input =>
    editPath(input, path => {
      const tension = numberOf(input, 'tension')
      // The same rail back is what `editPath` reads as a refusal: a call that named nothing meant
      // something, and a spread would otherwise hand back a fresh object that changed nothing.
      if (tension === null && input.closed === undefined) return path

      return {
        ...path,
        ...(tension === null ? {} : { tension }),
        ...(input.closed === undefined ? {} : { closed: boolOf(input, 'closed') }),
      }
    }),

  'path.addPoint': input => {
    const index = numberOf(input, 'index')
    const aimed = POINT_AXES.filter(axis => input[axis] !== undefined)
    // A point AIMED at is laid past the last one, as a click in the viewport lays it; an index
    // says "halfway after this one" instead. Naming both would be naming two places at once.
    if (aimed.length > 0 && index !== null)
      return refused(
        'badInput',
        'name a point with pointX, pointY and pointZ, or an "index" to lay one after — not both',
      )
    if (aimed.length > 0 && aimed.length < POINT_AXES.length)
      return refused('badInput', 'a point wants all three of pointX, pointY, pointZ')

    return editPath(input, path => {
      if (aimed.length === 0)
        return index === null ? withPointAtEnd(path) : withPointAfter(path, index)

      // Every axis is named, so nothing of the fallback is read.
      return withPointAppended(path, vectorOf(input, 'point', { x: 0, y: 0, z: 0 }))
    })
  },

  'path.movePoint': input =>
    editPath(input, path => {
      const index = numberOf(input, 'index') ?? -1
      const held = path.points[index]
      return held ? withMovedPoint(path, index, vectorOf(input, 'point', held)) : path
    }),

  'path.removePoint': input =>
    editPath(input, path => withoutPoint(path, numberOf(input, 'index') ?? -1)),

  'model.setMaterialDocument': input =>
    editNode(input, node => {
      if (node.type !== 'model') return null

      // The TITLE, because a document id is not something anyone types. An empty one takes the
      // whole dress off, and the model goes back to what its own file carries.
      const title = textOf(input, 'material')
      if (!title) return dressModel(node.id, null)

      // Zero unless one is named: a model with one material is the ordinary case, and a caller
      // that says nothing about slots means the first. Refused rather than swallowed out of range
      // — `withMaterialAt` is a pure function and can only answer the list unchanged.
      const slot = numberOf(input, 'slot') ?? 0
      if (!Number.isInteger(slot) || slot < 0 || slot >= MATERIAL_SLOTS) return null

      const wanted = documentNamedOfKind(useDocuments.getState(), 'material', title)
      return wanted ? wearMaterialAt(node.id, slot, wanted) : null
    }),

  /** The picture must EXIST, or the model holds a reference nothing resolves — see `world.environment`. */
  'model.setBaseColorImage': input => {
    const assetId = textOf(input, 'assetId')
    const write = (): ActionOutcome =>
      editNode(input, node =>
        node.type === 'model'
          ? dressModel(node.id, assetId ? { kind: 'image', assetId } : null)
          : null,
      )

    return assetId === null ? write() : withAsset(assetId, write)
  },

  /**
   * The lens, through the inspector's own translation — `fov` may be keyed, the two distances
   * never are. The lens handed over keeps the fov it ALREADY holds: that value is what its key is
   * measured against, and a new one there moves the rest pose under every other key.
   */
}
