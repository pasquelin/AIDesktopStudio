import {
  mdiAccountOutline,
  mdiCubeScan,
  mdiFolderOutline,
  mdiFormatText,
  mdiHumanMale,
  mdiImageOutline,
  mdiLightbulbOutline,
  mdiShapeOutline,
  mdiShapePlusOutline,
  mdiVectorDifference,
  mdiVectorPolyline,
  mdiVideoOutline,
} from '@mdi/js'
import { OBJECT_ENTRIES, type ObjectKind } from '@shared/domain/scene'
import { FIGURE_TYPES } from './figures'
import { LIGHT_TYPES } from './lightTypes'
import { MESH_PRIMITIVES } from './meshPrimitives'
import type { SceneNodeType } from './sceneState'

/** What an add menu needs of a registry entry — the two registries agree on exactly this. */
export type AddEntry = {
  kind: string
  icon: string
  disabled?: boolean
}

export type NodeKind = {
  icon: string
  entries: readonly AddEntry[]
  /** i18n namespace. Both halves declare the same leaves, so every key is derived from it. */
  namespace: string
}

/**
 * The kinds a panel is built for. A model is not one — it arrives from the project's assets —
 * and neither is a group, which is made by grouping a selection rather than picked from a menu.
 * Everything here is read by a panel, its title bar and its flyout: what those two have none of.
 *
 * A sprite and a text are picked from a menu like a mesh, but neither is a family: a panel
 * listing the sprites of a scene would be a panel of one row and one Add button.
 */
export type PanelNodeType = Exclude<
  SceneNodeType,
  'model' | 'sprite' | 'text' | 'group' | 'camera' | 'path' | 'carved'
>

/**
 * What tells a mesh from a light, everywhere: the rail icon, the panels, the toolbar's Add
 * flyout and the empty states all read this.
 */
export const NODE_KINDS: Record<PanelNodeType, NodeKind> = {
  mesh: { icon: mdiShapeOutline, entries: MESH_PRIMITIVES, namespace: 'meshes' },
  light: { icon: mdiLightbulbOutline, entries: LIGHT_TYPES, namespace: 'lights' },
}

/** A solid is made by cutting a selection, never picked from a menu — like a group. */
export const CARVED_ICON = mdiVectorDifference

const OBJECT_ICONS: Record<ObjectKind, string> = {
  sprite: mdiImageOutline,
  text: mdiFormatText,
  camera: mdiVideoOutline,
  path: mdiVectorPolyline,
  player: mdiAccountOutline,
}

/** The glyphs of the kinds no registry describes, since neither is picked from a menu. */
export const MODEL_ICON = mdiCubeScan
export const CAMERA_ICON = OBJECT_ICONS.camera
export const GROUP_ICON = mdiFolderOutline
export const SPRITE_ICON = OBJECT_ICONS.sprite
export const TEXT_ICON = OBJECT_ICONS.text
export const PATH_ICON = OBJECT_ICONS.path
export const PLAYER_ICON = OBJECT_ICONS.player

/** i18n key of what a kind is called. */
export function labelKeyOf(namespace: string, entry: AddEntry): string {
  return `${namespace}.${entry.kind}`
}

/**
 * The families a scene grows by, each with the glyph its button wears. The two with a panel come
 * from `NODE_KINDS`; the figures and the objects have none — see `PanelNodeType`.
 */
export const ADD_FAMILIES: readonly NodeKind[] = [
  ...Object.values(NODE_KINDS),
  { icon: mdiHumanMale, entries: FIGURE_TYPES, namespace: 'figures' },
  {
    icon: mdiShapePlusOutline,
    entries: OBJECT_ENTRIES.map(entry => ({ ...entry, icon: OBJECT_ICONS[entry.kind] })),
    namespace: 'objects',
  },
]

/** Everything a scene can hold, flat, in the order the registries declare. */
export const ADD_ENTRIES: readonly { entry: AddEntry; labelKey: string }[] = ADD_FAMILIES.flatMap(
  ({ entries, namespace }) =>
    entries.map(entry => ({ entry, labelKey: labelKeyOf(namespace, entry) })),
)
