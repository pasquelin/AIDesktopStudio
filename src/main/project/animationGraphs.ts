import {
  ANIMATION_GRAPH_EXTENSION,
  animationGraphOf,
  type AnimationGraph,
} from '@shared/domain/animationGraph'
import type { FolderEntry } from '@shared/domain/folder'
import { createProjectJsonStore, type ProjectJsonStore } from './projectJsonStore'

export type AnimationGraphStore = ProjectJsonStore<AnimationGraph>

export function createAnimationGraphs(deps: {
  rootOf: () => string | null
  walk: () => Promise<FolderEntry[]>
  announce?: (path: string) => void
}): AnimationGraphStore {
  return createProjectJsonStore({
    ...deps,
    extension: ANIMATION_GRAPH_EXTENSION,
    parse: animationGraphOf,
  })
}
