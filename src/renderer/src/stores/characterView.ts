import { create } from 'zustand'
import type { BoneAxis } from '@/engines/character/boneRest'
import type { TransformMode } from '@/engines/scene/gizmoTarget'
import type { MeshSample } from '@/engines/scene/rigSnap'

/**
 * What is picked and how it is being handled in one character's tab. Outside the character for
 * the reason a scene's view is outside its document: picking is not an edit, and has no business
 * on the undo stack.
 */
export type CharacterView = {
  /** A bone has no id — it is addressed by name, like every track that drives one. */
  pickedBone: string | null
  /**
   * What the gizmo does to the joint that is picked. Opens on `translate`: a skeleton read off a
   * bounding box lands each joint near enough, and placing them is the first thing a hand does.
   */
  mode: TransformMode
  /**
   * The axes a joint is held still on, while one is being placed. Session state like the pick:
   * a hold is how a hand moves a knee straight down without letting it drift forward, and it is
   * not a property of the skeleton.
   */
  heldAxes: readonly BoneAxis[]
  /**
   * Whether the gizmo edits the SKELETON rather than manipulating the character. Off by default:
   * a character is opened to be made to move, and the mesh follows a bone that is posed.
   */
  editingRest: boolean
  /**
   * What the engine measured of the mesh, for the rigger that fits itself to it — and `null`
   * until the file has landed. Read by the inspector, which the dock mounts OUTSIDE the tab
   * holding the engine.
   */
  sample: MeshSample | null
  /**
   * The weight given to each morph target, by name — a PREVIEW of the session, like a pose:
   * nothing writes it into the file until a save recomposes the model.
   */
  morphs: Readonly<Record<string, number>>
}

const DEFAULT_CHARACTER_VIEW: CharacterView = {
  pickedBone: null,
  mode: 'translate',
  heldAxes: [],
  editingRest: false,
  sample: null,
  morphs: {},
}

type CharacterViewsState = {
  /** Keyed by ASSET and not by document: the tab edits a model's own file, and two tabs on one
   * model would be two answers about the joint in hand. */
  views: Record<string, CharacterView>
  pickBone: (assetId: string, bone: string | null) => void
  setCharacterMode: (assetId: string, mode: TransformMode) => void
  holdCharacterAxis: (assetId: string, axis: BoneAxis, held: boolean) => void
  editCharacterRest: (assetId: string, editing: boolean) => void
  noteCharacterSample: (assetId: string, sample: MeshSample | null) => void
  setCharacterMorph: (assetId: string, name: string, value: number) => void
  forgetCharacterView: (assetId: string) => void
}

export function characterViewOf(
  state: Pick<CharacterViewsState, 'views'>,
  assetId: string,
): CharacterView {
  return state.views[assetId] ?? DEFAULT_CHARACTER_VIEW
}

export const useCharacterView = create<CharacterViewsState>()(set => ({
  views: {},

  pickBone: (assetId, pickedBone) => set(state => written(state, assetId, () => ({ pickedBone }))),

  setCharacterMode: (assetId, mode) => set(state => written(state, assetId, () => ({ mode }))),

  editCharacterRest: (assetId, editingRest) =>
    set(state => written(state, assetId, () => ({ editingRest }))),

  holdCharacterAxis: (assetId, axis, held) =>
    set(state =>
      written(state, assetId, view => ({
        heldAxes: held
          ? [...new Set([...view.heldAxes, axis])]
          : view.heldAxes.filter(one => one !== axis),
      })),
    ),

  noteCharacterSample: (assetId, sample) =>
    set(state => written(state, assetId, () => ({ sample }))),

  setCharacterMorph: (assetId, name, value) =>
    set(state =>
      written(state, assetId, view =>
        view.morphs[name] === value ? {} : { morphs: { ...view.morphs, [name]: value } },
      ),
    ),

  forgetCharacterView: assetId =>
    set(state => {
      const { [assetId]: gone, ...left } = state.views
      return gone ? { views: left } : state
    }),
}))

/**
 * One view rewritten, the rest of the map left alone — and the state itself left alone when the
 * edit changed nothing: a pick repeated on the bone already held redrew every panel reading it.
 */
function written(
  state: Pick<CharacterViewsState, 'views'>,
  assetId: string,
  edit: (view: CharacterView) => Partial<CharacterView>,
): Pick<CharacterViewsState, 'views'> {
  const held = characterViewOf(state, assetId)
  const next = { ...held, ...edit(held) }
  const settled = KEYS.every(key => next[key] === held[key])
  return settled && state.views[assetId] ? state : { views: { ...state.views, [assetId]: next } }
}

const KEYS: readonly (keyof CharacterView)[] = [
  'pickedBone',
  'mode',
  'heldAxes',
  'editingRest',
  'sample',
  'morphs',
]
