/**
 * The little trees, built from primitives. Three geometries and three materials for the whole
 * grove — a tree is the same shapes at another size, so the GPU uploads them once.
 */
import {
  BoxGeometry,
  type Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'
import type { WelcomeTree } from './welcomeGrove'

/** How tall a planter stands, as a share of its width. Low enough to read as a kerb, not a plinth. */
const PLANTER_RISE = 0.34

/** The trunk's waist, as a share of the crown. Thin on purpose — a stylised tree, not a log. */
const TRUNK_WAIST = 0.09

export type WelcomeTrees = {
  group: Group
  /** Bark, leaf and planter, in that order — read from the tokens by the backdrop. */
  paint: (bark: Color, leaf: Color, planter: Color) => void
  dispose: () => void
}

export function createWelcomeTrees(trees: readonly WelcomeTree[]): WelcomeTrees {
  // Seven sides and one subdivision: enough facets to catch the key light on a crown two metres
  // wide, few enough that the whole grove is under two thousand triangles.
  const trunk = new CylinderGeometry(0.7, 1, 1, 7)
  const crown = new IcosahedronGeometry(1, 1)
  const planter = new BoxGeometry(1, 1, 1)

  const bark = new MeshStandardMaterial({ roughness: 0.86, metalness: 0 })
  const leaf = new MeshStandardMaterial({ roughness: 0.78, metalness: 0, flatShading: true })
  const stone = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 })

  const group = new Group()
  for (const tree of trees)
    group.add(treeOf(tree, { trunk, crown, planter }, { bark, leaf, stone }))

  return {
    group,
    paint: (barkColor, leafColor, planterColor) => {
      bark.color.copy(barkColor)
      leaf.color.copy(leafColor)
      stone.color.copy(planterColor)
    },
    dispose: () => {
      for (const geometry of [trunk, crown, planter]) geometry.dispose()
      for (const material of [bark, leaf, stone]) material.dispose()
    },
  }
}

type Shapes = { trunk: CylinderGeometry; crown: IcosahedronGeometry; planter: BoxGeometry }
type Paints = {
  bark: MeshStandardMaterial
  leaf: MeshStandardMaterial
  stone: MeshStandardMaterial
}

function treeOf(tree: WelcomeTree, shapes: Shapes, paints: Paints): Object3D {
  const width = tree.planter * 2
  const rise = width * PLANTER_RISE

  const box = shadowed(new Mesh(shapes.planter, paints.stone))
  box.scale.set(width, rise, width)
  box.position.y = rise / 2
  box.receiveShadow = true

  const stem = shadowed(new Mesh(shapes.trunk, paints.bark))
  stem.scale.set(tree.crown * TRUNK_WAIST, tree.height, tree.crown * TRUNK_WAIST)
  stem.position.y = rise + tree.height / 2

  const leaves = shadowed(new Mesh(shapes.crown, paints.leaf))
  leaves.scale.setScalar(tree.crown)
  // Sunk a tenth into the trunk's top: a crown resting exactly on it shows a seam of ground light.
  leaves.position.y = rise + tree.height + tree.crown * 0.82

  const whole = new Group()
  whole.add(box, stem, leaves)
  whole.position.set(tree.x, 0, tree.z)
  whole.rotation.y = tree.turn
  return whole
}

function shadowed(mesh: Mesh): Mesh {
  mesh.castShadow = true
  return mesh
}
