import { create } from 'zustand'
import {
  isTerminal,
  needsDismissing,
  type IngestProgress,
  type MediaCapabilities,
} from '@shared/domain/media'
import { withoutKey } from '@shared/collections'
import { connectThroughBridge, getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { reportImportNotices } from '@/services/externalFiles'
import { convertArrivedModels } from '@/services/meshConversion'
import { useAssets } from './assets'

type MediaState = {
  /** Running ingests, by asset id. A finished one leaves; a failed one stays to be seen. */
  progress: Record<string, IngestProgress>
  capabilities: MediaCapabilities

  /** Reads what the pipeline can do and follows every ingest. Returns the unsubscribe. */
  connect: () => Promise<() => void>
  /** Asks again, after the ffmpeg path was changed — the answer is what that field decides. */
  refreshCapabilities: () => Promise<void>
  importMedia: () => Promise<void>
  cancel: (assetId: string) => Promise<void>
  apply: (progress: IngestProgress) => void
}

/**
 * Ingest lives in the main process; this replica is what lets the asset browser show a file the
 * moment it is linked, and follow the probing that fills in its duration afterwards.
 */
export const useMedia = create<MediaState>()((set, get) => ({
  progress: {},
  capabilities: { ffmpeg: true },

  connect: connectThroughBridge(async bridge => {
    const stop = bridge.media.onProgress(progress => get().apply(progress))
    // Not awaited: the caller unsubscribes with what this returns, and holding it back for an
    // IPC round trip leaves a second subscription alive next to the first.
    void get().refreshCapabilities()
    return stop
  }),

  refreshCapabilities: async () => {
    const capabilities = await getBridge()?.media.capabilities()
    if (capabilities) set({ capabilities })
  },

  importMedia: async () => {
    try {
      const imported = await getBridge()?.media.ingest()
      if (!imported) return
      reportImportNotices(imported)
      // The rows exist as soon as the dialog closes, probe or no probe: the browser shows the
      // file straight away, and the ingest fills in what it learns.
      if (imported.assets.length > 0) await useAssets.getState().refresh()
      await convertArrivedModels(imported.assets)
    } catch (error) {
      reportFailure('assets.copy', 'media-picker', error)
    }
  },

  cancel: async assetId => {
    // Dropped locally too: the main process answers with a `cancelled` event, and waiting for
    // it would leave the row on screen under a button that already did its job.
    set(state => ({ progress: withoutKey(state.progress, assetId) }))
    await getBridge()?.media.cancel(assetId)
  },

  apply: progress => {
    // Every outcome changed the catalogue: a finished ingest filled in the duration, the proxy
    // and the waveform, and a duplicate or an unreadable file had the row the import
    // optimistically added dropped from under it.
    if (isTerminal(progress.stage)) useAssets.getState().invalidate()

    set(state =>
      isTerminal(progress.stage) && !needsDismissing(progress.stage)
        ? { progress: withoutKey(state.progress, progress.assetId) }
        : { progress: { ...state.progress, [progress.assetId]: progress } },
    )
  },
}))
