/**
 * The SET the parity harness compares on, and the plumbing around it: the reference scene, the
 * material stage, a scene renderer mounted off screen on the engine asked for, and the two
 * conversions between a frame and a PNG.
 *
 * Apart from `engineParity.browser.ts`, which holds the CASES alone: what is compared is a short
 * list one should be able to read in one screen, and it was buried under the decor.
 */
import {
  AmbientLight,
  DataTexture,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  type Texture,
} from 'three'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { PostStack } from '@shared/domain/postProcessing'
import type { RenderEngine } from '@shared/domain/renderEngine'
import type { VisualFrame } from '../scene/visualRegression'
import { flipRows } from '../scene/film'
import { encodeFilmFrameOffThread } from '../scene/filmEncodePort'
import { offScreenHost } from '../core/offScreenHost'
import { SceneRenderer } from '../scene/SceneRenderer'
import type { SceneState } from '../scene/sceneState'
import type { RuntimeRenderCamera } from '../scene/runtimeRepresentationValidation'
import { createDefaultScene } from '../scene/defaultScene'
import { cameraNode, meshNode, transformAt } from '../scene/nodeFactory'
import type { RenderDriver } from './renderDriver'
import { glDriver } from './glDriver'
import { gpuDriver } from './gpuDriver'

/** Wide enough to compare and small enough to walk on the UI thread — 128² is 16 384 pixels. */
export const FRAME = 128

/** Where both frames of every case are left, for the runner to write beside the report. */
const FRAMES_HANDLE = '__iaEngineParityFrames'

/**
 * Keeps the two frames as pictures, because a ratio is not a diagnosis: a side that drew nothing,
 * a picture that came back upside down and one that is merely a shade darker all read as one
 * number, and only the images tell them apart.
 */
export async function keepForTheEye(
  which: string,
  gl: VisualFrame,
  gpu: VisualFrame,
): Promise<void> {
  const held: Record<string, Record<string, readonly number[]>> = Reflect.get(
    window,
    FRAMES_HANDLE,
  ) ?? {}
  const [left, right] = await Promise.all([encodePng(gl), encodePng(gpu)])
  held[which] = { gl: [...left], gpu: [...right] }
  Reflect.set(window, FRAMES_HANDLE, held)
}

/**
 * A frame to PNG bytes, put back the right way up — the very encoder a film uses, so the pictures
 * this harness writes are made the way the studio makes them, and off the UI thread.
 *
 * 🛑 The flip is the encoder's: `readPixels` answers bottom-up on both engines — the Advanced
 * driver turns its own read over to match — so a buffer written straight into a canvas comes out
 * upside down, and a reader comparing two upside-down pictures would report the flip as agreement.
 *
 * The buffer is COPIED first: the worker takes ownership of what it is handed, and the frame it
 * came from is still being compared.
 */
async function encodePng(frame: VisualFrame): Promise<Uint8Array> {
  return await encodeFilmFrameOffThread(
    new Uint8Array(frame.pixels),
    frame.width,
    frame.height,
    true,
  )
}

export type MountedScene = { renderer: SceneRenderer; release: () => void }

/**
 * How big the host is and how many frames are drawn into it before anything is read. The bench
 * measures a viewport-sized frame and warms longer; the parity harness compares a small square.
 */
export type StageShape = { width: number; height: number; warmup: number }

/** A scene renderer on the engine asked for, off screen and sized like a viewport. */
export async function mountedScene(
  engine: RenderEngine,
  state: SceneState,
  post: PostStack,
  shape: StageShape = PARITY_STAGE,
): Promise<MountedScene> {
  const host = offScreenHost(shape.width, shape.height)
  const renderer = new SceneRenderer({
    engine,
    onSelect: () => {},
    onTransform: () => {},
    // The workshop is out of every pass below anyway; `false` keeps it out of the scene graph
    // too, so neither engine is compared on a grid it drew for its own reasons.
    chrome: false,
  })
  renderer.configure({ ...DEFAULT_SETTINGS.three, quality: 'high' })
  renderer.mount(host)
  // The node backend comes up a beat after the mount: drawn before it does, every render would
  // throw and the row would report a race rather than an engine.
  await renderer.settled()
  renderer.apply({ ...state, world: { ...state.world, engine, post } })
  await quiet()
  // 🛑 Frames BEFORE the capture, exactly as a viewport draws them. The Compatible engine only
  // redraws its shadow maps on a frame it judges stale, so a capture taken before any frame
  // reads maps that have never been drawn — every surface fully in shadow, a black picture, and
  // a comparison that would have blamed the other engine. Measured 2026-09-11.
  for (let frame = 0; frame < shape.warmup; frame += 1) renderer.drawFrom(null, frame)

  return {
    renderer,
    release: () => {
      renderer.dispose()
      host.remove()
    },
  }
}

/**
 * What both engines are asked to draw: a lit set with a camera in it, two spheres close enough
 * for one to occlude the other, and a floor for the occlusion to land on.
 */
export function referenceScene(): SceneState {
  const base = createDefaultScene()
  return {
    ...base,
    nodes: [
      ...base.nodes,
      cameraNode(),
      meshNode(
        { kind: 'sphere', radius: 1, widthSegments: 48, heightSegments: 24 },
        { transform: transformAt({ x: -0.7, y: 1, z: 0 }) },
      ),
      meshNode(
        { kind: 'sphere', radius: 0.7, widthSegments: 48, heightSegments: 24 },
        { transform: transformAt({ x: 0.8, y: 0.7, z: 0.4 }) },
      ),
      meshNode(
        { kind: 'box', width: 6, height: 0.2, depth: 6 },
        { transform: transformAt({ x: 0, y: -0.1, z: 0 }) },
      ),
    ],
  }
}

/** Framed on the two spheres, at an angle where the contact shadow between them is visible. */
export function referenceCamera(): RuntimeRenderCamera {
  return {
    id: 'parity',
    position: { x: 2.6, y: 2.2, z: 4.2 },
    target: { x: 0, y: 0.8, z: 0 },
    projection: 'perspective',
    fieldOfView: 50,
    near: 0.1,
    far: 100,
    width: FRAME,
    height: FRAME,
    cameraMask: 1,
  }
}

/** The sphere the material case wears, lit hard enough for a remap to be readable. */
export function materialStage(): {
  scene: Scene
  camera: PerspectiveCamera
  material: MeshStandardMaterial
} {
  const material = new MeshStandardMaterial({ color: '#c8b48c', roughness: 0.9, metalness: 0.6 })
  // ONE texture for both slots: the same picture read twice, which is what a packed map is.
  const checker = tiledMask()
  material.roughnessMap = checker
  material.metalnessMap = checker

  const scene = new Scene()
  scene.add(new Mesh(new SphereGeometry(1, 64, 32), material))
  scene.add(new AmbientLight('#ffffff', 0.4))
  const sun = new DirectionalLight('#ffffff', 2.4)
  sun.position.set(3, 4, 5)
  scene.add(sun)

  const camera = new PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 3.2)
  camera.lookAt(0, 0, 0)
  return { scene, camera, material }
}

/**
 * A four-texel checker, REPEATED — tiling is the half of the patch that a plain map cannot show:
 * the two remapped maps are read through nodes of the studio's own, so a matrix left behind makes
 * them read untiled while every other map of the material tiles.
 */
export function tiledMask(): Texture {
  const texture = new DataTexture(
    new Uint8Array([20, 20, 20, 255, 235, 235, 235, 255, 235, 235, 235, 255, 20, 20, 20, 255]),
    2,
    2,
  )
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(4, 4)
  texture.needsUpdate = true
  texture.updateMatrix()
  return texture
}

/**
 * A PNG back to pixels, through the browser's own decoder rather than a second reader.
 *
 * Turned over on the way in: a PNG is stored top-down and every other frame in this harness is a
 * `readPixels` read, which is bottom-up. ONE convention, or the encoder above would put the
 * stills back upside down while the frames beside them came out right.
 */
export async function decodePng(png: Uint8Array): Promise<VisualFrame> {
  // `as`: the bytes come from this process's own encoder and are backed by a plain ArrayBuffer.
  const blob = new Blob([png.buffer as ArrayBuffer], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context to decode a still with')
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: new Uint8Array(flipRows(new Uint8Array(data.data), bitmap.width, bitmap.height)),
    }
  } finally {
    bitmap.close()
  }
}

/** How long the harness waits for the window to come forward before it gives up. */
export const ANIMATED_WAIT_MS = 90_000

/** How long a settling pause waits when no frame comes — a hidden window paints nothing. */
const SETTLE_MS = 400

/**
 * Whether TWO animation frames arrive within `within` — the only honest way to ask whether the
 * window is being painted. `document.hidden` answers for a minimised window and says nothing
 * about a throttled one.
 *
 * Both readings of the harness go through it: the gate that refuses to measure a window nobody
 * is painting, and the pause that lets a texture, a worker and a shader land.
 */
export async function animationFramesArrive(within = ANIMATED_WAIT_MS): Promise<boolean> {
  return await new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), within)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(timer)
        resolve(true)
      }),
    )
  })
}

/** Two frames of quiet, or `SETTLE_MS`, whichever comes first. */
async function quiet(): Promise<void> {
  await animationFramesArrive(SETTLE_MS)
}

/** What the parity cases open on. The four frames are the shadow warm-up `mountedScene` explains. */
const PARITY_STAGE: StageShape = { width: FRAME * 4, height: FRAME * 4, warmup: 4 }

export function driverOf(engine: RenderEngine): RenderDriver {
  return engine === 'gpu' ? gpuDriver : glDriver
}
