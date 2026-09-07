import { isMadeFromNothing, kindsForWorkspace, type DocumentKind } from './document'
import { HOME_SURFACE, type ToolSurface } from './tool'
import { WORKSPACE_IDS, type WorkspaceId } from './workspace'

/**
 * One thing the studio can make, and the space it is made in.
 *
 * The pair rather than the kind alone: a caller has to switch the window to that space before the
 * document lands in it, and `workspaceForKind` searching for it again on every row is a second
 * answer waiting to disagree with this one.
 */
export type Creatable = { kind: DocumentKind; workspace: WorkspaceId }

/**
 * Everything the studio can make, in the order the rail lays the spaces out.
 *
 * DERIVED from the workspace table, never relisted. Relisting is what made `gui` unreachable: the
 * New button read only the HEAD of each space's kinds, so the 3D space could make a scene and
 * nothing else, and no test could see it — eight kinds, seven ways in, everything green.
 */
export const CREATABLES: readonly Creatable[] = WORKSPACE_IDS.flatMap(workspace =>
  // 🛑 Filtered on a table of the domain, never on a list written here: what a space OPENS and
  // what it can make from nothing are two questions, and a character answers no to the second.
  kindsForWorkspace(workspace)
    .filter(isMadeFromNothing)
    .map(kind => ({ kind, workspace })),
)

/**
 * Which spaces a space is CLOSE to, nearest first — what one reaches for next while working here.
 *
 * A judgement, not a derivation: nothing in the domain says a material is nearer to modelling
 * than a montage is. Each row is the other six, so the compiler cannot say it is complete —
 * `creatable.test.ts` does, holding every row against `WORKSPACE_IDS`.
 */
export const AFFINITY_BY_WORKSPACE: Record<WorkspaceId, readonly WorkspaceId[]> = {
  image: ['materials', 'skyboxes', '3d', 'video', 'audio', 'code'],
  video: ['image', 'audio', '3d', 'materials', 'skyboxes', 'code'],
  '3d': ['materials', 'skyboxes', 'image', 'code', 'video', 'audio'],
  code: ['3d', 'image', 'video', 'audio', 'materials', 'skyboxes'],
  audio: ['video', 'image', '3d', 'materials', 'skyboxes', 'code'],
  materials: ['image', '3d', 'skyboxes', 'video', 'audio', 'code'],
  skyboxes: ['image', '3d', 'materials', 'video', 'audio', 'code'],
}

/**
 * What to offer someone standing on this surface, likeliest first: what this space makes, then
 * what its neighbours make, then the rest in the order of the rail.
 *
 * ALL of them, always — the order is a courtesy, never a filter. A list that dropped the far
 * spaces would put the studio back where this lot found it, with the gesture depending on the
 * screen one happens to be looking at.
 *
 * The home and an unknown surface take the rail's own order: the home makes no document of its
 * own, so it has no space to bring forward.
 */
export function creatablesFor(surface: ToolSurface | null): readonly Creatable[] {
  if (surface === null || surface === HOME_SURFACE) return CREATABLES

  const order = [surface, ...AFFINITY_BY_WORKSPACE[surface]]
  return order.flatMap(workspace =>
    CREATABLES.filter(creatable => creatable.workspace === workspace),
  )
}
