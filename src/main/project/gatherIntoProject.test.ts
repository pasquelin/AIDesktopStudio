import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { documentPath } from '@shared/domain/document'
import { MANIFEST_FILE } from '@shared/domain/project'
import type { AsyncCatalog } from './catalogClient'
import { memoryCatalog } from './catalog-fixtures'
import { gatherIntoProject, type GatherDeps } from './gatherIntoProject'

const roots: string[] = []
/** The guard on unclosed memory databases counts what a SUITE opens, not what the code closes. */
const opened: AsyncCatalog[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  for (const catalog of opened.splice(0)) await catalog.close()
})

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset_facade',
  name: 'facade',
  type: 'image',
  location: 'local',
  path: 'Images/facade.jpg',
  tags: [],
  createdAt: '2026-09-10T10:00:00.000Z',
  ...overrides,
})

/** A source holding one document and one image, and a destination that is a project. */
async function projects(): Promise<{ source: string; destination: string }> {
  const source = await mkdtemp(join(tmpdir(), 'gather-from-'))
  const destination = await mkdtemp(join(tmpdir(), 'gather-into-'))
  roots.push(source, destination)

  await writeFile(join(destination, MANIFEST_FILE), '{}')
  await mkdir(join(source, 'documents'), { recursive: true })
  await mkdir(join(source, 'Images'), { recursive: true })
  await writeFile(join(source, documentPath('doc', 'scene')), 'scene')
  await writeFile(join(source, 'Images', 'facade.jpg'), 'pixels')

  return { source, destination }
}

function deps(source: string, cited: Asset[], overrides: Partial<GatherDeps> = {}): GatherDeps {
  return {
    projectPath: () => source,
    citedBy: async () => cited,
    exists: existsSync,
    hash: async file => (existsSync(file) ? await readFile(file, 'utf8') : null),
    openCatalog: async () => heldCatalog().catalog,
    ...overrides,
  }
}

const request = { documentId: 'doc', kind: 'scene' as const, destination: '' }

/**
 * A destination catalogue the test can still read afterwards. The gatherer closes what it
 * opened — SQLite takes one writer — so an unwrapped one is finalised before the assertion.
 */
function heldCatalog() {
  const catalog = memoryCatalog()
  opened.push(catalog)
  const closed = vi.fn(async () => undefined)
  return { catalog: { ...catalog, close: closed }, closed }
}

describe('gathering a document into another project', () => {
  it('copies the document and everything it cites', async () => {
    const { source, destination } = await projects()

    const report = await gatherIntoProject(deps(source, [asset()]), { ...request, destination })

    expect(report.files.map(one => one.state)).toEqual(['copied', 'copied'])
    expect(existsSync(join(destination, 'Images', 'facade.jpg'))).toBe(true)
  })

  /**
   * 🛑 The ids travel, and that is the whole of what « autonomous » buys: a scene names its sky
   * and its clips by catalogue id, and a destination that minted its own would resolve none.
   */
  it('writes the rows into the destination’s catalogue, ids unchanged, and closes it', async () => {
    const { source, destination } = await projects()
    const { catalog, closed } = heldCatalog()

    const report = await gatherIntoProject(
      deps(source, [asset()], { openCatalog: async () => catalog }),
      { ...request, destination },
    )

    expect(report.rows).toBe(1)
    expect((await catalog.find('asset_facade'))?.path).toBe('Images/facade.jpg')
    expect(closed).toHaveBeenCalledOnce()
  })

  /** The derived files stayed behind: a row naming a proxy that is not there opens nothing. */
  it('leaves the derived paths behind', async () => {
    const { source, destination } = await projects()
    const { catalog } = heldCatalog()

    await gatherIntoProject(
      deps(source, [asset({ proxyPath: '.index/proxies/a.mp4' })], {
        openCatalog: async () => catalog,
      }),
      { ...request, destination },
    )

    expect((await catalog.find('asset_facade'))?.proxyPath).toBeUndefined()
  })

  it('holds a file the destination already carries, rather than copying it twice', async () => {
    const { source, destination } = await projects()
    await mkdir(join(destination, 'Images'), { recursive: true })
    await writeFile(join(destination, 'Images', 'facade.jpg'), 'pixels')

    const report = await gatherIntoProject(deps(source, [asset()]), { ...request, destination })

    expect(report.files.find(one => one.path === 'Images/facade.jpg')?.state).toBe('held')
  })

  /**
   * 🛑 Never overwritten, and never landed beside under another name: a suffixed copy would
   * break every citation written by name, quietly. Refused and SAID instead.
   */
  it('refuses a file whose path the destination holds with other bytes', async () => {
    const { source, destination } = await projects()
    await mkdir(join(destination, 'Images'), { recursive: true })
    await writeFile(join(destination, 'Images', 'facade.jpg'), 'other pixels')

    const report = await gatherIntoProject(deps(source, [asset()]), { ...request, destination })

    expect(report.files.find(one => one.path === 'Images/facade.jpg')?.state).toBe('refused')
    expect(await readFile(join(destination, 'Images', 'facade.jpg'), 'utf8')).toBe('other pixels')
  })

  it('refuses a destination that is not a project, and writes nothing', async () => {
    const { source } = await projects()
    const plain = await mkdtemp(join(tmpdir(), 'gather-plain-'))
    roots.push(plain)
    // Through the held one, so nothing is opened here that the teardown would not see.
    const openCatalog = vi.fn(async () => heldCatalog().catalog)

    const report = await gatherIntoProject(deps(source, [asset()], { openCatalog }), {
      ...request,
      destination: plain,
    })

    expect(report.refused).toBe('not-a-project')
    expect(openCatalog).not.toHaveBeenCalled()
  })

  it('refuses the project it is copying out of', async () => {
    const { source } = await projects()

    const report = await gatherIntoProject(deps(source, []), { ...request, destination: source })

    expect(report.refused).toBe('same-project')
  })
})
