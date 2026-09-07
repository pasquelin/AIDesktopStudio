import { bench } from '@shared/vitestBench'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe } from 'vitest'
import { DEFAULT_ROLE_PATHS, FOLDER_ROLES, ROLE_MARKER } from '@shared/domain/folderRole'
import {
  CATALOG_FILE,
  ROLE_CACHE_FILE,
  FILMSTRIPS_FOLDER,
  PEAKS_FOLDER,
  POSTERS_FOLDER,
  PROXIES_FOLDER,
  THUMBNAILS_FOLDER,
} from '@shared/domain/project'
import { createFolderReader, type FolderReader } from './folder'
import { layRoleFolders, resolveRoleFolders, writeRoleCache } from './folderRoles'

/**
 * What opening a project costs the main process, on projects the size of real ones. A main thread
 * busy for more than 16 ms freezes every window of the studio — CLAUDE.md, invariant 6.
 *
 * `folder.ts` is measured here rather than beside itself: the walk and the listing read the very
 * shapes the roles are resolved against, and laying 300 000 files down twice would buy nothing.
 *
 * **Measured 2026-08-28** (macOS, APFS, M2 Pro, Node 24.8), mean, before the descent refusal and
 * after it. Opening with no cache: 16.30 → 6.84 at 10 000 assets, 86.76 → 61.01 at 100 000,
 * 232.99 → 6.64 on the checkout. The save walk: 142.57 → 8.16 on the checkout, and unchanged on
 * the two media shapes, which hold no packages — the mechanism is narrow, and that is the proof.
 *
 * **Still over budget, and NOT a defect of this walk**: 100 000 entries cost ~50 ms to cross
 * whatever the predicate says. A project that size wants the walk off this thread.
 *
 * Read the RATIOS, not the absolutes: a second run beside four other sessions read 8.99 where the
 * one above read 6.64, and the shape held.
 */
const run = promisify(execFile)

/** How many files are written at once. Wider buys no wall clock and costs five times the heap. */
const BATCH = 250

type ShapeName = 'media-10k' | 'media-100k' | 'checkout'
/** Each shape's root. What each holds is in `layAll`, where it is laid down. */
type Shapes = Record<ShapeName, string>

/** Assets spread over the role folders in batches of 250, as a shoot filed by hand ends up. */
async function layAssets(root: string, count: number): Promise<void> {
  const perFolder = BATCH
  let written = 0

  for (let batch = 0; written < count; batch += 1) {
    const role = FOLDER_ROLES[batch % FOLDER_ROLES.length] ?? 'image'
    const path = join(root, DEFAULT_ROLE_PATHS[role], `Batch ${batch}`)
    await mkdir(path, { recursive: true })

    const here = Math.min(perFolder, count - written)
    await Promise.all(
      Array.from({ length: here }, (_unused, index) =>
        writeFile(join(path, `asset ${written + index}.png`), 'x', 'utf8'),
      ),
    )
    written += here
  }
}

/**
 * A project that is ALSO a checkout. `git` writes `.git` itself: its shape is measured, not
 * guessed, and the config of this machine is kept out so a runner reads the same tree.
 */
async function layCheckout(root: string, sources: number): Promise<void> {
  const source = join(root, DEFAULT_ROLE_PATHS.code, 'src')
  await mkdir(source, { recursive: true })
  await Promise.all(
    Array.from({ length: sources }, (_unused, index) =>
      writeFile(join(source, `module${index}.ts`), `export const value${index} = ${index}\n`),
    ),
  )

  const git = async (...args: string[]): Promise<void> => {
    await run('git', ['-c', 'user.name=Bench', '-c', 'user.email=bench@localhost', ...args], {
      cwd: root,
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    })
  }

  await git('init', '-q')
  await git('add', '.')
  await git('commit', '-q', '-m', 'bench')
}

/**
 * The `.index/` a project of this size carries. Counts read off the code rather than invented:
 * thumbnails are capped by BYTES (200 MB at ~30 KB each), posters are one per non-picture asset
 * and capped by nothing, proxies, peaks and filmstrips one per rush.
 */
async function layIndex(root: string, assets: number): Promise<void> {
  const counts: [string, number][] = [
    [THUMBNAILS_FOLDER, Math.min(6_600, assets)],
    [POSTERS_FOLDER, Math.round(assets * 0.3)],
    [PROXIES_FOLDER, Math.round(assets * 0.05)],
    [PEAKS_FOLDER, Math.round(assets * 0.05)],
    [FILMSTRIPS_FOLDER, Math.round(assets * 0.05)],
  ]

  for (const [folder, count] of counts) {
    await mkdir(join(root, folder), { recursive: true })
    // In batches, as `layAssets` writes: 30 000 in one `Promise.all` cost the same wall clock
    // and five times the heap — 157 MB against 30.
    for (let written = 0; written < count; written += BATCH) {
      await Promise.all(
        Array.from({ length: Math.min(BATCH, count - written) }, (_unused, index) =>
          writeFile(join(root, folder, `asset_${written + index}.bin`), 'x'),
        ),
      )
    }
  }
  await writeFile(join(root, CATALOG_FILE), 'x')
}

/** `node_modules` as pnpm leaves it: many small packages, a scope for some, one level of dist. */
async function layNodeModules(root: string, packages: number): Promise<void> {
  for (let index = 0; index < packages; index += 1) {
    const scope = index % 3 === 0 ? `@scope${index % 7}` : ''
    const path = join(root, DEFAULT_ROLE_PATHS.code, 'node_modules', scope, `package-${index}`)
    await mkdir(join(path, 'dist'), { recursive: true })
    await Promise.all([
      writeFile(join(path, 'package.json'), '{"name":"p"}'),
      ...Array.from({ length: 12 }, (_unused, file) =>
        writeFile(join(path, 'dist', `index-${file}.js`), 'module.exports = {}\n'),
      ),
    ])
  }
}

/**
 * The three shapes, laid down once. `vitest bench` honours no `beforeAll` — the tinybench `setup`
 * hook below is what every bench awaits, and it runs per task rather than per sample.
 */
let laid: Promise<Shapes> | null = null
let base: string | null = null

async function layAll(): Promise<Shapes> {
  const under = (base = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-roles-bench-')))

  const media = async (name: string, count: number): Promise<string> => {
    const root = join(under, name)
    await mkdir(root, { recursive: true })
    await layRoleFolders(root)
    await layAssets(root, count)
    await layIndex(root, count)
    return root
  }

  const checkout = join(under, 'checkout')
  await mkdir(checkout, { recursive: true })
  await layRoleFolders(checkout)
  await layAssets(checkout, 8_000)
  await layIndex(checkout, 8_000)
  await layCheckout(checkout, 1_500)
  await layNodeModules(checkout, 3_000)

  return {
    'media-10k': await media('media-10k', 10_000),
    'media-100k': await media('media-100k', 100_000),
    // 9 500 files a reader would name, under 50 000 the walk actually crosses.
    checkout,
  }
}

const shapes = async (): Promise<Shapes> => await (laid ??= layAll())

/** The reader of one shape, built outside every timed body — composing one is not the measure. */
const readerFor = async (name: ShapeName): Promise<FolderReader> => {
  const root = (await shapes())[name]
  return createFolderReader(
    () => root,
    () => 'en',
  )
}

const ready = { setup: async (): Promise<void> => void (await shapes()) }

const SHAPE_NAMES: readonly ShapeName[] = ['media-10k', 'media-100k', 'checkout']

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true })
  // Three hundred thousand files: the ten seconds a hook is given by default is not enough.
}, 120_000)

/**
 * Opening a project whose cache has gone — the walk the roles fall back on.
 *
 * This is the number that decides whether `named` needs a descent predicate: the checkout holds
 * 9 500 files a reader would name and 50 000 the walk crosses.
 */
describe('resolving the folder roles with no cache: the walk', () => {
  for (const name of SHAPE_NAMES) {
    bench(
      name,
      async () => {
        await resolveRoleFolders((await shapes())[name])
      },
      {
        // Thrown away rather than trusted absent: the group below WRITES it, into these very
        // roots, and what made this one cold was the order the two are declared in.
        setup: async () => {
          await rm(join((await shapes())[name], ROLE_CACHE_FILE), { force: true })
        },
      },
    )
  }
})

/** The same opening once the cache has been written — ten `readFile`, and no walk at all. */
describe('resolving the folder roles from the cache', () => {
  for (const name of SHAPE_NAMES) {
    bench(
      name,
      async () => {
        await resolveRoleFolders((await shapes())[name])
      },
      {
        setup: async () => {
          const root = (await shapes())[name]
          await writeRoleCache(root, (await resolveRoleFolders(root)).roles)
        },
      },
    )
  }
})

/** The walk itself, without the marker reads around it — where the time in the group above goes. */
describe('the walk under the resolution: every entry named .ai-desktop-studio-role', () => {
  for (const name of SHAPE_NAMES) {
    bench(
      name,
      async () => {
        await (await readerFor(name)).named(ROLE_MARKER)
      },
      ready,
    )
  }
})

/**
 * The OTHER walk, the one `folder.ts` says crosses the whole project on every save — measured
 * beside the role walk because they are the same traversal with a different predicate.
 *
 * `hidden = false` already kept it out of `.git/` and `.index/`; what it had no way to refuse was
 * `node_modules`, which wears no dot. 142.57 ms before, 8.16 after.
 */
describe('walking every file of the project, as a save does', () => {
  for (const name of SHAPE_NAMES) {
    bench(
      name,
      async () => {
        await (await readerFor(name)).walk()
      },
      ready,
    )
  }
})

/** One level, which is what the explorer reads per unfolded folder — the interactive path. */
describe('listing one level, as the explorer does', () => {
  bench(
    'the project root',
    async () => {
      await (await readerFor('media-100k')).list('')
    },
    ready,
  )

  bench(
    'a folder of 250 assets',
    async () => {
      await (await readerFor('media-100k')).list(join(DEFAULT_ROLE_PATHS.image, 'Batch 0'))
    },
    ready,
  )
})
