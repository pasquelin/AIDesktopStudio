import { localizedError } from '@shared/localizedError'
import type { Object3D } from 'three'
import type { GltfSource } from '@/engines/scene/gltfSource'
import { disposeTree, type ModelSource } from '@/engines/scene/modelCache'

/** Preloads a replacement while the renderer keeps drawing the current model. */
export function createRetargetModelSource(
  source: Pick<GltfSource, 'loadAnimation' | 'dispose'>,
  swap: (key: string) => void,
  failure: () => void,
) {
  let revision = 0
  let adopted = 0
  let gone = false
  let prepared: Object3D | null = null
  const load: ModelSource = async () => {
    if (!prepared) throw localizedError('retargetSourceMissing')
    const object = prepared
    prepared = null // Ownership passes to the renderer's model cache.
    return object
  }
  return {
    load,
    current: () => !gone && revision === adopted,
    select: async (url: string) => {
      const requested = ++revision
      try {
        const object = await source.loadAnimation(url)
        if (gone || requested !== revision) {
          disposeTree(object)
          return
        }
        if (prepared) disposeTree(prepared)
        prepared = object
        adopted = requested
        swap(`retarget-source:${requested}`)
      } catch {
        if (!gone && requested === revision) failure()
      }
    },
    dispose: () => {
      gone = true
      if (prepared) disposeTree(prepared)
      prepared = null
      source.dispose()
    },
  }
}
