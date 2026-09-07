import {
  mdiCodeBraces,
  mdiCubeScan,
  mdiCubeOutline,
  mdiGamepadVariantOutline,
  mdiImageOutline,
  mdiPanoramaVariantOutline,
  mdiRun,
  mdiTextureBox,
  mdiVectorTriangle,
  mdiVideoOutline,
  mdiViewDashboardOutline,
  mdiVolumeHigh,
} from '@mdi/js'
import { ASSET_TYPES, type AssetType } from '@shared/domain/asset'
import { workspaceOfType } from '@shared/domain/assetKind'
import type { FileDomain } from '@shared/domain/fileRole'
import { WORKSPACE_BY_ROLE, type FolderRole } from '@shared/domain/folderRole'
import { type ModelFamily } from '@shared/domain/model'
import { HOME_SURFACE, type ToolSurface } from '@shared/domain/tool'
import {
  FAMILY_BY_WORKSPACE,
  WORKSPACE_IDS,
  workspaceOrder,
  type WorkspaceId,
} from '@shared/domain/workspace'

export type Workspace = {
  id: WorkspaceId
  icon: string
  /**
   * The model family the generator offers in this workspace, and files its choice under.
   *
   * `null` for a space that generates nothing — none does today, Code having gained `code`. The
   * shape stays sayable: see `FAMILY_BY_WORKSPACE`, which owns the table.
   */
  family: ModelFamily | null
}

const ICONS: Record<WorkspaceId, string> = {
  image: mdiImageOutline,
  video: mdiVideoOutline,
  '3d': mdiCubeOutline,
  code: mdiCodeBraces,
  audio: mdiVolumeHigh,
  materials: mdiTextureBox,
  skyboxes: mdiPanoramaVariantOutline,
}

/**
 * Which workspace an asset belongs to. `Record` both ways, so a new kind or a new workspace is
 * a compile error rather than an asset drawn under the wrong glyph.
 */
// Re-exported so the panels keep one import for everything workspace-shaped, while the table
// itself lives in `shared/` — the main process names shelves from it too.
export { workspaceOfType }

/**
 * A glyph of its own, or `null` to keep the one its workspace draws.
 *
 * Total on purpose: the moment two kinds share a space the workspace table stops telling them
 * apart — a motion and a character both live in 3D — so a new kind has to answer the question
 * rather than silently inherit a neighbour's cube.
 */
const OWN_ICON: Record<AssetType, string | null> = {
  image: null,
  video: null,
  audio: null,
  mesh: null,
  skybox: null,
  animation: mdiRun,
}

/**
 * What stands for an asset when there is no picture to show it by. Read off the workspace table
 * rather than relisted: changing the video glyph in the rail must change it on the tiles too.
 */
export function assetIcon(type: AssetType): string {
  return OWN_ICON[type] ?? ICONS[workspaceOfType(type)]
}

/**
 * A glyph of its own, or `null` to keep its section's — the shape `OWN_ICON` has, for the same
 * reason: four roles answer `3d`, and one cube on all four would say they are one shelf.
 */
const OWN_ROLE_ICON: Record<FolderRole, string | null> = {
  image: null,
  video: null,
  audio: null,
  materials: null,
  skyboxes: null,
  code: null,
  modelling: null,
  scenes: mdiCubeScan,
  models: mdiVectorTriangle,
  // The same runner an animation ASSET wears: two glyphs for one idea, in one panel, is what
  // relisting the table produced the first time.
  animations: assetIcon('animation'),
  // A glyph of its own though it serves 3D: an interface sits at the TOP of the project, and
  // wearing the section's cube would file it under what is modelled.
  gui: mdiViewDashboardOutline,
  input: mdiGamepadVariantOutline,
}

/**
 * The ink a section's glyph wears — one hue per section, so a listing is read by colour before it
 * is read by shape. `index.css` measures them; nothing here holds a value.
 */
const DOMAIN_INK: Record<WorkspaceId, string> = {
  image: 'text-domain-image',
  video: 'text-domain-video',
  '3d': 'text-domain-3d',
  code: 'text-domain-code',
  audio: 'text-domain-audio',
  materials: 'text-domain-materials',
  skyboxes: 'text-domain-skyboxes',
}

/** What a workspace's glyph is inked in — its four folder roles share it, being one section. */
export function workspaceInk(workspace: WorkspaceId): string {
  return DOMAIN_INK[workspace]
}

/** What a folder serving a section is inked in. */
export function roleInk(role: FolderRole): string {
  return DOMAIN_INK[WORKSPACE_BY_ROLE[role]]
}

/**
 * What a FILE is inked in, by what it is. Nothing for `other`: a stray beside the work is not of
 * a section, and inking it would promise a belonging the catalogue never claimed.
 */
export function domainInk(domain: FileDomain): string | undefined {
  if (domain === 'other') return undefined

  return domain === 'material' ? DOMAIN_INK.materials : DOMAIN_INK[workspaceOfType(domain)]
}

/** What stands for a folder serving a section. Read off the workspace table, never relisted. */
export function roleIcon(role: FolderRole): string {
  return OWN_ROLE_ICON[role] ?? ICONS[WORKSPACE_BY_ROLE[role]]
}

/**
 * Which line names this role — the seven that ARE their section share one, filled with the
 * section's label. Total rather than a test on the id: a role with no answer would compose a key
 * nothing translates, and a raw key on screen is this repository's costliest defect.
 */
const ROLE_LABEL: Record<
  FolderRole,
  'section' | 'scenes' | 'models' | 'animations' | 'gui' | 'input'
> = {
  image: 'section',
  video: 'section',
  audio: 'section',
  materials: 'section',
  skyboxes: 'section',
  code: 'section',
  modelling: 'section',
  scenes: 'scenes',
  models: 'models',
  animations: 'animations',
  // Its own line rather than the section's: this folder is not under Modelling, so « folder of
  // the 3D section » would send whoever reads it looking in the wrong place.
  gui: 'gui',
  input: 'input',
}

export function roleLabelKey(role: FolderRole): string {
  return `folderRoles.${ROLE_LABEL[role]}`
}

/**
 * What each space has any use for — which is not the reverse of the table above.
 *
 * A space consumes more than it produces: the 3D one takes materials and skies as much as
 * meshes, and the material one is fed by ordinary pictures. Video takes everything, because a
 * montage is where the others end up.
 *
 * This is what keeps takes out of the way while painting, without hiding anything that space
 * could actually accept — the shelf offers a way back to everything.
 */
const USED_BY_WORKSPACE: Record<WorkspaceId, readonly AssetType[]> = {
  image: ['image', 'skybox'],
  video: ASSET_TYPES,
  '3d': ['mesh', 'animation', 'skybox', 'image'],
  // Nothing: a script takes no asset, and it names the ones it wants by id in its own text.
  code: [],
  audio: ['audio'],
  materials: ['image'],
  skyboxes: ['skybox', 'image'],
}

export function assetTypesOf(workspace: WorkspaceId): readonly AssetType[] {
  return USED_BY_WORKSPACE[workspace]
}

/**
 * The one kind a space takes, where it takes only one — `null` otherwise.
 *
 * What `typeOfWorkspace` answered for Materials until a channel stopped being a kind of its own.
 * Without it the shelf keeps whichever Type the previous space posed: arriving from 3D, Materials
 * listed meshes.
 */
export function soleTypeOf(workspace: WorkspaceId): AssetType | null {
  const used = USED_BY_WORKSPACE[workspace]

  return used.length === 1 ? (used[0] ?? null) : null
}

/**
 * Derived from the shared registry rather than relisted, the way `toolRegistry.ts` derives
 * from `TOOL_PLACEMENTS`: a new workspace is then declared once, and the compiler demands its
 * icon and its family instead of letting the list drift. Its LABEL it does not demand — that
 * one is guarded by `dynamic-keys.i18n.test.ts`.
 */
export const WORKSPACES: readonly Workspace[] = WORKSPACE_IDS.map(id => ({
  id,
  icon: ICONS[id],
  family: FAMILY_BY_WORKSPACE[id],
}))

/**
 * The same workspaces, in the order the user arranged. Both surfaces that draw the bar read
 * through here rather than mapping `WORKSPACES` themselves: the title bar and the home's tools
 * showed the same list, and reordering one of them alone would leave two truths on one screen.
 */
export function workspacesIn(stored: readonly WorkspaceId[]): Workspace[] {
  return workspaceOrder(stored).map(id => workspaceById(id))
}

/** i18n key of a workspace label — the label is never hardcoded. */
export function workspaceLabelKey(id: WorkspaceId): string {
  return `workspaces.${id}`
}

/**
 * Takes a plain string: the id may come from a persisted layout or from IPC, which is
 * exactly the case this function exists to reject.
 */
export function workspaceById(id: string): Workspace {
  const workspace = WORKSPACES.find(candidate => candidate.id === id)
  if (!workspace) throw new Error(`Unknown workspace: ${id}`)
  return workspace
}

/**
 * What a surface browses models by, or `null` where nothing generates — the home, which opens
 * documents and makes none, and Code, which runs no model at all.
 *
 * Written once because two readers ask it — the rail deciding whether to draw the generator, and
 * the edit that sends the user off to pick a model — and a second spelling is a second answer.
 */
export function familyOfSurface(surface: ToolSurface): ModelFamily | null {
  return surface === HOME_SURFACE ? null : workspaceById(surface).family
}
