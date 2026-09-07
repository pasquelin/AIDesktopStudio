import type { MaterialStyle } from '@shared/domain/style'
import type { Asset } from '@shared/domain/asset'
import { MANIFEST_VERSION, type Project } from '@shared/domain/project'
import { pathParentOf } from '@shared/domain/fileName'
import type { FavoriteRecipe } from '@shared/domain/favorite'
import { noContext, type ContextState } from '@shared/domain/projectContext'
import type { AccountSummary } from '@shared/domain/account'
import type { BridgeOverrides } from '@/services/fakeBridge'
import { WHEN } from './project'

/**
 * Everything the studio keeps OUTSIDE a document — styles, context cards, pinned recipes,
 * accounts, and what the machine was asked to do. Kept because showing a file in the Finder
 * leaves no trace anywhere an oracle could read.
 */
export type MemoryShell = {
  channels: BridgeOverrides
  /** What the machine was asked to do, in the order it was asked. */
  revealed: () => readonly string[]
  /** The project folders sent to the system's trash, in the order they went. */
  trashedProjects: () => readonly string[]
  described: () => readonly string[]
  styles: () => readonly MaterialStyle[]
  favorites: () => readonly FavoriteRecipe[]
  accounts: () => readonly AccountSummary[]
  context: () => ContextState
  pulled: () => readonly string[]
  pushed: () => readonly string[]
  /** A project as its folder names it — one maker, so the manifest version is never restated. */
  projectAt: (path: string) => Project
  /** Files handed to the window from outside — a drop, or `media.indexFileInPlace`. */
  adopted: () => readonly string[]
  adopt: (relative: string) => void
  settingsOpen: () => boolean
  fullScreen: () => boolean
  mirrored: () => boolean
  updateInstalled: () => boolean
  helpAt: () => string | null
}

const projectAt = (path: string): Project => ({
  path,
  manifest: { version: MANIFEST_VERSION, createdAt: WHEN, updatedAt: WHEN },
})

const defaultAccounts = (): AccountSummary[] => [
  { id: 'account-1', name: 'Studio', providerId: 'scenario', active: true },
  { id: 'account-2', name: 'Perso', providerId: 'scenario', active: false },
]

const emptyShellStatus = () => ({
  context: noContext(),
  minted: 0,
  settingsOpen: false,
  fullScreen: false,
  mirrored: false,
  updateInstalled: false,
  helpAt: null as string | null,
})

export function createMemoryShell(assetOf: (assetId: string) => Asset | null): MemoryShell {
  const revealed: string[] = []
  const trashedProjects: string[] = []
  const described: string[] = []
  const pulled: string[] = []
  const pushed: string[] = []
  const adopted: string[] = []
  let styles: MaterialStyle[] = []
  let favorites: FavoriteRecipe[] = []
  const status = emptyShellStatus()

  const accounts = defaultAccounts()

  const channels: BridgeOverrides = {
    project: {
      // A project is a FOLDER, and its name is that folder's — renaming MOVES it.
      open: path => Promise.resolve(projectAt(path)),
      create: path => Promise.resolve(projectAt(path)),
      // The folder MOVES, as the real store does — see `main/project/store.ts`.
      rename: (path, name) => Promise.resolve(projectAt(`${pathParentOf(path)}/${name}`)),
      // The disk is a port here, so what is scored is that the folder was sent to the trash —
      // never that a folder disappeared, which no bench can watch happen.
      trash: path => {
        trashedProjects.push(path)
        return Promise.resolve('trashed')
      },
      revealFile: relative => {
        revealed.push(relative)
        return Promise.resolve()
      },
      readContext: () => Promise.resolve(status.context),
      writeContext: cards => {
        status.context = { ...status.context, cards }
        return Promise.resolve(status.context)
      },
    },
    fileInfo: {
      open: relative => {
        described.push(relative)
        return Promise.resolve()
      },
    },
    styles: {
      list: () => Promise.resolve(styles),
      save: style => {
        status.minted += 1
        styles = [...styles, { ...style, id: style.id || `style-${status.minted}` }]
        return Promise.resolve(styles)
      },
      rename: (id, name) => {
        styles = styles.map(one => (one.id === id ? { ...one, name } : one))
        return Promise.resolve(styles)
      },
      remove: id => {
        styles = styles.filter(one => one.id !== id)
        return Promise.resolve(styles)
      },
    },
    favorites: {
      list: () => Promise.resolve(favorites),
      // A recipe is what MADE the asset, so an asset nobody generated pins nothing — which is
      // the channel's own contract, and what tells « épingle celle-ci » from « épingle ça ».
      pin: assetId => {
        const asset = assetOf(assetId)
        if (!asset) return Promise.resolve(favorites)

        status.minted += 1
        favorites = [
          ...favorites,
          {
            id: `favorite-${status.minted}`,
            label: asset.name,
            type: asset.type,
            generation: {
              modelId: 'model-image',
              modelLabel: 'Demo image',
              prompt: asset.name,
              params: {},
            },
            pinnedAt: WHEN,
            hasThumbnail: false,
          },
        ]
        return Promise.resolve(favorites)
      },
      unpin: id => {
        favorites = favorites.filter(one => one.id !== id)
        return Promise.resolve(favorites)
      },
    },
    accounts: {
      list: () => Promise.resolve(accounts),
      activate: id => {
        for (const one of accounts) one.active = one.id === id
        return Promise.resolve({ accounts })
      },
      rename: (id, name) => {
        const found = accounts.find(one => one.id === id)
        if (found) found.name = name
        return Promise.resolve({ accounts })
      },
    },
    settings: {
      open: () => {
        status.settingsOpen = true
        return Promise.resolve()
      },
    },
    window: {
      toggleFullScreen: () => {
        status.fullScreen = !status.fullScreen
        return Promise.resolve()
      },
    },
    mirror: {
      open: () => {
        status.mirrored = true
        return Promise.resolve()
      },
    },
    help: {
      open: page => {
        status.helpAt = page
        return Promise.resolve()
      },
    },
    updates: {
      install: () => {
        status.updateInstalled = true
        return Promise.resolve()
      },
    },
    cloud: {
      pull: remoteAssetIds => {
        pulled.push(...remoteAssetIds)
        return Promise.resolve([])
      },
      push: assetIds => {
        pushed.push(...assetIds)
        return Promise.resolve([])
      },
    },
  }

  return {
    channels,
    revealed: () => revealed,
    described: () => described,
    styles: () => styles,
    favorites: () => favorites,
    accounts: () => accounts,
    context: () => status.context,
    pulled: () => pulled,
    pushed: () => pushed,
    projectAt,
    trashedProjects: () => trashedProjects,
    adopted: () => adopted,
    adopt: relative => {
      adopted.push(relative)
    },
    settingsOpen: () => status.settingsOpen,
    fullScreen: () => status.fullScreen,
    mirrored: () => status.mirrored,
    updateInstalled: () => status.updateInstalled,
    helpAt: () => status.helpAt,
  }
}
