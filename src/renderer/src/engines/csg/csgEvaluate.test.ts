import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { csgPartOf, type CsgGraph, type CsgPart } from '@shared/domain/csg'
import { DEFAULT_MATERIAL } from '../scene/sceneState'
import { evaluateGraph } from './csgEvaluate'
import type { CsgMesh } from './csgMessage'
import { meshVolume } from './meshVolume'

/**
 * The real cut, run in Node. Its own suite because the worker hides everything: the evaluator
 * reads a brush's POSITION off its matrix but not its SCALE, so a pillar scaled six times tall
 * came out one unit tall — and nothing in the studio was red.
 */
const cube = (name: string): CsgPart =>
  csgPartOf(name, { kind: 'box', width: 1, height: 1, depth: 1 }, DEFAULT_MATERIAL)

const placed = (part: CsgPart, transform: Partial<CsgPart['transform']>): CsgPart => ({
  ...part,
  transform: { ...part.transform, ...transform },
})

function sizeOf(mesh: CsgMesh): Vector3 {
  const size = new Vector3()
  new Box3().setFromBufferAttribute(new BufferAttribute(mesh.position, 3)).getSize(size)
  return size
}

const graph = (base: CsgPart, steps: CsgGraph['steps']): CsgGraph => ({
  base,
  steps,
  collision: 'trimesh',
})

/** A solid is POSITIVE; a solid turned inside out is not. The only reading an eye cannot fake. */
function volumeOf(mesh: CsgMesh): number {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.position, 3))
  if (mesh.index) geometry.setIndex(new BufferAttribute(mesh.index, 1))
  return meshVolume(geometry)
}

const trianglesOf = (mesh: CsgMesh): number =>
  mesh.index ? mesh.index.length / 3 : mesh.position.length / 9

/** How far the u coordinate travels over the whole solid — one metre per tile, at density one. */
function uSpanOf(mesh: CsgMesh): number {
  let least = Infinity
  let most = -Infinity
  for (let at = 0; at < mesh.uv.length; at += 2) {
    least = Math.min(least, mesh.uv[at]!)
    most = Math.max(most, mesh.uv[at]!)
  }
  return most - least
}

const tiled = (part: CsgPart, tilesPerMetre: number): CsgPart => ({
  ...part,
  material: { ...DEFAULT_MATERIAL, tilesPerMetre },
})

describe('evaluateGraph', () => {
  // 🛑 A box is born with UVs of 0..1 per face, whatever its size: a welded kerb wore ONE square
  // stretched over thirty metres, and read as no grid at all.
  it('lays one grid across a whole union rather than one per brush', () => {
    const left = tiled(cube('Left'), 1)
    const right = tiled(placed(cube('Right'), { position: { x: 0.6, y: 0, z: 0 } }), 1)
    const welded = evaluateGraph(graph(left, [{ operation: 'unite', part: right }]))

    // The solid is 1,6 m across, so its grid travels 1,6 tiles — never the 1,0 of a bare box.
    expect(uSpanOf(welded)).toBeCloseTo(1.6, 2)
  })

  it('reads the density each brush was painted with', () => {
    const left = tiled(cube('Left'), 0.5)
    const right = tiled(placed(cube('Right'), { position: { x: 0.6, y: 0, z: 0 } }), 0.5)
    const welded = evaluateGraph(graph(left, [{ operation: 'unite', part: right }]))

    expect(uSpanOf(welded)).toBeCloseTo(0.8, 2)
  })

  it('keeps the size a scaled brush was given', () => {
    const pillar = placed(cube('Pillar'), { scale: { x: 1, y: 6, z: 1 } })
    const beside = placed(cube('Beside'), { position: { x: 0.6, y: 0, z: 0 } })
    const size = sizeOf(evaluateGraph(graph(pillar, [{ operation: 'unite', part: beside }])))

    // Six, never one: the defect this suite exists for.
    expect(size.y).toBeCloseTo(6, 3)
    expect(size.x).toBeCloseTo(1.6, 3)
  })

  it('keeps the turn a rotated brush was given', () => {
    const wall = placed(cube('Wall'), { scale: { x: 1, y: 6, z: 1 } })
    const turned = placed(cube('Turned'), {
      position: { x: 0.6, y: 0, z: 0 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
    })
    const size = sizeOf(evaluateGraph(graph(wall, [{ operation: 'unite', part: turned }])))

    // A cube turned 45° is √2 across, so the union is deeper than either brush alone.
    expect(size.z).toBeCloseTo(Math.SQRT2, 2)
  })

  it('takes a hole right through, so a window opens in a wall', () => {
    const wall = placed(cube('Wall'), { scale: { x: 4, y: 3, z: 0.2 } })
    const hole = placed(cube('Hole'), { position: { x: 0, y: 0, z: 0 } })
    const pierced = evaluateGraph(graph(wall, [{ operation: 'subtract', part: hole }]))

    // The wall keeps its own size — a cut takes matter away, never the outline.
    const size = sizeOf(pierced)
    expect(size.x).toBeCloseTo(4, 3)
    expect(size.y).toBeCloseTo(3, 3)
    // And it costs more triangles than the plain box it was, because the opening is walled.
    expect(pierced.position.length / 3).toBeGreaterThan(36)
  })

  it('keeps only what two brushes share', () => {
    const left = cube('Left')
    const right = placed(cube('Right'), { position: { x: 0.5, y: 0, z: 0 } })
    const size = sizeOf(evaluateGraph(graph(left, [{ operation: 'intersect', part: right }])))

    expect(size.x).toBeCloseTo(0.5, 3)
    expect(size.y).toBeCloseTo(1, 3)
  })

  /**
   * Chaining booleans, which the toolbar used to refuse. The inner recipe must survive the second
   * fold: a wall already pierced, then joined to a block, still has its window.
   */
  it('keeps the cuts of a solid folded into another solid', () => {
    const wall = placed(cube('Wall'), { scale: { x: 4, y: 3, z: 0.2 } })
    const window = placed(cube('Window'), { scale: { x: 1, y: 1, z: 2 } })
    const pierced: CsgGraph = graph(wall, [{ operation: 'subtract', part: window }])

    const alone = evaluateGraph(pierced)
    const block = placed(cube('Block'), { position: { x: 3, y: 0, z: 0 } })
    const both = evaluateGraph(
      graph(csgPartOf('Pierced', pierced, DEFAULT_MATERIAL), [{ operation: 'unite', part: block }]),
    )

    // Wider, because the block reaches past the wall — and still carrying the window's walls,
    // which a fold that kept only the base shape would have dropped.
    expect(sizeOf(both).x).toBeGreaterThan(sizeOf(alone).x)
    expect(both.position.length).toBeGreaterThan(alone.position.length)
  })

  /**
   * A gizmo drag that passes through zero flips the sign of a scale — the inspector shows
   * `-2,13 / -7,82 / -7,79` and nothing else says a word. Every boolean on that shape then came
   * out MIRRORED: 48 triangles of signed volume -127.32, the faces wound backwards so
   * `three-bvh-csg` had nothing left to cut into. Both signs now give the same solid.
   */
  it('cuts a matter whose scale is negative exactly as it cuts a positive one', () => {
    const pierced = (sign: number) => {
      const wall = placed(cube('Wall'), {
        scale: { x: sign * 2.13, y: sign * 7.83, z: sign * 7.79 },
      })
      const hole = placed(cube('Hole'), { scale: { x: 1, y: 1, z: 20 } })
      return evaluateGraph(graph(wall, [{ operation: 'subtract', part: hole }]))
    }

    const mirrored = pierced(-1)
    const plain = pierced(1)

    expect(volumeOf(mirrored)).toBeGreaterThan(0)
    expect(volumeOf(mirrored)).toBeCloseTo(volumeOf(plain), 6)
    expect(trianglesOf(mirrored)).toBe(trianglesOf(plain))
  })

  /** A cut ADDS triangles, because the opening it makes is walled. A mirrored one added none. */
  it('costs more triangles than the shape it was cut from', () => {
    const wall = placed(cube('Wall'), { scale: { x: -2.13, y: -7.83, z: -7.79 } })
    const hole = placed(cube('Hole'), { scale: { x: 1, y: 1, z: 20 } })
    const whole = evaluateGraph(graph(wall, []))
    const cut = evaluateGraph(graph(wall, [{ operation: 'subtract', part: hole }]))

    expect(trianglesOf(cut)).toBeGreaterThan(trianglesOf(whole))
  })

  it('hands back normals and uvs, which a material needs to light and to map', () => {
    const cut = evaluateGraph(
      graph(cube('A'), [
        { operation: 'subtract', part: placed(cube('B'), { position: { x: 0.5, y: 0, z: 0 } }) },
      ]),
    )

    expect(cut.normal.length).toBe(cut.position.length)
    expect(cut.uv.length).toBe((cut.position.length / 3) * 2)
  })
})
