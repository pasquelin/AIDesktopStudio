import { Mesh, type Object3D } from 'three'
import type { Modifiers } from '@/helpers/selection'
import type { Point } from '../core/geometry'
import type { PointerPosition } from '../viewport/pointer'
import { type ScreenBox } from './marqueeSelection'
import {
  type ModelDress,
  type EnvironmentRef,
  type ModelDressRef,
  type Transform,
} from '@shared/domain/scene'
import { type Settings } from '@shared/domain/settings'
import type { SelectionMode } from '@/helpers/selection'
import { type NodeMove } from './sceneState'
import type { Vector3 as PlainVector3 } from '@shared/domain/scene'
import type { EnvironmentDress } from '@shared/domain/skybox'
import type { FontLibrary } from '../core/fonts'
import { type RigState } from './rigState'
import { type ModelSource } from './modelCache'
import { type SceneStats } from './sceneStats'
import { type CameraPlacement } from './sceneView'
import { type Retarget, type RetargetFit } from './retarget'
import { type SkinWeights } from '../character/skinWeights'
import type { Rig } from '@shared/domain/rig'
import { type SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { CharacterExtras } from '@shared/domain/character'
import type { ModelPart } from './modelTextures'
import { type MeshSample } from './rigSnap'
import type { GlbSkinAttributes } from './glbSkin'
import { type BvhBuilder } from './bvhBuilder'
import './bvhPatches'
import { worldReach } from './grouping'
import { type TextureSource } from './textureCache'
import type { PickedPathPoint } from './pickedPathPoint'
import type { PackedReliefChunk } from '@shared/domain/relief'
import type { ReliefSurface } from './reliefSurface'
import type { ReliefSculptor } from './reliefSculptor'
import type { GroundPaint } from '@shared/domain/groundPaint'

export type GroupingStrategy = 'instanced' | 'batched'

/**
 * Whether the world is cut into cells the camera turns off, or drawn whole.
 *
 * `grid` — the default — files every body under a cell of 256 and draws only the cells its view
 * can reach: measured on a level of 500 000, 17 848 instances against 231 397 and 1.43 ms of GPU
 * against 3.52. `off` is the studio as it drew before it. See `cellInstancing`.
 */
export type PartitionMode = 'off' | 'grid'

export type SceneRendererOptions = {
  optimization?: 'auto' | 'off'
  /**
   * What the click asked for, in the shape `Tree` reports it — a click in the void is an empty
   * list. The mode says what the modifier keys meant; a viewport draws no rows, so never a range.
   */
  onSelect: (ids: readonly string[], mode: SelectionMode) => void
  onTransform: (moves: readonly NodeMove[]) => void
  onReliefSculpt?: (terrainId: string, editId: string, chunks: readonly PackedReliefChunk[]) => void
  onReliefMask?: (terrainId: string, editId: string, chunks: readonly PackedReliefChunk[]) => void
  onScatterMask?: (scatterId: string, chunks: readonly PackedReliefChunk[]) => void
  onGroundPaint?: (terrainId: string, paint: GroundPaint) => void
  loadGroundPaint?: (terrainId: string) => Promise<GroundPaint | null>
  onReliefStrokeStart?: () => void
  onReliefStrokeEnd?: () => void
  /**
   * The editor's own furniture — trihedron, camera bodies and frustums, light helpers, rails.
   * `false` draws none of it: a window that PLAYS a scene shows the game, and the tools it was
   * built with are the studio talking over it.
   */
  chrome?: boolean
  /**
   * What clips a model brought, once its file has landed. React cannot ask the cache: the names
   * live in the file, not in the document, and a panel offering a choice has to know them.
   */
  onClips?: (
    nodeId: string,
    clips: readonly string[],
    lengths: Readonly<Record<string, number>>,
  ) => void
  /**
   * How many MATERIALS a model's file carries — its slots. Same reason as `onClips`: the count
   * lives in the file, and a panel drawing one row per slot has no other way to know it.
   */
  onMaterials?: (
    nodeId: string,
    count: number,
    names: readonly string[],
    parts: readonly ModelPart[],
    hasFileTextures: boolean,
    sourceIndices: readonly (number | null)[],
  ) => void
  /** The morph targets a model's file carries, by name. Same reason as `onClips`: file facts. */
  onMorphs?: (nodeId: string, names: readonly string[]) => void
  /**
   * How well a clip from elsewhere fits this character, once both skeletons are in hand. Only
   * the engine ever holds the two at once, so nothing else could work it out.
   */
  onClipFit?: (nodeId: string, clipKey: string, fit: RetargetFit) => void
  /**
   * What a model turned out to be once its file landed — bones, humanoid roles, and which of the
   * five states it is in. Same reason as `onClips`: none of it lives in the document.
   */
  onRig?: (nodeId: string, rig: RigState) => void
  /**
   * The skeleton this model's FILE carries, as a document holds one, with what the studio wrote
   * beside it. For the window that edits a character: only the engine ever decodes the file.
   */
  onCharacter?: (
    nodeId: string,
    rig: Rig | null,
    extras: CharacterExtras | null,
    /**
     * What the mesh measures AND what it is made of — the envelope a fit proportions itself off,
     * and the points that pull each joint inside the body rather than onto that envelope.
     */
    sample: MeshSample | null,
  ) => void
  /**
   * The weights this side just worked out, for whoever writes the file back. Only the engine
   * ever holds both a mesh and a rig, and asking for them again at ⌘S would pay for a million
   * vertices a second time.
   */
  onSkinning?: (nodeId: string, skins: readonly GlbSkinAttributes[]) => void
  /**
   * What a skeleton of that signature means, worked out from a document's own rig. Kept by the
   * project rather than here: this port dies with the viewport, and the mapping outlives it.
   */
  onProfile?: (profile: SkeletonProfile) => void
  /** The mappings the project already knows, applied before anything is read. */
  profiles?: readonly SkeletonProfile[]
  /**
   * The bone a click picked while the pose mode is on, or nothing for a click in the void.
   *
   * Apart from `onSelect` because a bone is not a node: it has no id in the document, it is
   * addressed by the pair its channels are addressed by — see `TrackTarget`.
   */
  onSelectBone?: (picked: { nodeId: string; bone: string } | null) => void
  /**
   * A control point of a rail was picked, or let go of. Apart from `onSelect` for the same
   * reason a bone is: a point has no id in the document, and no row in the tree.
   */
  onSelectPathPoint?: (picked: PickedPathPoint | null) => void
  /**
   * The rectangle being dragged, in CSS pixels from the canvas' top-left corner, or `null` once
   * it is over. Drawn by whoever hosts the canvas: an outline through WebGL costs a pass a frame.
   */
  onMarquee?: (box: ScreenBox | null) => void
  /** Where a picked control point or tangent was dragged to, in the frame of the rail. */
  onPathPoint?: (picked: PickedPathPoint, point: PlainVector3) => void
  /** A point is to be posed on that rail, right after the stretch of it that was clicked. */
  onAddPathPoint?: (nodeId: string, index: number) => void
  /** A point is to be posed at the END of that rail, where the click landed in its own frame. */
  onAppendPathPoint?: (nodeId: string, point: PlainVector3) => void
  /** That rail is to be joined up: its last point comes back round to its first. */
  onClosePath?: (nodeId: string) => void
  /** A control point was right-clicked, for whoever raises its menu — this side draws none. */
  onPathPointMenu?: (nodeId: string, index: number) => void
  /**
   * A camera of the scene was moved by orbiting the pane locked onto it — an EDIT of the
   * document, unlike moving the view, and reported once per gesture rather than per frame.
   */
  onCameraMoved?: (nodeId: string, transform: Transform) => void
  /**
   * A node right-clicked in the viewport, for whoever raises the menu — this side draws none.
   *
   * Only for a right button that went down and came up in the same place with no motion key
   * held: that button flies the camera, and every flight would otherwise end in a menu.
   *
   * `null` for a click that hit nothing — the void offers what a scene can RECEIVE, where a node
   * offers what can be done to it.
   */
  onContextMenu?: (nodeId: string | null) => void
  /**
   * What the scene costs, whenever that changes. Counted here because only the engine knows what
   * a model actually brought: the document holds an asset id, not the triangles behind it.
   */
  onStats?: (stats: SceneStats, selected: SceneStats) => void
  /** The navigation mode is over — by Escape, by a lost capture, or by the caller's own call. */
  onNavigatingChange?: (navigating: boolean) => void
  /** What the wheel left the flying speed at, so a panel can show the figure it is flying at. */
  onFlySpeedChange?: (speed: number) => void
  /**
   * Where the free camera came to rest, once a drag of it is over.
   *
   * It is what lets a montage look through the view the person is actually working in: a scene
   * with no camera of its own has no other framing anybody chose. Published rather than read,
   * because only the controls know when a gesture ended.
   */
  onView?: (placement: CameraPlacement) => void
  /**
   * Which of the four views the pointer settled in. Published rather than asked for: a panel that
   * read it during its own render was never told when the answer moved, and wrote a display mode
   * into the pane the hand had already left.
   */
  onPane?: (pane: number) => void
  /**
   * How repeated shapes are drawn in fewer calls, for a caller leaving the cells. `instanced`
   * opens one `InstancedMesh` per shape and material, split into regions; `batched` opens one
   * `BatchedMesh` per material — measured on this Mac, 2026-09-02, it costs MORE CPU on every
   * scene, 10.4 ms against 3.1 a frame on 10 000 bodies. Naming either one turns `partition` off.
   */
  grouping?: GroupingStrategy
  /**
   * Whether the level is cut into cells only the ones a view reaches are drawn from. `grid` by
   * default; `off` groups the whole world as the studio did before the cells.
   */
  partition?: PartitionMode
  /** Absent builds a real `GLTFLoader`; a test hands a stub, since jsdom parses no GLB. */
  loadModel?: ModelSource
  /** Same, for a file read for its animation alone — which may be an FBX. See `GltfSource`. */
  loadAnimation?: ModelSource
  /** And again, for replaying a shipped animation on a character's own skeleton. */
  retarget?: Retarget
  /** Same, for the sky an environment hangs: jsdom decodes no image either. */
  loadTexture?: TextureSource
  /**
   * When each asset was last written, read off the catalogue by whoever mounts the engine.
   *
   * A port rather than a store read, like everything else here: `engines/` knows no store. It is
   * what makes an edited picture reach the scene — see `refreshTextures`.
   */
  assetVersion?: (assetId: string) => string | undefined
  /** What an open editor is drawing of an asset, ahead of its file — see `livePreviews`. */
  livePreview?: (assetId: string) => ImageBitmap | null
  /**
   * What a model's DRESS is worth to one of its material slots, resolved when the scene is read.
   *
   * Synchronous, like `assetVersion`: the window answers from the open tab or from the copy it
   * read off disk (`materialSources`), and asks for the file when it holds neither. Absent
   * leaves every model on the maps its own file carries — a workspace with no documents, and
   * every test.
   */
  wornDress?: (dress: ModelDressRef, slot: number) => ModelDress | null
  defaultModelDress?: (assetId: string) => ModelDressRef | undefined
  prepareModelDress?: (assetId: string) => Promise<void>
  /**
   * What the ENVIRONMENT this scene names is worth to it. Synchronous, like `wornDress`: the
   * window answers from the open tab or from the copy read off disk. Absent, the studio lights it.
   */
  environmentDress?: (environment: EnvironmentRef) => EnvironmentDress | null
  /** Same again, for the picking trees: jsdom spawns the worker that builds them no more. */
  bvh?: BvhBuilder
  relief?: ReliefSurface
  createReliefSculptor?: () => ReliefSculptor
  /** And again, for the skinning weights a local rig is bound with. */
  skin?: SkinWeights
  /**
   * How far along binding a model's rig is, 0 to 1. Reported because it is the one operation of
   * this engine that can take a minute — and it is free, so nothing else warns the user it began.
   */
  onRigProgress?: (nodeId: string, progress: number) => void
  /** The typefaces a text is cut from. Shared with the image workspace — see `services/fonts`. */
  fonts?: FontLibrary
}

/**
 * What the viewport is set to. Held by the engine and pushed in by React, like every other
 * piece of state it reflects: these were three constants, and therefore three settings nobody
 * could reach.
 *
 * The settings themselves, not a copy of their shape. Spelled out here, the two drifted in
 * silence: a field added to the settings would have compiled on both sides and simply never
 * reached the viewport. Whether snapping is ON stays out — that is `setSnapping`, per document,
 * not a preference.
 */
export type ViewportOptions = Settings['three']

/**
 * How strongly the environment lights the scene. Below one because a scene has lights of its own
 * and shadows to keep readable — the texture preview, which has neither, judges at full strength.
 */
export const STUDIO_INTENSITY = 0.4

/** How far the pointer may wander between press and release and still count as a click, in px. */
const CLICK_SLOP = 4

/** Either modifier adds and removes: a viewport draws no rows, so it has no range to extend. */
export function extendsSelection(event: Modifiers): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey
}

/**
 * The rectangle a bare left button drags, pinned to the pane it started in and to the canvas'
 * place on screen: neither can move mid-drag, and reading them per move is a forced reflow.
 */
export type Marquee = { pane: number; corner: Point; from: PointerPosition; to: PointerPosition }

/** How far a camera's frustum is OUTLINED, in metres. Never how far that camera sees. */
export const FRUSTUM_REACH = 2

/**
 * Whether a release ends a click rather than a drag. Both buttons ask it: the left one to tell a
 * pick from an orbit, the right one to tell a menu from a flight — and a slop written twice is a
 * slop that stops agreeing the day it learns about pointer type or DPI.
 */
export function wasClick(from: PointerPosition | null, to: PointerPosition): boolean {
  return (
    from !== null && Math.hypot(to.clientX - from.clientX, to.clientY - from.clientY) <= CLICK_SLOP
  )
}

/**
 * What a body covers around its origin, in metres. A mesh by `worldReach`, which the grouping
 * already measures with; anything else by nothing — a group's box is a walk of its subtree.
 */
export function worldRadiusOf(object: Object3D): number {
  return object instanceof Mesh ? worldReach(object.geometry, object.matrixWorld) : 0
}
