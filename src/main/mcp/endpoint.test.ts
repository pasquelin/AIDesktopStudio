import { describe, expect, it } from 'vitest'
import { APP_NAME } from '@shared/constants'
import {
  clientName,
  mcpAddCommand,
  mcpConfigJson,
  mcpConfigWith,
  mcpEndpointPath,
  mcpLaunch,
  mcpUrl,
  spawnedAsWayIn,
  stdioEndpointFrom,
  STDIO_FLAG,
  type McpLaunch,
} from './endpoint'

const PACKAGED = '/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio'
const ADDRESS = '/profile/mcp.json'
const WAY_IN = `${STDIO_FLAG}=${ADDRESS}`

const packaged = (): McpLaunch => mcpLaunch(PACKAGED, null, ADDRESS)

describe('pointing a client here', () => {
  /**
   * 🛑 Against `APP_NAME` itself rather than a fixture: it is "AI Desktop Studio", and the space in it
   * made `claude mcp add … ia studio http://…` read the name as `ia` and the url as `studio`.
   * A test naming its own client cannot see that.
   */
  it('registers the studio under a name with no space in it', () => {
    expect(clientName(APP_NAME)).toBe('ia-studio')
    expect(mcpAddCommand(packaged(), clientName(APP_NAME)).split(' ')).toContain('ia-studio')
  })

  /**
   * The loopback IPv4 written out, and the one path the server answers on. A client sent to
   * `localhost` reaches the IPv6 address first on some machines, where nothing is bound.
   */
  it('names the loopback and the one path', () => {
    expect(mcpUrl({ port: 54_321, token: 'abcdef' })).toBe('http://127.0.0.1:54321/mcp')
  })

  /**
   * 🛑 Spelled to the character, because what is NOT in it is the whole point: a port and a token
   * were new every launch, so a client configured with either had to be reconfigured at every
   * start — in development, where `--watch` restarts the main process, at every save.
   *
   * `--` before the command: without it the CLI reads `--mcp-stdio` as one of its own options.
   */
  it('spells a command a terminal can take, with the space in the path quoted', () => {
    expect(mcpAddCommand(packaged(), 'ia-studio')).toBe(
      `claude mcp add ia-studio -- "${PACKAGED}" ${WAY_IN}`,
    )
  })

  /**
   * The shape measured against what `claude mcp add` itself writes — an `mcpServers` map, here
   * of `{ command, args }`. Parsed rather than compared as text: what a client reads is the
   * JSON, and a trailing comma would pass a substring check and fail every client on the machine.
   */
  it('hands a file-driven client the same command, as JSON it can parse', () => {
    const parsed: unknown = JSON.parse(mcpConfigJson(packaged(), 'ia-studio'))

    expect(parsed).toEqual({
      mcpServers: { 'ia-studio': { command: PACKAGED, args: [WAY_IN] } },
    })
  })

  /**
   * A development run is Electron, not this application: without the directory to open, spawning
   * it lands on Electron's own default app and the client talks to nothing.
   */
  it('gives a development run the directory to open, and a packaged one none', () => {
    expect(mcpLaunch('/dev/electron', '/checkout', ADDRESS).args).toEqual(['/checkout', WAY_IN])
    expect(packaged().args).toEqual([WAY_IN])
  })

  /**
   * The process that WRITES the address and the one spawned to READ it are two different runs of
   * this application, so a drift between them is a way in that silently never connects.
   *
   * 🛑 One file per CHECKOUT once there is one: two development studios share a profile, so the
   * second to start took the first's file over — its clients drove the wrong studio, and its quit
   * removed the file from under a studio still listening.
   */
})

describe('persisting a client endpoint', () => {
  it('gives each checkout its own address file, and a packaged run the plain one', () => {
    expect(mcpEndpointPath('/profile', null)).toBe(ADDRESS)
    expect(mcpEndpointPath('/profile', '/one')).not.toBe(mcpEndpointPath('/profile', '/another'))
    expect(mcpEndpointPath('/profile', '/one')).toBe(mcpEndpointPath('/profile', '/one'))
  })

  /**
   * 🛑 `.mcp.json` at the root of a repository is the PROJECT's client configuration, not ours.
   * A launch that overwrote it would delete whatever else the person declared there, silently.
   */
  it('adds itself to what a checkout already declares, and rewrites nothing else', () => {
    const existing = `{"mcpServers":{"other":{"command":"x"}},"somethingElse":1}`

    const written = mcpConfigWith(existing, packaged(), 'ia-studio')

    expect(JSON.parse(written ?? '')).toEqual({
      mcpServers: {
        other: { command: 'x' },
        'ia-studio': { command: PACKAGED, args: [WAY_IN] },
      },
      somethingElse: 1,
    })
    // Nothing to change, so nothing is written: a launch does not touch a file it agrees with.
    expect(mcpConfigWith(written ?? '', packaged(), 'ia-studio')).toBeNull()
  })

  /**
   * The line is pasted into a shell, where `\\` is not unescaped inside quotes — `JSON.stringify`
   * made the Windows path name a file that does not exist.
   */
  it('quotes a path holding a space without escaping its separators', () => {
    const windows = 'C:\\Program Files\\AI Desktop Studio\\AI Desktop Studio.exe'

    expect(mcpAddCommand(mcpLaunch(windows, null, ADDRESS), 'ia-studio')).toContain(`"${windows}"`)
  })

  /**
   * 🛑 Carried on the command line and not worked out again on the other side: a studio started
   * with `--user-data-dir` — the documented way to run a second one — resolves a different
   * profile, so the run that writes the address would never be the run that reads it.
   */
  it('carries the address file to the run spawned to read it', () => {
    const spawned = ['electron', '/checkout', WAY_IN]

    expect(spawnedAsWayIn(spawned)).toBe(true)
    expect(stdioEndpointFrom(spawned)).toBe(ADDRESS)
  })

  /** A configuration written by hand carries the bare flag; that run falls back to its own profile. */
  it('recognises the bare flag, and names no address for it', () => {
    expect(spawnedAsWayIn(['electron', STDIO_FLAG])).toBe(true)
    expect(stdioEndpointFrom(['electron', STDIO_FLAG])).toBeNull()
    expect(spawnedAsWayIn(['electron', '/checkout'])).toBe(false)
  })
})
