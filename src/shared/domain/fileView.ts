import { ANIMATION_GRAPH_EXTENSION } from './animationGraph'
import { INPUT_MAP_EXTENSION } from './inputMap'
import { nameOf } from './folder'

export type FileViewId = 'inputMap' | 'animationGraph'

export type FileView = {
  id: FileViewId
  path: string
  title: string
}

type FileViewEntry = {
  id: FileViewId
  suffix: string
}

const FILE_VIEW_REGISTRY: readonly FileViewEntry[] = [
  { id: 'inputMap', suffix: INPUT_MAP_EXTENSION },
  { id: 'animationGraph', suffix: ANIMATION_GRAPH_EXTENSION },
]

/** What every file view is written as, and the only part of a name that says nothing. */
const JSON_SUFFIX = '.json'

/**
 * 🛑 The KIND stays in the title: `character.anim.json` and `character.input.json` are one
 * character's two files, and stripping the whole compound extension put two tabs called
 * « character » side by side with nothing to tell them apart.
 */
export function fileViewOf(path: string): FileView | null {
  const entry = FILE_VIEW_REGISTRY.find(candidate => path.toLowerCase().endsWith(candidate.suffix))
  if (!entry) return null
  return { id: entry.id, path, title: nameOf(path).slice(0, -JSON_SUFFIX.length) }
}
