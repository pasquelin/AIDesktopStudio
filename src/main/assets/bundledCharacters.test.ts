import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { CHANNELS } from '@shared/ipc'
import { BUNDLED_CHARACTER_NAMES, type InstalledCharacter } from '@shared/domain/bundledCharacter'
import { CHARACTER_LEVELS, type CharacterLevel } from '@shared/domain/characterLevel'
import { invoke as invokeChannel, resetHandlers } from '@main/ipc/testHarness'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import type { AsyncCatalog } from '@main/project/catalogClient'
import { registerBundledCharacterHandlers } from './bundledCharacters'
import type { LocalBackend } from './localBackend'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

/** The four densities as they ship, written into a folder of this run's own. */
function shippedFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'characters-'))
  for (const name of Object.values(BUNDLED_CHARACTER_NAMES)) {
    writeFileSync(join(folder, `${name}.glb`), Buffer.from([0x67, 0x6c, 0x54, 0x46]))
  }
  return folder
}

const PROJECT = '/projects/One'

let catalog: AsyncCatalog
let written: Asset[]
let onDisk: Set<string>

/** Writes where the real one writes: `resource` is what puts a file under `.resources/`. */
function backend(): LocalBackend {
  const importFromBytes = async (request: {
    id: string
    name: string
    resource?: true
  }): Promise<Asset> => {
    const asset: Asset = {
      id: request.id,
      name: request.name,
      type: 'mesh',
      location: 'local',
      path: `${request.resource ? '.resources/Modelling/Models' : 'Modelling/Models'}/${request.name}.glb`,
      tags: [],
      createdAt: '2026-09-06T10:00:00.000Z',
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

  return { importFromBytes, replaceBytes } as unknown as LocalBackend
}

function install(
  folder: string,
  level: CharacterLevel,
  ids = 0,
): Promise<InstalledCharacter | null> {
  let minted = ids
  registerBundledCharacterHandlers({
    catalog: () => catalog,
    assets: backend(),
    newAssetId: () => `asset_${(minted += 1)}`,
    folder: () => folder,
    projectPath: () => PROJECT,
    exists: file => onDisk.has(file),
  })

  return invokeChannel(
    CHANNELS.charactersInstallBundled,
    level,
  ) as Promise<InstalledCharacter | null>
}

describe('the character shipped with the app', () => {
  beforeEach(() => {
    resetHandlers()
    catalog = memoryCatalog()
    onTestFinished(catalog.close)
    written = []
    onDisk = new Set()
  })

  it('puts ONE density into the project, under the studio’s own folder', async () => {
    const installed = await install(shippedFolder(), 'medium')

    expect(installed).toEqual({
      level: 'medium',
      assetId: 'asset_1',
      path: '.resources/Modelling/Models/HeroMedium.glb',
    })
    expect(written.map(asset => asset.path)).toEqual(['.resources/Modelling/Models/HeroMedium.glb'])
  })

  // Nineteen megabytes of which three densities nothing looks at is what asking for all four costs.
  it('leaves the other three beside the app', async () => {
    const folder = shippedFolder()

    for (const level of CHARACTER_LEVELS) await install(folder, level, written.length)

    expect(written).toHaveLength(CHARACTER_LEVELS.length)
    expect(new Set(written.map(asset => asset.name)).size).toBe(CHARACTER_LEVELS.length)
  })

  // Reopening a project must not pile up copies, and the id must not move: a scene saved
  // yesterday points at the row installed then.
  it('keeps the density a project already holds, id included', async () => {
    const folder = shippedFolder()
    const first = await install(folder, 'high')
    written = []

    const second = await install(folder, 'high', 100)

    expect(second).toEqual(first)
    expect(written).toEqual([])
  })

  it('writes again the one whose file has gone, keeping the id its scenes point at', async () => {
    const folder = shippedFolder()
    const first = await install(folder, 'low')
    onDisk.delete(`${PROJECT}/.resources/Modelling/Models/HeroLow.glb`)
    written = []

    const second = await install(folder, 'low', 100)

    expect(second).toEqual(first)
    expect(written.map(asset => asset.name)).toEqual(['HeroLow'])
  })
})
