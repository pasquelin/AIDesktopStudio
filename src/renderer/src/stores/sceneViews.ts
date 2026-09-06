import type { PickedPathPoint } from '@/engines/scene/SceneRenderer'
import type { SculptTool } from '@/engines/scene/reliefStroke'
export type { SculptTool }
import { create } from 'zustand'
import { snapToFrame, type Us } from '@shared/domain/time'
import { sameCameraView } from '@shared/domain/transform'
import {
  DEFAULT_PANE_VIEWS,
  type CameraPlacement,
  type PaneView,
  type PreviewWatch,
} from '@/engines/scene/sceneView'
import { type ClipRef, type DisplayMode, type GroundMaterialChannel } from '@shared/domain/scene'
import { NOTHING_ISOLATED, type Isolation } from '@/engines/scene/isolation'
import { NOTHING_SNAPPED, snappingToggled, type SnapKind, type Snapping } from '@shared/domain/snap'
import type { ProjectionKind } from '@/engines/viewport/ViewportEngine'

/**
 * What the engine needs to watch a block, plus the very block the animations panel laid to watch
 * it — `laid` only when that panel is the one that laid it, and the engine never reads it.
 *
 * In the SAME object rather than beside it, so nothing can drop one half: `setPlayhead` and
 * `setPlaying` end a preview by writing `null`, and an ownership that outlived that write would
 * hand back the very block an interruption is meant to keep. Held as the REF and compared by
 * identity, so a block the band has since moved or trimmed is work, no longer a try.
 */
export type WatchedPreview = PreviewWatch & { laid?: ClipRef }

export type ArmedWorld =
  | { kind: 'relief'; id: string; editId: string | null; materialChannel?: GroundMaterialChannel }
  | { kind: 'scatter'; id: string; materialChannel?: GroundMaterialChannel }
  | null

export type SceneView = {
  projection: ProjectionKind
  /** Whether transform handles use the selected object's axes rather than the world's. */
  localFrame: boolean
  /**
   * One mode per view, main one first. A list rather than a single value: in a quad layout each
   * view answers for itself — wireframe on top while the flown one stays shaded is the whole
   * point of four views.
   */
  displays: readonly DisplayMode[]
  /** Whether the bones of every rigged model are drawn over it. Off, like every other overlay. */
  skeletons: boolean
  /** Whether a click picks a bone rather than a mesh. Exclusive on purpose — see the renderer. */
  poseMode: boolean
  /** Whether a drag sculpts the armed relief. Exclusive of `poseMode`. Not a `TransformMode`. */
  sculptMode: boolean
  sculptTool: SculptTool
  sculptRadius: number
  sculptFalloff: number
  sculptAmount: number
  /** The bone the pose mode picked, which the gizmo holds. Never a node — see `TrackTarget`. */
  pickedBone: { nodeId: string; bone: string } | null
  /** The World panel's armed layer. Session, like `pickedBone`: not the document, not undone. */
  armedWorld: ArmedWorld
  /** Relief half of `armedWorld`, which the sculpt engine still reads by terrainId. */
  armedRelief: { terrainId: string; editId: string | null } | null
  /** The control point or tangent of a rail the gizmo holds. Never a node — see `PathDescriptor`. */
  pickedPathPoint: PickedPathPoint | null
  /** Four views instead of one — top, front, left, and the one being flown. */
  quad: boolean
  /** Whether the wireframe drops its triangulation diagonals. Never real quads — see the engine. */
  quadEdges: boolean
  /**
   * Which snaps a drag obeys. HOW COARSE their steps are is a preference of the person; whether
   * each applies at all is a way of working on this document at this moment.
   *
   * Here rather than in the viewport's own state because three surfaces toggle them — the snap
   * bar, the toolbar and the Environment panel — and a `useState` inside the viewport is
   * unreachable from a dock.
   */
  snapping: Snapping
  /** What the master switch gives back, so one press of it undoes the other. Never shown. */
  snapMemory: Snapping
  /**
   * What the VIEWPORT is hiding — an isolation, and nodes hidden by hand.
   *
   * Session state and nothing else: `SceneNode.visible` is the document's own answer, saved and
   * undone, and leaving an isolation must give back exactly what went in. See `isolation.ts`.
   */
  isolation: Isolation
  /**
   * How big the camera preview is drawn. It opens by itself on a camera being selected and
   * closes with that selection, so there is no third value: what it shows is never a question.
   */
  previewSize: 'inset' | 'full'
  /**
   * How far the preview has been dragged from the corner it opens in, in CSS pixels. Session
   * state like the rest: where somebody pushed a window aside to see under it is not the scene.
   */
  previewOffset: { x: number; y: number }
  /** What each of the four views shows. Only a free one turns — see `PaneView`. */
  panes: readonly PaneView[]
  /**
   * Which of the four the pointer last settled in. Held here rather than read off the engine:
   * a panel that asked the engine during its render was never told when the answer changed, and
   * wrote a display mode into the pane the hand had already left.
   */
  activePane: number
  /** Where the animation head stands, in microseconds. Never in the document — see `AnimationTimeline`. */
  playhead: Us
  /**
   * Whether the head runs on. The ONE clock of a scene: the inspector's play button writes here
   * too, so a clip watched in the viewport and the band under it can never disagree.
   */
  playing: boolean
  /**
   * The block being watched on its own clock, by node and by block id, or nothing.
   *
   * Deliberately NOT the head: watching one animation is a look at a block, not a move of the
   * scene's clock, and the band must stay where it was left. Moving the head drops it — two
   * clocks driving one model is the one thing that would make a render disagree with the screen.
   */
  preview: WatchedPreview | null
  /**
   * Where the free camera of the 3D tab stands, published once a drag of it settles.
   *
   * It is here so a MONTAGE can look through it: a scene with no camera of its own is drawn
   * from what the person building it is looking at, which is the one framing they have actually
   * chosen. Null until that tab has been opened and moved — the montage then frames the
   * contents by itself.
   *
   * Session state like the rest of this view, so orbiting never marks a document modified and
   * ⌘Z never gives a camera move back. The price is that closing the 3D tab forgets it.
   */
  camera: CameraPlacement | null
}

const DEFAULT_SCENE_VIEW: SceneView = {
  projection: 'perspective',
  localFrame: false,
  displays: ['shaded'],
  skeletons: false,
  poseMode: false,
  sculptMode: false,
  sculptTool: 'raise',
  sculptRadius: 2,
  sculptFalloff: 0,
  sculptAmount: 0.1,
  pickedBone: null,
  armedWorld: null,
  armedRelief: null,
  pickedPathPoint: null,
  quad: false,
  quadEdges: false,
  snapping: NOTHING_SNAPPED,
  snapMemory: NOTHING_SNAPPED,
  isolation: NOTHING_ISOLATED,
  previewSize: 'inset',
  previewOffset: { x: 0, y: 0 },
  panes: DEFAULT_PANE_VIEWS,
  activePane: 0,
  playhead: 0,
  playing: false,
  preview: null,
  camera: null,
}

/**
 * How each scene document is being looked at. Session state, exactly like `canvasViews` for an
 * image: switching to an orthographic camera or to wireframe changes nothing of the scene, so it
 * is neither saved with the document nor undone by ⌘Z — which is why it is a store of its own
 * rather than a corner of `SceneState`.
 *
 * Per document, not per application: two scenes open side by side are two points of view.
 */
export type SceneViewsState = {
  views: Record<string, SceneView>
  setProjection: (documentId: string, projection: ProjectionKind) => void
  setLocalFrame: (documentId: string, localFrame: boolean) => void
  setDisplay: (documentId: string, pane: number, display: DisplayMode) => void
  setSkeletons: (documentId: string, skeletons: boolean) => void
  setPoseMode: (documentId: string, poseMode: boolean) => void
  setSculptMode: (documentId: string, sculptMode: boolean) => void
  setSculptTool: (documentId: string, sculptTool: SculptTool) => void
  setSculptRadius: (documentId: string, sculptRadius: number) => void
  setSculptFalloff: (documentId: string, sculptFalloff: number) => void
  setSculptAmount: (documentId: string, sculptAmount: number) => void
  setPickedBone: (documentId: string, pickedBone: SceneView['pickedBone']) => void
  setArmedWorld: (documentId: string, armedWorld: ArmedWorld) => void
  setArmedRelief: (documentId: string, armedRelief: SceneView['armedRelief']) => void
  setPickedPathPoint: (documentId: string, pickedPathPoint: SceneView['pickedPathPoint']) => void
  setQuad: (documentId: string, quad: boolean) => void
  setQuadEdges: (documentId: string, quadEdges: boolean) => void
  setSceneSnap: (documentId: string, kind: SnapKind, on: boolean) => void
  /** Turns every snap off, then gives back exactly what was on. What `M` and the magnet do. */
  toggleSceneSnapping: (documentId: string) => void
  setActivePane: (documentId: string, activePane: number) => void
  setSceneIsolation: (documentId: string, isolation: Isolation) => void
  setPreviewSize: (documentId: string, previewSize: SceneView['previewSize']) => void
  setPreviewOffset: (documentId: string, previewOffset: SceneView['previewOffset']) => void
  setPaneView: (documentId: string, pane: number, view: PaneView) => void
  setPlayhead: (documentId: string, playhead: Us) => void
  setPlaying: (documentId: string, playing: boolean) => void
  setPreview: (documentId: string, preview: SceneView['preview']) => void
  setCamera: (documentId: string, camera: CameraPlacement) => void
}

/** The pane addressed by surfaces that expose only one display-mode row. */
export const MAIN_SCENE_PANE = 0

const sceneViewsStore = create<SceneViewsState>()(set => ({
  views: {},

  setProjection: (documentId, projection) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), projection } },
    })),

  setLocalFrame: (documentId, localFrame) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), localFrame } },
    })),

  setDisplay: (documentId, pane, display) =>
    set(state => {
      const view = sceneViewOf(state, documentId)
      // Grown rather than indexed into: a view switched to four before anything set a mode has
      // one entry, and writing at index 3 would leave two holes reading as undefined.
      const displays = Array.from(
        { length: Math.max(view.displays.length, pane + 1) },
        (_, index) => (index === pane ? display : (view.displays[index] ?? 'shaded')),
      )
      return { views: { ...state.views, [documentId]: { ...view, displays } } }
    }),

  setSkeletons: (documentId, skeletons) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), skeletons } },
    })),

  setPoseMode: (documentId, poseMode) =>
    set(state => {
      const view = sceneViewOf(state, documentId)
      return {
        views: {
          ...state.views,
          [documentId]: {
            ...view,
            poseMode,
            sculptMode: poseMode ? false : view.sculptMode,
          },
        },
      }
    }),

  setSculptMode: (documentId, sculptMode) =>
    set(state => {
      const view = sceneViewOf(state, documentId)
      return {
        views: {
          ...state.views,
          [documentId]: {
            ...view,
            sculptMode,
            poseMode: sculptMode ? false : view.poseMode,
            pickedBone: sculptMode ? null : view.pickedBone,
          },
        },
      }
    }),

  setSculptTool: (documentId, sculptTool) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), sculptTool } },
    })),

  setSculptRadius: (documentId, sculptRadius) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), sculptRadius } },
    })),

  setSculptFalloff: (documentId, sculptFalloff) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), sculptFalloff } },
    })),

  setSculptAmount: (documentId, sculptAmount) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), sculptAmount } },
    })),

  setPickedBone: (documentId, pickedBone) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), pickedBone } },
    })),

  setArmedWorld: (documentId, armedWorld) =>
    set(state => ({
      views: {
        ...state.views,
        [documentId]: {
          ...sceneViewOf(state, documentId),
          armedWorld,
          armedRelief:
            armedWorld?.kind === 'relief'
              ? { terrainId: armedWorld.id, editId: armedWorld.editId }
              : null,
        },
      },
    })),

  setArmedRelief: (documentId, armedRelief) =>
    set(state => ({
      views: {
        ...state.views,
        [documentId]: {
          ...sceneViewOf(state, documentId),
          armedRelief,
          armedWorld: armedRelief
            ? { kind: 'relief', id: armedRelief.terrainId, editId: armedRelief.editId }
            : null,
        },
      },
    })),

  setPickedPathPoint: (documentId, pickedPathPoint) =>
    set(state => ({
      views: {
        ...state.views,
        [documentId]: { ...sceneViewOf(state, documentId), pickedPathPoint },
      },
    })),

  setQuad: (documentId, quad) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), quad } },
    })),

  setQuadEdges: (documentId, quadEdges) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), quadEdges } },
    })),

  setSceneSnap: (documentId, kind, on) =>
    set(state => {
      const view = sceneViewOf(state, documentId)
      const snapping = { ...view.snapping, [kind]: on }
      return {
        views: { ...state.views, [documentId]: { ...view, snapping, snapMemory: snapping } },
      }
    }),

  toggleSceneSnapping: documentId =>
    set(state => {
      const view = sceneViewOf(state, documentId)
      // The memory is kept as it was on the way down: what comes back up is what was last CHOSEN,
      // not the emptiness the switch itself just wrote.
      return {
        views: {
          ...state.views,
          [documentId]: { ...view, snapping: snappingToggled(view.snapping, view.snapMemory) },
        },
      }
    }),

  setActivePane: (documentId, activePane) =>
    set(state => {
      // Written on every pointer move that settles a pane: an unchanged value must not hand
      // React a new snapshot, or the inspector re-renders across the whole viewport.
      const view = sceneViewOf(state, documentId)
      if (view.activePane === activePane) return state
      return { views: { ...state.views, [documentId]: { ...view, activePane } } }
    }),

  setSceneIsolation: (documentId, isolation) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), isolation } },
    })),

  setPreviewSize: (documentId, previewSize) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), previewSize } },
    })),

  setPreviewOffset: (documentId, previewOffset) =>
    set(state => ({
      views: { ...state.views, [documentId]: { ...sceneViewOf(state, documentId), previewOffset } },
    })),

  setPaneView: (documentId, pane, view) =>
    set(state => {
      const current = sceneViewOf(state, documentId)
      const panes = current.panes.map((held, index) => (index === pane ? view : held))
      return { views: { ...state.views, [documentId]: { ...current, panes } } }
    }),

  // Moving the head drops the preview: two clocks driving one model is what makes a render
  // disagree with the screen.
  setPlayhead: (documentId, playhead) =>
    set(state => ({
      views: {
        ...state.views,
        [documentId]: { ...sceneViewOf(state, documentId), playhead, preview: null },
      },
    })),

  setPlaying: (documentId, playing) =>
    set(state => ({
      views: {
        ...state.views,
        [documentId]: { ...sceneViewOf(state, documentId), playing, preview: null },
      },
    })),

  setPreview: (documentId, preview) =>
    set(state => ({
      views: {
        ...state.views,
        [documentId]: { ...sceneViewOf(state, documentId), preview, playing: false },
      },
    })),

  setCamera: (documentId, camera) =>
    set(state => {
      // Written only when it actually moved: this lands at the end of every orbit, and a store
      // waking every reader of the scene for an identical placement would repaint the montage
      // for nothing.
      const view = sceneViewOf(state, documentId)
      if (samePlacement(view.camera, camera)) return state
      return { views: { ...state.views, [documentId]: { ...view, camera } } }
    }),
}))

export const useSceneViews = sceneViewsStore

function samePlacement(left: CameraPlacement | null, right: CameraPlacement): boolean {
  return left !== null && sameCameraView(left, right)
}

/** A document nobody has looked at yet is looked at the default way. */
export function sceneViewOf(state: SceneViewsState, documentId: string): SceneView {
  return state.views[documentId] ?? DEFAULT_SCENE_VIEW
}

/**
 * Narrowed here rather than at each call site: subscribing to the whole view redraws a header on a
 * camera dragged in another pane.
 */
export function useScenePlayhead(documentId: string): Us {
  return useSceneViews(state => sceneViewOf(state, documentId).playhead)
}

/**
 * The head SNAPPED, quantised in the selector as `LevelMeter` quantises its own reading: playback
 * runs the head on the wall clock, and a surface that only ever shows frames must not wake
 * between two of them.
 */
export function useSceneFrameHead(documentId: string, fps: number): Us {
  return useSceneViews(state => snapToFrame(sceneViewOf(state, documentId).playhead, fps))
}

export function useScenePreview(documentId: string): WatchedPreview | null {
  return useSceneViews(state => sceneViewOf(state, documentId).preview)
}
