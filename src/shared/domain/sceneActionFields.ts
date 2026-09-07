import type { ActionField } from './assistantAction'
import { FIGURE_ENTRIES, LIGHT_ENTRIES, MESH_ENTRIES, OBJECT_ENTRIES, TEXTURE_SLOTS } from './scene'

/**
 * The 3D workspace, driven by value.
 *
 * The same bargain the image family struck: the 21 scene COMMANDS arm a tool or move a view,
 * and none of them says WHERE. These place a node, turn it, light it and paint it, in the
 * numbers a scene is actually built from.
 *
 * They act on the 3D tab in front, and `studio.state` says which one that is.
 */

/**
 * Everything the Add menu offers, in one list — the primitives, the lights, the figures and the
 * objects that belong to no family. Read from the registries rather than restated, so a
 * fourteenth primitive is offered here the day it is offered on screen.
 */
export const NODE_KINDS: readonly string[] = [
  ...MESH_ENTRIES.map(entry => entry.kind),
  ...LIGHT_ENTRIES.map(entry => entry.kind),
  ...FIGURE_ENTRIES.map(entry => entry.kind),
  ...OBJECT_ENTRIES.map(entry => entry.kind),
]

/** A vector, spelled as three optional numbers: a client changing height alone says `y`. */
export const vector = (
  axis: 'x' | 'y' | 'z',
  of: 'position' | 'rotation' | 'scale' | 'target' | 'point',
): ActionField => ({
  key: `${of}${axis.toUpperCase()}`,
  kind: 'number',
  labelKey: `assistant.fields.${of}${axis.toUpperCase()}`,
  required: false,
})

/** An optional dial, spelled once for the forty-odd that only differ by their bounds. */
export const dial = (key: string, bounds: { min?: number; max?: number } = {}): ActionField => ({
  key,
  kind: 'number',
  labelKey: `assistant.fields.${key}`,
  required: false,
  ...bounds,
})

/** The same, counted rather than measured — a segment count is never a fraction of one. */
export const count = (key: string, min: number, max: number): ActionField => ({
  key,
  kind: 'integer',
  labelKey: `assistant.fields.${key}`,
  required: false,
  min,
  max,
})

/** A size in scene units, which is never zero: a degenerate primitive is a mesh that vanishes. */
export const SMALLEST = 0.001

/**
 * The parameters of a primitive, in ONE action rather than fourteen.
 *
 * Which of them a node holds is settled when it is added and never again — `setGeometryOn` only
 * writes a mesh built from the same kind — so a client reads the kind from `scene.state` and
 * names the fields that kind carries. One that belongs to another is refused, not ignored.
 *
 * The bounds here are the UNION over the kinds carrying each name, and they have to be: a torus
 * takes one radial segment where a capsule takes three. The handler narrows to the kind in hand,
 * and `sceneHandlers03.test.ts` holds both halves against `GEOMETRY_SPECS`.
 */
export const GEOMETRY_FIELDS: readonly ActionField[] = [
  dial('width', { min: SMALLEST }),
  dial('height', { min: SMALLEST }),
  dial('depth', { min: SMALLEST }),
  dial('radius', { min: SMALLEST }),
  dial('radiusTop', { min: 0 }),
  dial('radiusBottom', { min: 0 }),
  dial('innerRadius', { min: 0 }),
  dial('outerRadius', { min: SMALLEST }),
  dial('tube', { min: SMALLEST }),
  // The union of what the kinds declare: a ribbon is cut along its length and reaches 512, where
  // a count going round an axis stops at 128. `sceneHandlers03.test.ts` holds the two together.
  count('segments', 2, 512),
  count('capSegments', 1, 128),
  count('radialSegments', 1, 128),
  count('widthSegments', 3, 128),
  count('heightSegments', 1, 128),
  count('tubularSegments', 3, 128),
  count('p', 1, 20),
  count('q', 1, 20),
]

/**
 * The maps a material wears, named by slot. A slot given an empty id is a map taken OFF, which
 * is the difference between "leave this one alone" and "there is none" — a client that could
 * only ever add one would have no way back.
 */
export const TEXTURES: ActionField = {
  key: 'textures',
  kind: 'record',
  labelKey: 'assistant.fields.textures',
  required: false,
  options: [...TEXTURE_SLOTS],
}

/** Which control point of a rail, counted from the first. */
export const POINT_INDEX: ActionField = {
  key: 'index',
  kind: 'integer',
  labelKey: 'assistant.fields.pointIndex',
  required: true,
  min: 0,
}
