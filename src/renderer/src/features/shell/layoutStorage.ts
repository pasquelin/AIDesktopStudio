import { browserStorage, LAYOUT_VERSION, type LayoutStorage } from '@pasquelin/panels'
import { isRecord, readNumber } from '@shared/guards'
import { migrateTools } from './migrateTools'

/** 🛑 The key the tools store wrote under, and it does not move: twenty versions live there. */
export const LAYOUT_KEY = 'ai-desktop-studio:tools'

/**
 * The chassis' storage, with the studio's past in front of it: what `zustand/persist` wrote is
 * handed back in the shape `readLayout` expects, and the first write replaces it for good.
 */
export function layoutStorageOn(kept: LayoutStorage): LayoutStorage {
  return {
    read: key => {
      const raw = kept.read(key)
      if (raw === null) return null

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Not JSON is not ours either: `readLayout` is the one that refuses it.
        return raw
      }
      // Only the envelope `zustand/persist` wrote is ours to translate. Anything else is the
      // chassis' own file, whose versions `readLayout` knows and this must not.
      if (!isRecord(parsed) || !isRecord(parsed.state)) return raw

      const layout = migrateTools(parsed.state, readNumber(parsed, 'version', 0))
      return JSON.stringify({ version: LAYOUT_VERSION, ...layout })
    },
    write: kept.write,
  }
}

export const layoutStorage: LayoutStorage = layoutStorageOn(browserStorage())
