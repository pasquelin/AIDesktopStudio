import { INPUT_MAP_EXTENSION } from './inputMap'
import { nameOf } from './folder'

export type FileViewId = 'inputMap'

export type FileView = {
  id: FileViewId
  path: string
  title: string
}

type FileViewEntry = {
  id: FileViewId
  suffix: string
}

export const FILE_VIEW_REGISTRY: readonly FileViewEntry[] = [
  { id: 'inputMap', suffix: INPUT_MAP_EXTENSION },
]

export function fileViewOf(path: string): FileView | null {
  const entry = FILE_VIEW_REGISTRY.find(candidate => path.toLowerCase().endsWith(candidate.suffix))
  if (!entry) return null
  return { id: entry.id, path, title: nameOf(path).slice(0, -entry.suffix.length) }
}
