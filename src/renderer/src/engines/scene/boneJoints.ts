/**
 * The joints of a skeleton, drawn as points.
 *
 * `SkeletonHelper` draws the bones as SEGMENTS and nothing else, so a joint — which is what one
 * actually clicks and drags — had no mark of its own: a chain of three bones read as two lines
 * meeting somewhere, and the somewhere is the thing being aimed at.
 *
 * Points rather than little spheres: a sphere is a mesh per joint, lit, sorted and depth-tested,
 * where fifty-two joints have to cost one draw call and stay the same size however far the
 * camera is.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
  PointsMaterial,
  Vector3,
  type Bone,
  type Object3D,
  type Texture,
} from 'three'
import { rootColour } from '../core/palette'

/** Screen pixels, never metres: the mark has to stay aimable whatever the camera is doing. */
const JOINT_SIZE = 7

/** Texture pixels. Four times the mark on screen, so its edge holds under any zoom. */
const DISC_SIZE = 32

const WORLD = new Vector3()

/**
 * The round mark itself, drawn rather than shipped: `PointsMaterial` squares off a point, and a
 * joint reads as a point only when it is round. `null` under a runner, where a canvas hands back
 * no 2D context — the mark is then square, which is what it has always been.
 */
function jointDisc(): Texture | null {
  const canvas = document.createElement('canvas')
  canvas.width = DISC_SIZE
  canvas.height = DISC_SIZE

  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#ffffff'
  context.beginPath()
  context.arc(DISC_SIZE / 2, DISC_SIZE / 2, DISC_SIZE / 2, 0, 2 * Math.PI)
  context.fill()

  return new CanvasTexture(canvas)
}

/**
 * The two colours a joint takes. Handed in for `jointDisc`'s reason: a runner resolves no custom
 * property at all, so both tokens come back the same and nothing could be told apart.
 */
export type JointColours = { rest: string; picked: string }

const JOINT_COLOURS = (): JointColours => ({
  rest: rootColour('--color-muted'),
  picked: rootColour('--color-accent'),
})

export type BoneJoints = {
  points: Points
  /** Reads every bone's world position again — they move with the pose, every frame. */
  refresh: () => void
  /** Paints one joint as the CHOSEN one, or none. Nothing else says which bone is being edited. */
  pick: (bone: string | null) => void
  dispose: () => void
}

/**
 * One point per bone, in WORLD space and hung beside the scene rather than inside it.
 *
 * Inside, the outliner would list it and a click could pick it; beside, it is decoration exactly
 * as the helper it doubles is.
 */
export function createBoneJoints(
  bones: readonly Bone[],
  drawDisc: () => Texture | null = jointDisc,
  readColours: () => JointColours = JOINT_COLOURS,
): BoneJoints {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(bones.length * 3)
  const attribute = new BufferAttribute(positions, 3)
  geometry.setAttribute('position', attribute)

  const colours = new Float32Array(bones.length * 3)
  const colour = new BufferAttribute(colours, 3)
  geometry.setAttribute('color', colour)

  const palette = readColours()
  const restColour = new Color(palette.rest)
  const pickedColour = new Color(palette.picked)

  const disc = drawDisc()
  const material = new PointsMaterial({
    vertexColors: true,
    size: JOINT_SIZE,
    sizeAttenuation: false,
    depthTest: false,
    transparent: true,
    ...(disc ? { alphaMap: disc, alphaTest: 0.5 } : {}),
  })

  const points = new Points(geometry, material)
  points.raycast = () => {}
  points.renderOrder = 1
  points.frustumCulled = false

  const held = new Set<Object3D>(bones)
  const roots = bones.filter(bone => !bone.parent || !held.has(bone.parent))

  const pick = (picked: string | null): void => {
    for (const [index, bone] of bones.entries()) {
      const paint = bone.name === picked ? pickedColour : restColour
      colours[index * 3] = paint.r
      colours[index * 3 + 1] = paint.g
      colours[index * 3 + 2] = paint.b
    }
    colour.needsUpdate = true
  }

  const refresh = (): void => {
    for (const root of roots) root.updateWorldMatrix(true, true)

    for (const [index, bone] of bones.entries()) {
      WORLD.setFromMatrixPosition(bone.matrixWorld)
      positions[index * 3] = WORLD.x
      positions[index * 3 + 1] = WORLD.y
      positions[index * 3 + 2] = WORLD.z
    }
    attribute.needsUpdate = true
  }

  refresh()
  pick(null)

  return {
    points,
    refresh,
    pick,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      disc?.dispose()
    },
  }
}
