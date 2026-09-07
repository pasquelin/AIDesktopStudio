import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { isRecord } from '@shared/guards'
import type { McpState } from '@shared/ipc'
import { isDevelopment } from '@main/environment'

/**
 * Where the server is, and how a client is pointed at it.
 *
 * The port is ephemeral and the token is new every launch, so neither can be written down in a
 * client's configuration: they go to `mcp.json` beside the settings, which `stdio.ts` reads per
 * message. What a client is given holds no address at all — see `mcpLaunch`.
 */

/** What `process.argv` carries when the studio is spawned to be one client's way in. */
export const STDIO_FLAG = '--mcp-stdio'

const POINTED_AT = `${STDIO_FLAG}=`

export type McpEndpoint = { port: number; token: string }

/** The command a client spawns, and what it spawns it with. No address in either. */
export type McpLaunch = { command: string; args: readonly string[] }

/**
 * What a window may know of it: the port, never the token — invariant 1. Derived HERE so the
 * pull and the push cannot disagree: the rule "no port means nothing is listening" was stated
 * once per producer, and nothing would have reddened the day they drifted.
 */
export const mcpStateOf = (endpoint: McpEndpoint | null): McpState => ({
  port: endpoint?.port ?? null,
})

/**
 * 🛑 What a client is registered UNDER, and it may not hold a space: `APP_NAME` carries two of
 * them, and `claude mcp add … ai desktop studio http://…` had the CLI read the name as `ai`, the
 * url as `desktop`, and the rest as stray arguments.
 */
export const clientName = (appName: string): string => appName.toLowerCase().replace(/\s+/g, '-')

/**
 * Where a running studio leaves its address, one file per CHECKOUT in development.
 *
 * 🛑 Not one per profile: two development studios share a `userData`, so the second to start took
 * the first's file over — its clients then drove the wrong studio, and its quit removed the file
 * from under a studio still listening. Neither reddens anywhere.
 */
export const mcpEndpointPath = (userData: string, checkout: string | null): string =>
  join(
    userData,
    checkout === null
      ? 'mcp.json'
      : `mcp-${createHash('sha256').update(checkout).digest('hex').slice(0, 8)}.json`,
  )

/**
 * The checkout a launch must be told to open, or nothing in a packaged run — unpackaged,
 * `execPath` is Electron itself.
 *
 * One derivation, because the FILE NAME above turns on it: the way in derived it as `null` while
 * the studio derived it from the checkout, so the fallback looked for a file a development studio
 * never writes. Nothing reddened — a `.mcp.json` always passes the address on the command line.
 */
export const checkoutOf = (appPath: string): string | null => (isDevelopment ? appPath : null)

/** The address as it is written. Its twin `mcpEndpointOf` reads it — one spelling of the shape. */
export const mcpEndpointJson = ({ port, token }: McpEndpoint): string =>
  `${JSON.stringify({ port, token }, null, 2)}\n`

/** `null` for anything that is not the pair, which a half-written or hand-edited file can be. */
export function mcpEndpointOf(raw: string): McpEndpoint | null {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return null

  const { port, token } = parsed
  return typeof port === 'number' && typeof token === 'string' ? { port, token } : null
}

/** The single path the server answers on. Anything else is a 404, whoever asks. */
export const MCP_PATH = '/mcp'

/**
 * `127.0.0.1` written out rather than `localhost`: the name resolves to an IPv6 address first on
 * some machines, and the server binds the IPv4 loopback alone.
 */
export function mcpUrl({ port }: McpEndpoint): string {
  return `http://127.0.0.1:${port}${MCP_PATH}`
}

/**
 * How a client SPAWNS the studio as its way in — no port, no token, so it never goes stale.
 *
 * 🛑 `endpointPath` is carried rather than worked out by the spawned run: a studio started with
 * `--user-data-dir` resolves another profile, so the run that writes the address would not be the
 * run that reads it. `appPath` is what an unpackaged run needs — there, `execPath` is Electron,
 * which without a directory opens its own default app.
 */
export function mcpLaunch(
  execPath: string,
  appPath: string | null,
  endpointPath: string,
): McpLaunch {
  const wayIn = `${POINTED_AT}${endpointPath}`
  return { command: execPath, args: appPath === null ? [wayIn] : [appPath, wayIn] }
}

/** Whether this run was spawned to be one client's way in rather than to be the studio. */
export const spawnedAsWayIn = (argv: readonly string[]): boolean =>
  argv.includes(STDIO_FLAG) || stdioEndpointFrom(argv) !== null

/** The address file such a run was pointed at, or `null` when the flag came bare — which an
 * EMPTY value is too, or the fallback beside it would be defeated by a path of no characters. */
export function stdioEndpointFrom(argv: readonly string[]): string | null {
  const given = argv.find(one => one.startsWith(POINTED_AT))?.slice(POINTED_AT.length)
  return given === undefined || given === '' ? null : given
}

/**
 * Quoted because the one path that matters holds a space: `AI Desktop Studio.app`.
 *
 * 🛑 Not `JSON.stringify`, which escapes backslashes: no shell unescapes `\\` inside quotes, so
 * the line copied on Windows named a file that does not exist.
 */
const quoted = (word: string): string => (/\s/.test(word) ? `"${word}"` : word)

/** `--` is not decoration: without it the CLI reads `--mcp-stdio` as one of its OWN options. */
export function mcpAddCommand(launch: McpLaunch, name: string): string {
  return ['claude mcp add', name, '--', quoted(launch.command), ...launch.args.map(quoted)].join(
    ' ',
  )
}

const serverEntry = (launch: McpLaunch) => ({ command: launch.command, args: [...launch.args] })

/**
 * The same entry ADDED to what a checkout already declares, or `null` when it is already there.
 *
 * 🛑 Read-modify-write, never a plain write: `.mcp.json` at the root of a repository is the
 * PROJECT's client configuration and not ours — other people's servers live in it, and a launch
 * that overwrote the file would delete them without a word. `null` so a launch that changes
 * nothing writes nothing.
 */
export function mcpConfigWith(existing: string, launch: McpLaunch, name: string): string | null {
  const parsed: unknown = existing.trim() === '' ? {} : JSON.parse(existing)
  const root = isRecord(parsed) ? parsed : {}
  const servers = isRecord(root['mcpServers']) ? root['mcpServers'] : {}
  const ours = serverEntry(launch)

  if (JSON.stringify(servers[name]) === JSON.stringify(ours)) return null

  return `${JSON.stringify({ ...root, mcpServers: { ...servers, [name]: ours } }, null, 2)}\n`
}

/**
 * The same command for a client configured by a FILE — the `mcpServers` map `claude mcp add`
 * itself writes, and that `.mcp.json` at the root of a checkout carries. One spelling of the
 * shape, its twin's, since nothing to merge into is what an empty file is.
 */
export function mcpConfigJson(launch: McpLaunch, name: string): string {
  return mcpConfigWith('', launch, name) ?? ''
}
