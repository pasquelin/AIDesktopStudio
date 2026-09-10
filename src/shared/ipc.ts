import type { ExternalFileImport, ExternalFileOffer } from './domain/externalFile'
import type { FolderRole } from './domain/folderRole'
import type { Channels as BaseChannels } from './channels'
import { CHANNELS as BASE_CHANNELS } from './ipcChannels'
import { EVENTS as BASE_EVENTS, type Unsubscribe } from './ipcEvents'

export type Channels = BaseChannels & {
  animationThumbnailModel: 'animation:thumbnail-model'
  animationThumbnailSave: 'animation:thumbnail-save'
  mediaIngestPaths: 'media:ingest-paths'
  mediaImportPicked: 'media:import-picked'
  externalFilesTake: 'external:take'
  externalFilesOffer: 'external:offer'
  externalFilesDiscard: 'external:discard'
}

export const CHANNELS: Channels = {
  ...BASE_CHANNELS,
  animationThumbnailModel: 'animation:thumbnail-model',
  animationThumbnailSave: 'animation:thumbnail-save',
  mediaIngestPaths: 'media:ingest-paths',
  mediaImportPicked: 'media:import-picked',
  externalFilesTake: 'external:take',
  externalFilesOffer: 'external:offer',
  externalFilesDiscard: 'external:discard',
}

export const EVENTS = { ...BASE_EVENTS, externalFiles: 'evt:external-files' }
export * from './ipcExports'
export * from './ipcDiagnostics'
export type * from './ipcEvents'

import type { StudioBridgeSettings } from './studioBridgeSettings'
import type { StudioBridgeProject } from './studioBridgeProject'
import type { StudioBridgeLibrary } from './studioBridgeLibrary'
import type { StudioBridgeRecovery } from './studioBridgeRecovery'
import type { StudioBridgeCreation } from './studioBridgeCreation'
import type { StudioBridgeShell } from './studioBridgeShell'
import type { StudioBridgeAutoRig } from './studioBridgeAutoRig'
import type { StudioBridgeSmartSelection } from './studioBridgeSmartSelection'
import type { StudioBridgeMissions } from './studioBridgeMissions'

type CreationBridge = Omit<StudioBridgeCreation, 'media'> & {
  media: StudioBridgeCreation['media'] & {
    ingestPaths: (requestId: string, folder: string, taskId: string) => Promise<ExternalFileImport>
    importPicked: (role: FolderRole, taskId: string) => Promise<ExternalFileImport>
  }
}

type ExternalFilesBridge = {
  externalFiles: {
    take: () => Promise<ExternalFileOffer[]>
    offer: (files: readonly File[]) => Promise<ExternalFileOffer>
    discard: (requestId: string) => Promise<void>
    onOpen: (callback: () => void) => Unsubscribe
  }
}

export type StudioBridge = StudioBridgeSettings &
  StudioBridgeProject &
  StudioBridgeLibrary &
  StudioBridgeRecovery &
  CreationBridge &
  StudioBridgeShell &
  StudioBridgeMissions &
  ExternalFilesBridge &
  StudioBridgeAutoRig &
  StudioBridgeSmartSelection
