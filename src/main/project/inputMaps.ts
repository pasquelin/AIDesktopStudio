import { INPUT_MAP_EXTENSION, inputMapOf, type InputMap } from '@shared/domain/inputMap'
import type { FolderEntry } from '@shared/domain/folder'
import { createProjectJsonStore, type ProjectJsonStore } from './projectJsonStore'

export type InputMapStore = ProjectJsonStore<InputMap>

export function createInputMaps(deps: {
  rootOf: () => string | null
  walk: () => Promise<FolderEntry[]>
  announce?: (path: string) => void
}): InputMapStore {
  return createProjectJsonStore({
    ...deps,
    extension: INPUT_MAP_EXTENSION,
    parse: inputMapOf,
  })
}
