import { lazy } from 'react'
import type { ToolId } from '@shared/domain/tool'
import type { ToolDefinition } from '@/features/shell/definition'

/**
 * What the title row must know before the panel's chunk arrives — the header lays itself out on
 * the first paint, and a separator turning up a frame later would shift a row already on screen.
 * `'fill-actions'` additionally takes the row's free width in a band.
 */
type HeaderRole = 'actions' | 'fill-actions'

type ToolEntry = {
  load: () => Promise<{ definition: ToolDefinition }>
  role: HeaderRole | null
}

/**
 * Every panel: the module it lives in, and what its header does. Exported so
 * `toolComponents.test.ts` can resolve each specifier — a specifier written beside a key is a
 * second copy of the panel's name, and `layers` naming the meshes module would swap the two in
 * silence. `import()` takes a literal, so the copy stays. That test holds this column and the
 * header roles; what `panel()` then wires them to is only covered where a panel is rendered.
 *
 * A glob keyed on the folder would remove that copy, and was written before being put back:
 * `eager-graph.test.ts` walks STATIC imports, so a glob is invisible to it — the guard that
 * watches this very property would have stayed green whatever the glob did to the entry chunk.
 */
export const TOOL_ENTRIES: Record<ToolId, ToolEntry> = {
  assistant: { load: () => import('@/features/assistant/tools/assistant'), role: 'actions' },
  layers: { load: () => import('@/features/image/tools/layers'), role: 'actions' },
  world: { load: () => import('@/features/scene/tools/world'), role: 'actions' },
  meshes: { load: () => import('@/features/scene/tools/meshes'), role: 'actions' },
  lights: { load: () => import('@/features/scene/tools/lights'), role: 'actions' },
  timeline: { load: () => import('@/features/timeline/tools/timeline'), role: 'fill-actions' },
  explorer: { load: () => import('@/features/explorer/tools/explorer'), role: 'actions' },
  git: { load: () => import('@/features/git/tools/git'), role: 'actions' },
  history: { load: () => import('@/features/git/tools/history'), role: 'actions' },
  scene: { load: () => import('@/features/scene/tools/scene'), role: 'actions' },
  guiTree: { load: () => import('@/features/gui/tools/guiTree'), role: null },
  generator: { load: () => import('@/features/generation/tools/generator'), role: null },
  inspector: { load: () => import('@/features/shell/tools/inspector'), role: 'actions' },
  assets: { load: () => import('@/features/assets/tools/assets'), role: 'actions' },
  projects: { load: () => import('@/features/project/tools/projects'), role: null },
  text: { load: () => import('@/features/image/tools/text'), role: null },
  context: { load: () => import('@/features/context/tools/context'), role: 'actions' },
  problems: { load: () => import('@/features/code/tools/problems'), role: null },
}

/**
 * Whether a panel publishes anything on its title row — answered from the table, so the shell
 * can ask before the panel's chunk has arrived. The header lays itself out on the first paint.
 */
export function hasActions(id: ToolId): boolean {
  return TOOL_ENTRIES[id].role !== null
}

/**
 * Whether its actions take the row's free width. Only the montage asks for it: a transport is a
 * whole bar, where a band holding a list with two buttons wants them at the end — which is what
 * the chassis gives every panel of a horizontal zone otherwise.
 */
export function fillsActions(id: ToolId): boolean {
  return TOOL_ENTRIES[id].role === 'fill-actions'
}

/** A panel that publishes no actions still needs something for `lazy` to resolve to. */
const NoActions = () => null

function panel({ load, role }: ToolEntry): ToolDefinition {
  return {
    Content: lazy(async () => ({ default: (await load()).definition.Content })),
    // One `import()` for both halves: the module resolves once, and the second `lazy` reads it
    // from the module cache rather than asking for the chunk again.
    Actions:
      role === null
        ? undefined
        : lazy(async () => ({ default: (await load()).definition.Actions ?? NoActions })),
  }
}

/**
 * Held rather than rebuilt: `lazy()` gives a fresh component every call, and a panel handed a
 * new one on each render would remount — losing its scroll, its selection and whatever was
 * being typed in it — on every frame of a zone drag.
 */
const HELD = new Map<ToolId, ToolDefinition>()

/**
 * What a tool draws, loaded on demand. The home screen opens ONE panel, and importing them all
 * outright held `engines/`, four helpers of the editors' folders and the usage formatter in the
 * chunk the splash screen waits for: first screen 2 331 395 → 2 081 385 bytes, −250 010,
 * −10,7 %, measured at equal commit with the preloads counted and no sourcemaps.
 */
export function toolDefinition(id: ToolId): ToolDefinition {
  const held = HELD.get(id)
  if (held) return held

  const made = panel(TOOL_ENTRIES[id])
  HELD.set(id, made)
  return made
}

/** The tools this version knows. State from an older one may name something else. */
export function isKnownTool(id: string): id is ToolId {
  return id in TOOL_ENTRIES
}
