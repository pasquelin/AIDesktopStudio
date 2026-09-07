import { POST_EFFECTS, type PostEffect } from '@shared/domain/postProcessing'
import type { FieldValue, PropertySpec } from '@shared/domain/propertySpec'
import {
  DEFAULT_CAMERA,
  isVector3,
  TILES_PER_METRE,
  type CameraDescriptor,
  type GeometryDescriptor,
  type LightDescriptor,
  type MaterialDescriptor,
  type SpriteDescriptor,
  type TextDescriptor,
  type TextureSlot,
} from '@shared/domain/scene'
import { lightByKind } from './lightTypes'
import { primitiveByKind } from './meshPrimitives'
import { DEFAULT_MATERIAL, DEFAULT_SPRITE, DEFAULT_TEXT } from './sceneState'

/*
 * What each field of a descriptor is, so the inspector can be derived from a descriptor rather
 * than written per shape. Same rule as the generation forms: a hand-written panel for `box` is
 * a bug, not a shortcut — CLAUDE.md, invariant 5.
 *
 * The tables are mapped over the descriptor unions, so a primitive added without a spec for
 * every one of its parameters fails to compile.
 */

/**
 * Both moved to `shared/domain/propertySpec.ts` and re-exported here, so the fifty-odd files that
 * read a field spec from this module keep reading it from this module. They had to move: the
 * post-processing catalogue declares its parameters with them and is read by the main process.
 */
export type { FieldValue, PropertySpec } from '@shared/domain/propertySpec'

export type PropertyField = {
  name: string
  value: FieldValue
  /** Absent for a field no table describes — it still renders, bare. */
  spec?: PropertySpec
  /**
   * What this field holds on a descriptor just made, which is what its reset puts it back to.
   * Absent where nothing can say — a field of a descriptor with no factory behind it.
   */
  fallback?: FieldValue
}

/** What a panel can draw — `listFields` skips the rest: a ribbon's rail is edited on the shape. */
type EditableKeys<T> = { [K in keyof T]-?: T[K] extends FieldValue ? K : never }[keyof T]

type SpecsOf<D extends { kind: string }> = {
  [K in D['kind']]: {
    [F in Exclude<EditableKeys<Extract<D, { kind: K }>>, 'kind'>]: PropertySpec
  }
}

/** A size in scene units. Never zero: a degenerate primitive is a mesh that vanishes. */
const SIZE: PropertySpec = { control: 'number', min: 0.001, step: 0.1 }
/** Segments around an axis. Below three there is no surface left to shade. */
const RING_SEGMENTS: PropertySpec = { control: 'number', min: 3, max: 128, step: 1 }
const SEGMENTS: PropertySpec = { control: 'number', min: 1, max: 128, step: 1 }
const WINDING: PropertySpec = { control: 'number', min: 1, max: 20, step: 1 }

export const GEOMETRY_SPECS: SpecsOf<GeometryDescriptor> = {
  box: { width: SIZE, height: SIZE, depth: SIZE },
  capsule: {
    radius: SIZE,
    height: SIZE,
    capSegments: SEGMENTS,
    radialSegments: RING_SEGMENTS,
  },
  circle: { radius: SIZE, segments: RING_SEGMENTS },
  cylinder: {
    // Zero is legal here, and is what makes a cone out of a cylinder.
    radiusTop: { control: 'number', min: 0, step: 0.1 },
    radiusBottom: { control: 'number', min: 0, step: 0.1 },
    height: SIZE,
    segments: RING_SEGMENTS,
  },
  dodecahedron: { radius: SIZE },
  icosahedron: { radius: SIZE },
  lathe: { segments: RING_SEGMENTS },
  octahedron: { radius: SIZE },
  plane: { width: SIZE, height: SIZE },
  ribbon: {
    width: SIZE,
    // A finer step than a size's: a kerb is two decimetres tall, and a painted stripe less.
    height: { control: 'number', min: 0.001, step: 0.05 },
    // A band is cut along its whole LENGTH, where every other count goes round an axis: a lap of
    // six hundred metres wants three hundred and sixty, and a hundred and twenty-eight is a
    // 4,7 m step — 20° of turn in the hairpin.
    segments: { control: 'number', min: 2, max: 512, step: 1 },
  },
  ring: {
    innerRadius: { control: 'number', min: 0, step: 0.1 },
    outerRadius: SIZE,
    segments: RING_SEGMENTS,
  },
  sphere: { radius: SIZE, widthSegments: RING_SEGMENTS, heightSegments: SEGMENTS },
  tetrahedron: { radius: SIZE },
  torus: {
    radius: SIZE,
    tube: SIZE,
    radialSegments: SEGMENTS,
    tubularSegments: RING_SEGMENTS,
  },
  torusKnot: {
    radius: SIZE,
    tube: SIZE,
    tubularSegments: RING_SEGMENTS,
    radialSegments: SEGMENTS,
    p: WINDING,
    q: WINDING,
  },
  tube: { radius: SIZE, tubularSegments: RING_SEGMENTS, radialSegments: SEGMENTS },
}

const COLOR: PropertySpec = { control: 'color' }
/** Bounded so the slider stays usable; the field beside it still takes anything typed. */
const INTENSITY: PropertySpec = { control: 'slider', min: 0, max: 10, step: 0.1 }
/** Zero means no falloff at all — three.js reads it as "reaches everywhere". */
const RANGE: PropertySpec = { control: 'number', min: 0, step: 0.5 }
const DECAY: PropertySpec = { control: 'number', min: 0, max: 4, step: 0.1 }
const TARGET: PropertySpec = { control: 'vector3', step: 0.1 }

export const LIGHT_SPECS: SpecsOf<LightDescriptor> = {
  ambient: { color: COLOR, intensity: INTENSITY },
  directional: { color: COLOR, intensity: INTENSITY, target: TARGET },
  hemisphere: { skyColor: COLOR, groundColor: COLOR, intensity: INTENSITY },
  point: { color: COLOR, intensity: INTENSITY, distance: RANGE, decay: DECAY },
  spot: {
    color: COLOR,
    intensity: INTENSITY,
    distance: RANGE,
    // Half-angle of the cone, in radians: a spot wider than a hemisphere lights nothing more.
    angle: { control: 'slider', min: 0.01, max: Math.PI / 2, step: 0.01 },
    penumbra: { control: 'slider', min: 0, max: 1, step: 0.01 },
    decay: DECAY,
    target: TARGET,
  },
}

const UNIT: PropertySpec = { control: 'slider', min: 0, max: 1, step: 0.01 }

/** Exhaustive like its two neighbours, minus the texture slots, which no control describes. */
type MaterialSpecs = {
  [F in Exclude<keyof MaterialDescriptor, 'kind' | TextureSlot>]: PropertySpec
}

export const MATERIAL_SPECS: MaterialSpecs = {
  color: COLOR,
  roughness: UNIT,
  metalness: UNIT,
  // Squares per metre, so a step of a twentieth reaches both a floor read by the metre and a
  // prop read by the centimetre.
  tilesPerMetre: {
    control: 'number',
    min: TILES_PER_METRE.min,
    max: TILES_PER_METRE.max,
    step: TILES_PER_METRE.step,
  },
}

/** Exhaustive like the material's, minus the map, which no control describes. */
type SpriteSpecs = { [F in Exclude<keyof SpriteDescriptor, 'map'>]: PropertySpec }

export const SPRITE_SPECS: SpriteSpecs = {
  color: COLOR,
  opacity: UNIT,
}

/**
 * Exhaustive like the others, minus the two no control describes: the words, which are a caption
 * and not a number, and the face, which is picked from a list rather than typed.
 */
type TextSpecs = { [F in Exclude<keyof TextDescriptor, 'value' | 'font'>]: PropertySpec }

export const TEXT_SPECS: TextSpecs = {
  size: SIZE,
  /** Zero is legal, and is what makes a flat letter out of a solid one. */
  depth: { control: 'number', min: 0, step: 0.05 },
  // Above a dozen the difference stops showing and the vertex count keeps climbing.
  curveSegments: { control: 'number', min: 1, max: 32, step: 1 },
}

/** Exhaustive like the others: a lens parameter gained without a control fails to compile. */
type CameraSpecs = { [F in keyof CameraDescriptor]: PropertySpec }

export const CAMERA_SPECS: CameraSpecs = {
  // Vertical, in degrees. Past 170 the projection stretches into what no lens shows.
  fov: { control: 'slider', min: 1, max: 170, step: 1 },
  // Never zero: a near plane at the eye leaves the depth buffer no range to sort with.
  near: { control: 'number', min: 0.001, step: 0.01 },
  far: { control: 'number', min: 0.002, step: 10 },
}

/**
 * One composition effect, read as a list of fields.
 *
 * The whole of § 11: the panel is DERIVED from the catalogue, so an effect added to
 * `POST_EFFECTS` gets its controls the day it is declared, and not one line of JSX is written
 * for it. A parameter the catalogue names but the document has never held opens on its default.
 */
export function postEffectFields(effect: PostEffect): PropertyField[] {
  return Object.entries(POST_EFFECTS[effect.effect].params).map(([name, spec]) => ({
    name,
    value: effect.params[name] ?? spec.default,
    spec,
    fallback: spec.default,
  }))
}

export function cameraFields(descriptor: CameraDescriptor): PropertyField[] {
  return listFields(descriptor, CAMERA_SPECS, DEFAULT_CAMERA)
}

/** The caption and the face are left out: each has a control of its own in the inspector. */
export function textFields(descriptor: TextDescriptor): PropertyField[] {
  const measured: TextSpecsSubject = {
    size: descriptor.size,
    depth: descriptor.depth,
    curveSegments: descriptor.curveSegments,
  }

  return listFields(measured, TEXT_SPECS, DEFAULT_TEXT)
}

/** Derived from the specs, so a parameter gained without a control fails to compile here. */
type TextSpecsSubject = { [F in keyof TextSpecs]: TextDescriptor[F] }

export function geometryFields(descriptor: GeometryDescriptor): PropertyField[] {
  // Its own factory, which is the one thing that knows what a fresh one of THIS kind holds.
  return listFields(
    descriptor,
    GEOMETRY_SPECS[descriptor.kind],
    primitiveByKind(descriptor.kind)?.create(),
  )
}

export function lightFields(descriptor: LightDescriptor): PropertyField[] {
  return listFields(
    descriptor,
    LIGHT_SPECS[descriptor.kind],
    lightByKind(descriptor.kind)?.create(),
  )
}

/** Typed off the descriptor, so renaming the field cannot leave the filter below green and idle. */
const TILING_FIELD: keyof MaterialDescriptor = 'tilesPerMetre'

/**
 * `fallbackColor` stands in for the `null` that means "the studio's own colour": a swatch has
 * to show something, and the value it shows is the one the viewport is already painting.
 *
 * `tiling` is false where the density does nothing: a text's outline is not a primitive, so its
 * UVs never go through `uvTiling`. Offered there, the field marked the document as changed and
 * changed nothing on screen.
 */
export function materialFields(
  descriptor: MaterialDescriptor,
  fallbackColor: string,
  tiling = true,
): PropertyField[] {
  const fields = listFields(
    { ...descriptor, color: descriptor.color ?? fallbackColor },
    MATERIAL_SPECS,
    { ...DEFAULT_MATERIAL, color: fallbackColor },
  )

  return tiling ? fields : fields.filter(field => field.name !== TILING_FIELD)
}

/** Same rule as a material's, and for the same `null`. */
export function spriteFields(descriptor: SpriteDescriptor, fallbackColor: string): PropertyField[] {
  return listFields({ ...descriptor, color: descriptor.color ?? fallbackColor }, SPRITE_SPECS, {
    ...DEFAULT_SPRITE,
    color: fallbackColor,
  })
}

/**
 * A descriptor with one field replaced. The name and the value come from `listFields`, which
 * read them off this very descriptor — so what comes back is the same shape with one number
 * moved, and `withField` is the only place that has to be trusted about it.
 */
export function withField<D extends object>(descriptor: D, name: string, value: FieldValue): D {
  // `as`: a computed key widens the spread to an index signature, which no longer matches the
  // discriminated union — the name is one of `descriptor`'s own keys, so the shape is unchanged.
  return { ...descriptor, [name]: value } as D
}

/**
 * A descriptor read as a list of fields. Nothing is keyed by shape: the names come from the
 * descriptor itself, so a parameter the tables have never heard of is still listed — bare, but
 * listed. A panel that hides what it cannot describe is worse than one that shows it plainly.
 */
function listFields(
  descriptor: object,
  specs: Record<string, PropertySpec>,
  /** The same descriptor as it comes out of its factory — where one exists. */
  fresh?: Record<string, unknown>,
): PropertyField[] {
  const fields: PropertyField[] = []

  for (const [name, value] of Object.entries(descriptor)) {
    if (name === 'kind') continue
    if (!isFieldValue(value)) continue

    const fallback = fresh?.[name]
    fields.push({
      name,
      value,
      spec: specs[name],
      fallback: isFieldValue(fallback) ? fallback : undefined,
    })
  }

  return fields
}

function isFieldValue(value: unknown): value is FieldValue {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isVector3(value)
  )
}
