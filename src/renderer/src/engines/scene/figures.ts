import { mdiHumanMale } from '@mdi/js'
import { FIGURE_ENTRIES, type FigureKind, type Vector3 } from '@shared/domain/scene'

/**
 * A family of figures, described here and BUILT in `nodeFactory` like every other family. 🛑 It
 * becomes real mesh NODES rather than a node type of its own: a node wears one material, so a
 * silhouette in clothes needs several — and each one stays the author's to edit.
 */
export type Figure = {
  kind: FigureKind
  icon: string
  create: () => FigureDescriptor
}

/** One box of a body: what it is called, how big it is, where it sits, and what it is painted. */
export type FigurePart = {
  name: string
  size: Vector3
  at: Vector3
  colour: string
}

/**
 * A whole figure, in its own frame. `height` is what it FILLS and the middle of it is the origin,
 * so a figure drops straight into a walking body — whose node is its centre too.
 */
export type FigureDescriptor = {
  kind: FigureKind
  height: number
  parts: readonly FigurePart[]
}

/** Low-poly on purpose: boxes read as a silhouette at a distance, and each part takes a colour. */
const SKIN = '#f0c7a1'
const HAIR = '#2a2b3d'
const SHIRT = '#3f6bc4'
const TROUSERS = '#2f3542'
const SHOES = '#7d3a2c'

const part = (
  name: string,
  [width, height, depth]: readonly [number, number, number],
  [x, y, z]: readonly [number, number, number],
  colour: string,
): FigurePart => ({ name, size: { x: width, y: height, z: depth }, at: { x, y, z }, colour })

/** Front is −z, which is what a camera on a resting arm looks at the back of. */
const HUMANOID: readonly FigurePart[] = [
  part('Hair', [0.26, 0.14, 0.26], [0, 0.83, 0], HAIR),
  part('Head', [0.24, 0.28, 0.24], [0, 0.64, 0], SKIN),
  part('Torso', [0.42, 0.52, 0.24], [0, 0.24, 0], SHIRT),
  part('Hips', [0.36, 0.16, 0.22], [0, -0.1, 0], TROUSERS),
  part('Arm L', [0.1, 0.5, 0.12], [-0.25, 0.15, 0], SHIRT),
  part('Arm R', [0.1, 0.5, 0.12], [0.25, 0.15, 0], SHIRT),
  part('Hand L', [0.1, 0.1, 0.12], [-0.25, -0.15, 0], SKIN),
  part('Hand R', [0.1, 0.1, 0.12], [0.25, -0.15, 0], SKIN),
  part('Leg L', [0.17, 0.62, 0.18], [-0.11, -0.49, 0], TROUSERS),
  part('Leg R', [0.17, 0.62, 0.18], [0.11, -0.49, 0], TROUSERS),
  part('Shoe L', [0.17, 0.1, 0.26], [-0.11, -0.85, -0.04], SHOES),
  part('Shoe R', [0.17, 0.1, 0.26], [0.11, -0.85, -0.04], SHOES),
]

/** How tall a walking body stands, and the size every figure of the family is drawn at. */
export const FIGURE_HEIGHT = 1.8

/**
 * 🛑 The scale at which a figure fits INSIDE the capsule a controller feels — measured on every
 * corner of every part, because a capsule is domed and a part is a box: at full height the
 * shoes stood 9,6 cm outside it, which is what one sees as a body bursting its own cage.
 *
 * Answered rather than written down: the two figures come from the component, so retuning a
 * controller re-sizes what stands in it.
 */
export function figureScaleWithin(
  figure: FigureDescriptor,
  height: number,
  radius: number,
): number {
  const straight = Math.max(0, height / 2 - radius)
  const outside = (scale: number): boolean =>
    figure.parts.some(({ at, size }) =>
      CORNERS.some(([sx, sy, sz]) => {
        const x = (at.x + (sx * size.x) / 2) * scale
        const y = (at.y + (sy * size.y) / 2) * scale
        const z = (at.z + (sz * size.z) / 2) * scale
        const across = Math.hypot(x, z)
        const beyond = Math.max(0, Math.abs(y) - straight)
        return Math.hypot(across, beyond) > radius
      }),
    )

  if (!outside(1)) return 1
  // Halved on a bisection rather than solved: a dome makes four cases, and this runs once per
  // module laid down. Twenty rounds settle it to a tenth of a millimetre.
  let fits = 0
  let tooBig = 1
  for (let round = 0; round < 20; round++) {
    const half = (fits + tooBig) / 2
    if (outside(half)) tooBig = half
    else fits = half
  }
  return fits
}

const CORNERS: readonly (readonly [number, number, number])[] = [-1, 1].flatMap(x =>
  [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as [number, number, number])),
)

const FIGURE_BUILDERS: Record<FigureKind, { icon: string; create: Figure['create'] }> = {
  humanoid: {
    icon: mdiHumanMale,
    create: () => ({ kind: 'humanoid', height: FIGURE_HEIGHT, parts: HUMANOID }),
  },
}

export const FIGURE_TYPES: readonly Figure[] = FIGURE_ENTRIES.map(entry => ({
  kind: entry.kind,
  ...FIGURE_BUILDERS[entry.kind],
}))

const BY_KIND: ReadonlyMap<string, Figure> = new Map(
  FIGURE_TYPES.map(figure => [figure.kind, figure]),
)

export function figureByKind(kind: string): Figure | null {
  return BY_KIND.get(kind) ?? null
}
