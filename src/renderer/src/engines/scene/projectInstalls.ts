/**
 * The one memo of « put what the app ships with into the open project », for every bundle at once.
 *
 * The factories that make nodes are SYNCHRONOUS — they run inside a command, between two entries
 * of the history — and copying files into a project is not. `ensureProjectInstalls` is what the
 * two doors that make nodes await first: the 3D space when it mounts, and the new-document flow
 * before it seeds a template.
 *
 * 🛑 The bundles are LISTED, not self-registered: a module nobody imports registers nothing, and
 * a project would quietly gain three quarters of what it ships with.
 */
import {
  checkerTexturePath,
  forgetCheckerTextures,
  installCheckerTextures,
} from './checkerTextures'
import {
  forgetShippedCharacter,
  installShippedCharacter,
  shippedCharacterPath,
} from './shippedCharacter'

/** `install` never rejects: it answers whether it landed, so a failure can be asked again. */
type ProjectBundle = {
  install: (isCurrent: () => boolean) => Promise<boolean>
  forget: () => void
  pathOf: (assetId: string) => string | null
}

const BUNDLES: readonly ProjectBundle[] = [
  { install: installCheckerTextures, forget: forgetCheckerTextures, pathOf: checkerTexturePath },
  {
    install: installShippedCharacter,
    forget: forgetShippedCharacter,
    pathOf: shippedCharacterPath,
  },
]

export type ProjectInstalls = {
  ensure: (path: string) => Promise<void>
  forget: () => void
  pathOf: (assetId: string) => string | null
}

export function createProjectInstalls(bundles: readonly ProjectBundle[]): ProjectInstalls {
  /** The install in flight, by project — so ten open scenes ask the main process once. */
  let running: { path: string; work: Promise<void> } | null = null

  const forget = (): void => {
    for (const bundle of bundles) bundle.forget()
    running = null
  }

  /**
   * 🛑 The memo is dropped when a bundle FAILED, so the next mount asks again rather than reading
   * a settled promise back. Without it a project that could not be written to once stays without
   * its textures and its body for the whole session, and nothing says so.
   *
   * Both bundles are asked again, where two memos asked only the one that failed: the main
   * process gives a project that already carries a resource its ids back rather than a second
   * copy, so the cost of the extra ask is a round trip.
   */
  const runAll = async (isCurrent: () => boolean): Promise<void> => {
    const landed = await Promise.all(bundles.map(bundle => bundle.install(isCurrent)))
    if (!landed.every(Boolean) && isCurrent()) running = null
  }

  /**
   * Asked on the way BACK as much as on the way in: a slow install for the project one has just
   * left resolves after the next one has answered, and would hand a fresh node the asset ids of a
   * project this window no longer has open.
   */
  const ensure = (path: string): Promise<void> => {
    if (path === '') {
      forget()
      return Promise.resolve()
    }
    if (running && running.path === path) return running.work

    const work = runAll(() => running?.path === path)
    running = { path, work }
    return work
  }

  return { ensure, forget, pathOf: assetId => pathOfIn(bundles, assetId) }
}

function pathOfIn(bundles: readonly ProjectBundle[], assetId: string): string | null {
  for (const bundle of bundles) {
    const path = bundle.pathOf(assetId)
    if (path) return path
  }
  return null
}

const SHIPPED = createProjectInstalls(BUNDLES)

export const ensureProjectInstalls = SHIPPED.ensure
export const forgetProjectInstalls = SHIPPED.forget

/** The file an id became, so a save can name it by uri without waiting for the shelf. */
export const installedPathOf = SHIPPED.pathOf
