import { describe, expect, it } from 'vitest'
import { createProjectInstalls } from './projectInstalls'

/**
 * 🛑 The mechanism this covers was written TWICE — once for the working textures, once for the
 * shipped character, code and comments to the letter — and neither copy was ever tested. What
 * follows is what both of them promised in their headers.
 */
function bundle(options: { lands?: boolean } = {}) {
  const asked: string[] = []
  let landed: string | null = null
  // A QUEUE, not one resolver: two projects in flight means two round trips, and a case that
  // finishes the second while the first still hangs is exactly what is being described.
  const waiting: (() => void)[] = []

  return {
    asked,
    landedAs: () => landed,
    /** Lets a case decide WHEN a round trip comes back, which is the whole subject here. */
    finish: () => waiting.shift()?.(),
    bundle: {
      install: async (isCurrent: () => boolean): Promise<boolean> => {
        asked.push('asked')
        await new Promise<void>(resolve => waiting.push(resolve))
        if (options.lands === false) return false
        if (isCurrent()) landed = 'landed'
        return true
      },
      forget: () => void (landed = null),
      pathOf: (assetId: string) => (assetId === 'known' ? '/Assets/known.png' : null),
    },
  }
}

describe('putting what the app ships with into the open project', () => {
  it('asks the main process once, however many spaces mount', async () => {
    const one = bundle()
    const installs = createProjectInstalls([one.bundle])

    const first = installs.ensure('/Projets/Un')
    const second = installs.ensure('/Projets/Un')
    one.finish()
    await Promise.all([first, second])

    expect(one.asked).toHaveLength(1)
    expect(one.landedAs()).toBe('landed')
  })

  // 🛑 The memo is dropped on a failure, or a project that could not be written to once stays
  // without its textures and its body for the whole session, and nothing says so.
  it('asks again after an install that did not land', async () => {
    const one = bundle({ lands: false })
    const installs = createProjectInstalls([one.bundle])

    const first = installs.ensure('/Projets/Un')
    one.finish()
    await first

    const second = installs.ensure('/Projets/Un')
    one.finish()
    await second

    expect(one.asked).toHaveLength(2)
  })

  // 🛑 A slow install for the project one has just left resolves after the next one has answered,
  // and would hand a fresh node the asset ids of a project this window no longer has open.
  it('throws away a result that comes back after the project changed', async () => {
    const one = bundle()
    const installs = createProjectInstalls([one.bundle])

    const left = installs.ensure('/Projets/Un')
    installs.ensure('/Projets/Deux')
    one.finish()
    await left

    expect(one.landedAs()).toBeNull()
  })

  it('forgets everything when no project is open, without asking anything', async () => {
    const one = bundle()
    const installs = createProjectInstalls([one.bundle])

    const opened = installs.ensure('/Projets/Un')
    one.finish()
    await opened
    await installs.ensure('')

    expect(one.landedAs()).toBeNull()
    expect(one.asked).toHaveLength(1)
  })

  it('answers the file an id became, and nothing for one no bundle placed', () => {
    const installs = createProjectInstalls([bundle().bundle])

    expect(installs.pathOf('known')).toBe('/Assets/known.png')
    expect(installs.pathOf('imported')).toBeNull()
  })
})
