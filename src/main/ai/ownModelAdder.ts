import type { TaskWatch } from '@shared/domain/taskProgress'
import { stat } from 'node:fs/promises'
import type { AiOverview, OwnModelProfile } from '@shared/domain/aiOverview'
import type { Language } from '@shared/i18n'
import type { AiManager } from './manager'
import { firstBytes } from '../persistence'
import { ownModelFrom } from './ownModel'
import { ownMotionModelFrom } from './ownMotionModel'

export function createOwnModelAdder(
  deps: {
    language: () => Language
    pickWeights: (language: Language, profile?: OwnModelProfile) => Promise<string | null>
  },
  ai: Pick<AiManager, 'overview' | 'addOwnModel'>,
) {
  let running = false
  return async (profile?: OwnModelProfile, watch?: TaskWatch): Promise<AiOverview> => {
    if (running) return await ai.overview()
    running = true
    try {
      const picked = await deps.pickWeights(deps.language(), profile)
      watch?.signal?.throwIfAborted()
      if (picked === null) return await ai.overview()
      const model =
        profile === 'motion'
          ? await ownMotionModelFrom(picked, true, undefined, watch)
          : await ownModelFrom(picked, {
              readHead: firstBytes,
              sizeOf: async path => (await stat(path)).size,
            })
      watch?.signal?.throwIfAborted()
      return await ai.addOwnModel(model)
    } finally {
      running = false
    }
  }
}
