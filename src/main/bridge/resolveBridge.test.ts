import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP_NAME } from '@shared/constants'
import {
  installResolveScript,
  ResolveNotInstalledError,
  resolveHome,
  resolveScriptFolder,
  resolveScriptPath,
  resolveScriptText,
} from './resolveBridge'

/**
 * A home of its own for every case: the real one holds somebody's Resolve, and a test that wrote
 * there would install the very thing this repository refuses to install without being asked.
 */
let home = ''

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'resolve-bridge-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('where Resolve reads a script', () => {
  /**
   * `Utility` rather than `Comp` or `Tool`: those two are offered only while a composition is
   * open, and this script runs from the edit page.
   */
  it('names the per-user Utility folder, under the application support tree', () => {
    expect(resolveScriptFolder(home, 'darwin')).toBe(
      join(
        home,
        'Library',
        'Application Support',
        'Blackmagic Design',
        'DaVinci Resolve',
        'Fusion',
        'Scripts',
        'Utility',
      ),
    )
  })

  it('writes a .lua, which is the one language Resolve needs nothing installed for', () => {
    expect(resolveScriptPath(home, 'darwin').endsWith('.lua')).toBe(true)
  })

  /**
   * Three platforms, three trees. The studio ships for all of them, and writing the macOS path on
   * Windows lands a script under a `Library` folder nothing there will ever read.
   */
  it('reads the tree each platform actually keeps Resolve in', () => {
    expect(resolveHome(home, 'darwin')).toContain(join('Application Support', 'Blackmagic Design'))
    expect(resolveHome(home, 'linux')).toContain(join('.local', 'share', 'DaVinciResolve'))
    // `Support` sits inside the product folder on Windows alone.
    expect(resolveHome(home, 'win32')).toContain(join('DaVinci Resolve', 'Support'))
  })
})

describe('the script itself', () => {
  /** Resolve owns the pool and the page; the bridge asks the OPEN project to take a file. */
  it('imports into the project that is open, rather than making one', () => {
    const script = resolveScriptText()

    expect(script).toContain('GetCurrentProject')
    expect(script).toContain('ImportTimelineFromFile')
    expect(script).not.toContain('CreateProject')
  })

  /** Every format the studio writes for an online room, or the row picks a file it cannot take. */
  it('offers the four extensions the studio writes an edit as', () => {
    const script = resolveScriptText()

    for (const extension of ['otio', 'edl', 'fcpxml', 'xml']) {
      expect(script).toContain(`*.${extension}`)
    }
  })

  /**
   * The GUARD has to come before the CALL: `Resolve()` where `Resolve` is nil raises on the spot,
   * and the friendly line below it is never reached. Read as positions, not as substrings — both
   * lines are present either way round.
   */
  it('tests the global before calling it, or the message it carries is unreachable', () => {
    const script = resolveScriptText()

    expect(script.indexOf('if not Resolve then')).toBeLessThan(
      script.indexOf('local resolve = Resolve()'),
    )
  })

  /**
   * `APP_NAME` holds a space, and a dotted Lua path holding one is a syntax error against the
   * WHOLE file — Resolve then compiles none of it and the menu row does nothing at all.
   *
   * The blind spot, in clear: there is no Lua on this machine and no Resolve either, so this
   * reads the shape of every name rather than compiling. A defect this one cannot see is one a
   * compiler would.
   */
  it('never spells the application name where Lua expects an identifier', () => {
    // Beside a dot or run into a word, `AI Desktop Studio` becomes a name holding a space — which
    // Resolve reports against the WHOLE file, so the menu row does nothing at all. Inside a
    // string or a comment it is simply text, which is where every other use of it sits.
    expect(resolveScriptText()).not.toMatch(new RegExp(`[.\\w]${APP_NAME}|${APP_NAME}\\w`))
  })
})

describe('installing it', () => {
  /**
   * A machine with no Resolve gets no Blackmagic tree made for it: a folder nobody asked for,
   * holding a script nothing will ever read, is worse than a refusal that says why.
   */
  it('refuses, and makes nothing, where there is no Resolve', async () => {
    await expect(installResolveScript(home, 'darwin')).rejects.toBeInstanceOf(
      ResolveNotInstalledError,
    )
    await expect(stat(resolveHome(home, 'darwin'))).rejects.toThrow()
  })

  it('creates the folders Resolve has not made yet, and answers where it wrote', async () => {
    await mkdir(resolveHome(home, 'darwin'), { recursive: true })

    const written = await installResolveScript(home, 'darwin')

    expect(written).toBe(resolveScriptPath(home, 'darwin'))
    expect(await readFile(written, 'utf8')).toBe(resolveScriptText())
  })

  /** Installing twice is what a studio update means, and it must not fail on the second. */
  it('writes over a script already there', async () => {
    await mkdir(resolveHome(home, 'darwin'), { recursive: true })
    await installResolveScript(home, 'darwin')
    await installResolveScript(home, 'darwin')

    expect(await readFile(resolveScriptPath(home, 'darwin'), 'utf8')).toBe(resolveScriptText())
  })
})
