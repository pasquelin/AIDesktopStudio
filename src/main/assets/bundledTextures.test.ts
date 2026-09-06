import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { CHANNELS } from '@shared/ipc'
import type { InstalledCheckerTexture } from '@shared/domain/checkerTexture'
import { invoke as invokeChannel, resetHandlers } from '@main/ipc/testHarness'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import type { AsyncCatalog } from '@main/project/catalogClient'
import { registerBundledTextureHandlers } from './bundledTextures'
import type { LocalBackend } from './localBackend'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

/** The four files as they ship, written into a folder of this run's own. */
function shippedFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'checker-'))
  for (const name of ['GridLarge', 'GridSmall', 'CheckerLarge', 'CheckerSmall']) {
    writeFileSync(join(folder, `${name}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  }
  return folder
}

const PROJECT = '/projects/One'

let catalog: AsyncCatalog
let written: Asset[]

/**
 * Writes where the real one writes — the path is what the idempotence is read from, and honouring
 * `resource` is what makes this double able to see the folder at all.
 */
function backend(): LocalBackend {
  const importFromBytes = async (request: {
    id: string
    name: string
    resource?: true
  }): Promise<Asset> => {
    const asset: Asset = {
      id: request.id,
      name: request.name,
      type: 'image',
      location: 'local',
      path: `${request.resource ? '.resources/Materials' : 'Images'}/${request.name}.png`,
      tags: [],
      createdAt: '2026-08-20T10:00:00.000Z',
    }
    written.push(asset)
    onDisk.add(`${PROJECT}/${asset.path}`)
    return catalog.add(asset)
  }

  const replaceBytes = async (assetId: string): Promise<Asset> => {
    const held = await catalog.find(assetId)
    if (!held) throw new Error(`asset ${assetId} is not in the catalogue`)

    written.push(held)
    onDisk.add(`${PROJECT}/${held.path}`)
    return held
  }

  // Everything else of the backend is out of reach of this handler, and a double that pretended
  // otherwise would be describing a contract this file does not read.
  return { importFromBytes, replaceBytes } as unknown as LocalBackend
}

/** What the project folder still holds, as the handler asks the disk about it. */
let onDisk: Set<string>

function install(folder: string, ids = 0): Promise<InstalledCheckerTexture[]> {
  let minted = ids
  registerBundledTextureHandlers({
    catalog: () => catalog,
    assets: backend(),
    newAssetId: () => `asset_${(minted += 1)}`,
    folder: () => folder,
    roles: () => ({}),
    projectPath: () => PROJECT,
    exists: file => onDisk.has(file),
  })

  return invokeChannel(CHANNELS.texturesInstallBundled) as Promise<InstalledCheckerTexture[]>
}

describe('the working textures shipped with the app', () => {
  beforeEach(() => {
    resetHandlers()
    catalog = memoryCatalog()
    // Given back at the end of the case that opened it: a database left open holds its file
    // handle for the whole run — see `no-unclosed-memory-database`.
    onTestFinished(catalog.close)
    written = []
    onDisk = new Set()
  })

  it('puts all four into the project, under the names a document refers to them by', async () => {
    const installed = await install(shippedFolder())

    expect(installed.map(one => one.id)).toEqual([
      'gridLarge',
      'gridSmall',
      'checkerLarge',
      'checkerSmall',
    ])
    expect(written.map(asset => asset.path)).toEqual([
      '.resources/Materials/GridLarge.png',
      '.resources/Materials/GridSmall.png',
      '.resources/Materials/CheckerLarge.png',
      '.resources/Materials/CheckerSmall.png',
    ])
  })

  // Reopening a project must not pile up copies, and — more to the point — the ids must not
  // move: a scene saved yesterday points at the row installed then.
  it('keeps the assets a project already holds, ids included', async () => {
    const folder = shippedFolder()
    const first = await install(folder)
    written = []

    const second = await install(folder, 100)

    expect(second).toEqual(first)
    expect(written).toEqual([])
  })

  // A row left behind by a file deleted in the Finder: every primitive of that project would
  // otherwise be born wearing a map that resolves to nothing.
  it('writes again the one whose file has gone, keeping the id its scenes point at', async () => {
    const folder = shippedFolder()
    const first = await install(folder)
    onDisk.delete(`${PROJECT}/.resources/Materials/CheckerLarge.png`)
    written = []

    const second = await install(folder, 100)

    expect(written.map(asset => asset.name)).toEqual(['CheckerLarge'])
    expect(second).toEqual(first)
  })

  /**
   * This folder is a catalogue LOOKUP, not merely where a new file lands: a project that filed
   * its four under `Textures/` would otherwise take four more under `Images/`, and its meshes
   * would go on wearing the first four.
   */
  it.each(['Textures', 'Images', 'Materials'])(
    'keeps the four a project filed under %s, before `.resources/` existed',
    async folder => {
      const former: Asset = {
        id: 'asset_filed_before',
        name: 'GridLarge',
        type: 'image',
        location: 'local',
        path: `${folder}/GridLarge.png`,
        tags: [],
        createdAt: '2026-08-20T10:00:00.000Z',
      }
      catalog.add(former)
      onDisk.add(`${PROJECT}/${former.path}`)

      const installed = await install(shippedFolder())

      expect(installed[0]).toEqual({
        id: 'gridLarge',
        assetId: former.id,
        path: former.path,
      })
      expect(written.map(asset => asset.path)).toEqual([
        '.resources/Materials/GridSmall.png',
        '.resources/Materials/CheckerLarge.png',
        '.resources/Materials/CheckerSmall.png',
      ])
    },
  )
})
