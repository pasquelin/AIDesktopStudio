import {
  Box3,
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three'
import { clamp } from '@shared/numeric'
import { reportFailure } from '@/services/diagnostics'
import { onPaletteChange, tokenAsHex } from '../core/palette'
import { createGltfSource } from '../scene/gltfSource'
import { applyShadowQuality, fitShadowCamera, resizeShadowMap } from '../scene/shadows'
import { createRetarget } from '../scene/retarget'
import RetargetWorker from '../scene/retarget.worker?worker'
import { WelcomeHero } from './WelcomeHero'
import { WELCOME_GROVE } from './welcomeGrove'
import { createWelcomeTrees, type WelcomeTrees } from './welcomeTrees'
import { approach, WELCOME_SWING_RATE, welcomeAzimuth, welcomePose } from './welcomeMotion'

const FALLBACK_CHASSIS = 0x2b2d30
const FALLBACK_VIEWPORT = 0x33363b
const FALLBACK_VIEWPORT_LINE = 0x494d54
const FALLBACK_MESH = 0x868a91
const FALLBACK_ELEVATED = 0x3c3f44
const FALLBACK_ACCENT = 0x346ef2
const FALLBACK_FOLIAGE = 0x6fb79b

/** Wide enough that its edge is far behind the fog: a floor whose end can be seen has no horizon. */
const FLOOR = 200

const GRID = 64

/** Lines fade a stride past the grove, so the band the copy sits on is flat ground. */
const FOG_NEAR = 11
const FOG_FAR = 34

/** Motes in the air. Enough to say the room is alive, few enough that none lands on a word. */
const MOTES = 520

/** Half the shadow camera's box, in world units: the yard and the grove around it, and no more. */
const SHADOW_REACH = 13

/**
 * The longest step the stroll is ever handed. A window that comes back from an hour hidden reports
 * that hour, and a walker paid for it in one frame would land on the other side of the yard.
 */
const LONGEST_STEP = 0.1

function hexColor(element: Element, name: string, fallback: number): Color {
  return new Color(tokenAsHex(element, name, fallback))
}

function makeFloor(): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const floor = new Mesh(
    new PlaneGeometry(FLOOR, FLOOR),
    new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }),
  )
  floor.rotation.x = -Math.PI / 2
  // Under the grid rather than level with it: coplanar, the two fight for every far pixel.
  floor.position.y = -0.004
  floor.receiveShadow = true
  return floor
}

function makeGrid(): GridHelper {
  // White at both ends so the token lives in `material.color`: the helper bakes its colours into a
  // vertex attribute, and a theme change would otherwise mean rebuilding the geometry.
  const grid = new GridHelper(GRID, GRID, 0xffffff, 0xffffff)
  grid.material.toneMapped = false
  return grid
}

function makeMotes(): Points<BufferGeometry, PointsMaterial> {
  const positions = new Float32Array(MOTES * 3)
  for (let index = 0; index < MOTES; index += 1) {
    const at = index * 3
    positions[at] = (Math.random() - 0.5) * 38
    // Never on the floor and never above the horizon: motes belong to the air the fog fills.
    positions[at + 1] = 0.3 + Math.random() * 5.2
    // 🛑 Stopping WELL short of the camera, which stands at z 11.5. Reaching past it, the nearest
    // mote landed a hand's width from the lens and `sizeAttenuation` drew it as a grey slab.
    positions[at + 2] = -24 + Math.random() * 28
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  return new Points(
    geometry,
    new PointsMaterial({ size: 0.075, transparent: true, opacity: 0.75, depthWrite: false }),
  )
}

export type WelcomeBackdropOptions = {
  reduceMotion: boolean
  slide: number
}

/**
 * 🛑 The grid is `toneMapped: false`: it IS `--color-viewport-line`, so it must leave the pipeline
 * at the value the stylesheet declares. The floor is lit and shadowed, so it cannot be.
 */
export class WelcomeBackdrop {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(38, 1, 0.1, 400)
  private readonly clock = new Clock()
  /**
   * Deliberately NOT the floor's colour: painted alike, a light theme loses its horizon entirely.
   * The chassis falls the right side of the floor in both themes.
   */
  private readonly wall = new Color(FALLBACK_CHASSIS)
  private readonly floor = makeFloor()
  private readonly grid = makeGrid()
  private readonly motes = makeMotes()
  private readonly trees: WelcomeTrees = createWelcomeTrees(WELCOME_GROVE)
  private readonly hero: WelcomeHero
  private readonly sky = new HemisphereLight(0xffffff, 0xffffff, 1.5)
  /** WHITE in both themes: a light is not an ink, and only the SURFACES read tokens here. */
  private readonly key = new DirectionalLight(0xffffff, 1.8)
  /**
   * From UNDER the grove: placed with the key it reached nothing new, and every facet the crowns
   * turn downward stayed a black wedge.
   */
  private readonly fill = new DirectionalLight(0xffffff, 0.55)
  private readonly lamp = new PointLight(FALLBACK_ACCENT, 42, 16, 2)
  /** Dropped on dispose. The studio publishes the theme, THEN calls the listeners: reading the
   * tokens off a `theme` effect of our own handed back the palette being left. */
  private readonly dropPalette = onPaletteChange(() => this.syncPalette())
  private readonly gltf = createGltfSource(
    () => this.renderer,
    (subject, error) => reportFailure('scene.model', subject, error),
  )
  private readonly retarget = createRetarget(() => new RetargetWorker())
  private readonly onVisibility = (): void => this.start()
  private azimuth = 0
  private wantedAzimuth = 0
  private frame: number | null = null
  private lastDrawn = 0
  private disposed = false
  private reduceMotion: boolean
  private frozenTime = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: WelcomeBackdropOptions,
  ) {
    this.reduceMotion = options.reduceMotion
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.toneMapping = ACESFilmicToneMapping
    // The floor IS `--color-viewport`, and ACES darkens what it is handed: at 1 the plate read a
    // stop under the token it is painted with.
    this.renderer.toneMappingExposure = 1.3
    this.renderer.shadowMap.enabled = true
    // 🛑 By the studio's own setting, never `PCFSoftShadowMap`: three 0.185 defines a shadow type
    // for PCF and VSM only, so that one compiles down to an UNFILTERED compare — and `shadow.radius`
    // with it, which the fragment shader reads inside the PCF branch alone.
    applyShadowQuality(this.renderer, 'soft')

    this.hero = new WelcomeHero({
      gltf: this.gltf,
      retarget: this.retarget,
      onReady: () => this.arrive(),
      onFailure: error => reportFailure('scene.model', 'welcome.character', error),
    })

    this.key.position.set(-7, 10, 6)
    this.castFrom(this.key)
    this.fill.position.set(4, -3, 5)
    // A lamp and not a second sun: the accent is a light in this room, and a directional one would
    // paint the whole floor blue — the wash the ground token exists to refuse.
    this.lamp.position.set(5.4, 2.4, -5)

    this.scene.add(this.floor, this.grid, this.motes, this.trees.group, this.hero.group)
    this.scene.add(this.sky, this.key, this.key.target, this.fill, this.lamp)
    this.scene.fog = new Fog(this.wall, FOG_NEAR, FOG_FAR)
    this.syncPalette()
    this.setSlide(options.slide)
    this.azimuth = this.wantedAzimuth
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resize()
    this.start()
  }

  setReduceMotion(value: boolean): void {
    if (this.reduceMotion === value) return
    this.reduceMotion = value
    if (value) {
      this.frozenTime = this.clock.getElapsedTime()
      this.hero.settle()
    }
    this.start()
  }

  setSlide(index: number): void {
    this.wantedAzimuth = welcomeAzimuth(index)
    this.hero.faceEye(welcomePose(0, this.wantedAzimuth).eye, index)
    this.start()
  }

  syncPalette(): void {
    const ground = hexColor(this.canvas, '--color-viewport', FALLBACK_VIEWPORT)
    this.wall.copy(hexColor(this.canvas, '--color-chassis', FALLBACK_CHASSIS))
    const line = hexColor(this.canvas, '--color-viewport-line', FALLBACK_VIEWPORT_LINE)
    const mesh = hexColor(this.canvas, '--color-mesh', FALLBACK_MESH)

    this.scene.background = this.wall
    if (this.scene.fog instanceof Fog) this.scene.fog.color.copy(this.wall)
    this.renderer.setClearColor(this.wall, 1)
    this.floor.material.color.copy(ground)
    this.grid.material.color.copy(line)
    this.motes.material.color.copy(mesh)
    // A planter is a SURFACE of this app, not its wall: painted in the chassis it read as a black
    // hole in the plate, since the floor beside it is lit and the chassis is not.
    this.trees.paint(
      mesh,
      hexColor(this.canvas, '--color-foliage', FALLBACK_FOLIAGE),
      hexColor(this.canvas, '--color-elevated', FALLBACK_ELEVATED),
    )
    this.sky.color.copy(line)
    // The LINE and not the ground: a hemisphere's lower half is the bounce off the floor, and the
    // floor here is LIT. Handed the raw ground token it returned nothing, and every facet that
    // pointed down came back as a black wedge.
    this.sky.groundColor.copy(line)
    this.lamp.color.copy(hexColor(this.canvas, '--color-accent', FALLBACK_ACCENT))
    this.start()
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.start()
  }

  dispose(): void {
    this.disposed = true
    this.dropPalette()
    document.removeEventListener('visibilitychange', this.onVisibility)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.hero.dispose()
    this.trees.dispose()
    this.retarget.dispose()
    this.gltf.dispose()
    for (const object of [this.floor, this.grid, this.motes]) {
      object.geometry.dispose()
      object.material.dispose()
    }
    this.renderer.dispose()
  }

  /** The character has landed: a still frame owes them a pose, a moving one owes them a loop. */
  private arrive(): void {
    if (this.reduceMotion) this.hero.settle()
    this.start()
  }

  private castFrom(light: DirectionalLight): void {
    light.castShadow = true
    resizeShadowMap(light, 2048)
    // Soft rather than stamped: a hard black wedge under a crown reads as a hole in the plate.
    light.shadow.radius = 4
    light.shadow.intensity = 0.55
    light.shadow.camera.far = 34
    fitShadowCamera(light, { bounds: new Box3(), floor: 2 * SHADOW_REACH })
    // Along the surface rather than into it: at this grazing angle a plain bias detaches a crown
    // from the shadow it casts, and a normal one leaves the contact where the foot is.
    light.shadow.normalBias = 0.03
  }

  /**
   * Asks for the next frame, or draws the single one a still needs. Nothing is asked for while the
   * window is hidden — a GPU turning behind another window is paid for a picture nobody sees.
   */
  private start(): void {
    if (this.disposed) return
    if (!this.reduceMotion && !document.hidden) {
      if (this.frame === null) this.frame = requestAnimationFrame(this.tick)
      return
    }
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.azimuth = this.wantedAzimuth
    // The clock keeps running while hidden, so the first frame back would be handed the absence.
    this.lastDrawn = 0
    if (!document.hidden) this.draw()
  }

  private draw(): void {
    const elapsed = this.reduceMotion ? this.frozenTime : this.clock.getElapsedTime()
    const { eye, target } = welcomePose(elapsed, this.azimuth)
    this.camera.position.set(eye.x, eye.y, eye.z)
    this.camera.lookAt(target.x, target.y, target.z)
    this.motes.rotation.y = this.reduceMotion ? 0 : elapsed * 0.02
    this.renderer.render(this.scene, this.camera)
  }

  private tick = (): void => {
    if (this.disposed) return
    this.frame = null
    const now = this.clock.getElapsedTime()
    const seconds = this.lastDrawn === 0 ? 0 : clamp(now - this.lastDrawn, 0, LONGEST_STEP)
    this.lastDrawn = now
    this.azimuth = approach(this.azimuth, this.wantedAzimuth, seconds, WELCOME_SWING_RATE)
    if (seconds > 0) this.hero.advance(seconds)
    this.draw()
    this.start()
  }
}
