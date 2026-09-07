import {
  mdiAlertCircleOutline,
  mdiChatOutline,
  mdiBookOpenPageVariantOutline,
  mdiCreationOutline,
  mdiFileTreeOutline,
  mdiFolderMultipleOutline,
  mdiFolderOutline,
  mdiFormatText,
  mdiHistory,
  mdiImageMultipleOutline,
  mdiLayersOutline,
  mdiTerrain,
  mdiSourceBranch,
  mdiTuneVariant,
  mdiVideoVintage,
  mdiViewDashboardOutline,
} from '@mdi/js'
import {
  placementIn,
  serves,
  TOOL_PLACEMENTS,
  type ToolId,
  type ToolPlacement,
  type ToolSlot,
  type ToolSurface,
  type ToolZone,
} from '@shared/domain/tool'
import { gitHoldsFolder } from '@shared/domain/git'
import { NODE_KINDS } from '@/engines/scene/nodeKinds'
import type { DocumentKind } from '@shared/domain/document'
import { accountsHoldLibrary, useAccounts } from '@/stores/accounts'
import { useDocuments } from '@/stores/documents'
import { useGit } from '@/stores/git'
import { homeIsVisible } from '@/stores/layouts'
import { useProject } from '@/stores/project'

export type Tool = {
  id: ToolId
  icon: string
  zone: ToolZone
  slot: ToolSlot
  surfaces: readonly ToolSurface[]
  /** What the studio must hold for this placement to be offered — see `ToolPlacement.requires`. */
  requires?: ToolPlacement['requires']
  solo?: true
  /** What the zone opens at while this panel leads it — see `ToolPlacement.opens`. */
  opens?: number
}

const ICONS: Record<ToolId, string> = {
  // The same glyph the title bar wore until the assistant became a panel of its own.
  assistant: mdiChatOutline,
  layers: mdiLayersOutline,
  world: mdiTerrain,
  // From the scene registry: the rail icon and the panel's own empty state must not drift.
  meshes: NODE_KINDS.mesh.icon,
  lights: NODE_KINDS.light.icon,
  timeline: mdiVideoVintage,
  explorer: mdiFolderOutline,
  // The fork every version tool draws, and the one glyph nobody mistakes for a folder.
  git: mdiSourceBranch,
  // The same subject read as a line of time, which is what the band holds — and a glyph that is
  // neither the fork above it nor the film reel the montage wears.
  history: mdiHistory,
  scene: mdiFileTreeOutline,
  guiTree: mdiViewDashboardOutline,
  generator: mdiCreationOutline,
  inspector: mdiTuneVariant,
  assets: mdiImageMultipleOutline,
  // The home's own. `mdiFolderOutline` is the Explorer's and `mdiCreationOutline` the
  // generator's: a rail where two glyphs mean two things is a rail one reads twice.
  projects: mdiFolderMultipleOutline,
  text: mdiFormatText,
  // An open book: what the project SAYS about itself, beside the folder that holds it and
  // the fork that tracks it. Neither of those two, and neither the sparkle of a generation.
  context: mdiBookOpenPageVariantOutline,
  // What the compiler had to say, and the rail already spends its braces on the Code space.
  problems: mdiAlertCircleOutline,
}

/**
 * Tool windows, IDE-style: they live on the edges, one per half of a zone at a time, and are
 * picked from the icon rail. Only the center carries tabs — those are documents, and a document has
 * a name; a tool has an icon.
 *
 * Placements come from the shared registry; this module only adds what needs `@mdi/js`.
 */
export const TOOLS: readonly Tool[] = TOOL_PLACEMENTS.map(placement => ({
  ...placement,
  icon: ICONS[placement.id],
}))

/** i18n key of a tool's title — never the displayed text. */
export function toolTitleKey(id: ToolId): string {
  return `panels.${id}`
}

/**
 * A tool's glyph, for the panel itself rather than for the rail.
 *
 * Exported so an empty state can wear the icon its rail button wears: the two drifting apart is
 * what `meshes` reading `NODE_KINDS.mesh.icon` above already guards against, one panel at a time.
 */
export function toolIcon(id: ToolId): string {
  return ICONS[id]
}

/** The answers the shared registry cannot give: they depend on state, which `shared/` cannot read. */
export function toolStateOf(): ToolState {
  const documents = useDocuments.getState()

  return {
    hasProject: useProject.getState().project !== null,
    hasGit: gitHoldsFolder(useGit.getState().repository),
    hasCloud: accountsHoldLibrary(useAccounts.getState()),
    centreTaken: homeIsVisible() || Object.keys(documents.documents).length > 0,
    documentKind: documents.activeId
      ? (documents.documents[documents.activeId]?.kind ?? null)
      : null,
  }
}

/** What a surface can offer beyond what the registry declares, each rule answered from a store. */
export type ToolState = {
  /** A project folder open, which is what the Explorer reads. */
  hasProject: boolean
  /**
   * The centre holding anything but the conversation — a document, or the home page, which has
   * no Dockview at all. False means the empty centre is staging the thread itself.
   */
  centreTaken: boolean
  /** The document tool panels act on, or none while the centre is empty. */
  documentKind: DocumentKind | null
  /** Git holding the project folder, so there are versions to read. Kept honest by the shell. */
  hasGit: boolean
  /**
   * A key opening onto a remote library — see `accountsHoldLibrary`. Read off the account LIST
   * and never off `auth.authenticated`, which is the answer to a network round trip: an icon
   * keyed on that one would be absent for the first second of every launch.
   */
  hasCloud: boolean
}

/**
 * Whether the studio holds what a placement asks for. WHAT it asks for is declared beside it, in
 * the registry; this only answers whether the studio has it — passed in, never looked up again,
 * since every caller has already matched the placement it is asking about.
 */
function meets(requires: ToolPlacement['requires'], state: ToolState): boolean {
  if (requires === 'project') return state.hasProject
  // `git` implies `project`, and the conjunction is not redundant: the repository is corrected
  // asynchronously, so a project just closed still reads `ready` until the next status lands.
  if (requires === 'git') return state.hasProject && state.hasGit
  if (requires === 'cloud') return state.hasCloud
  if (requires === 'centreTaken') return state.centreTaken
  if (requires === 'sceneContents')
    return state.documentKind === 'scene' || state.documentKind === 'character'
  if (requires === 'sceneDocument') return state.documentKind === 'scene'
  if (requires === 'guiDocument') return state.documentKind === 'gui'
  return true
}

/** Where the panel sits on this surface, or `null` where it is not on offer right now. */
export function offeredPlacement(
  id: ToolId,
  surface: ToolSurface,
  state: ToolState,
): ToolPlacement | null {
  const placement = placementIn(id, surface)
  return placement && meets(placement.requires, state) ? placement : null
}

/**
 * The same answer as ids, read off the stores: what the native menu is told, since it lives in
 * the main process and cannot subscribe.
 */
export function availableToolIds(surface: ToolSurface): ToolId[] {
  return toolsOffered(surface, toolStateOf()).map(tool => tool.id)
}

/**
 * Every panel this surface can offer right now, in declaration order — the order the rail stacks
 * them in and the order a half falls back through. The chassis is DECLARED this list and places it.
 */
export function toolsOffered(surface: ToolSurface, state: ToolState): Tool[] {
  return TOOLS.filter(tool => serves(tool, surface) && meets(tool.requires, state))
}
