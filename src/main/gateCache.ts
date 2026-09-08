import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { byCodeUnit } from '../shared/text.ts'
import type { GateLink } from './gateLinks'

/**
 * Where a link's verdict is remembered. Under `node_modules/` on purpose, as the compiler caches
 * are (`gate-caches.test.ts`): git never carries it and a fresh clone starts cold, so CI runs the
 * whole gate every time. **That is the safety net under all of this** — not the care taken over
 * the input lists.
 */
export const CACHE_DIR = join('node_modules', '.cache', 'gate')

/** What must be identical for ANY verdict to hold, whatever the link says it reads. */
const ALWAYS_READ = ['package.json', 'pnpm-lock.yaml', '.nvmrc']

/** A command as a file name, so a marker is readable in a listing. */
export const markerNameOf = (command: string): string =>
  command.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')

export const markerPathIn = (root: string, command: string): string =>
  join(root, CACHE_DIR, markerNameOf(command))

/**
 * Whether the link's last green verdict still describes the tree — the one place that answers it,
 * for the gate and for the merge guard alike. A near-copy in the guard read the marker and forgot
 * `produces`, so a build whose bundle had been deleted was stale to one and green to the other.
 */
export function alreadyGreen(root: string, link: GateLink, fingerprint: string): boolean {
  const marker = markerPathIn(root, link.command)
  if (!existsSync(marker)) return false
  if (link.produces !== undefined && !existsSync(join(root, link.produces))) return false

  return readFileSync(marker, 'utf8').trim() === fingerprint
}

const ask = (root: string, ...args: string[]): string[] =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)

/**
 * Every path git knows about, listed ONCE for the whole gate.
 *
 * Asked of git rather than walked: git already knows what is ignored, so `node_modules/`, `out/`,
 * `resources/` and the other checkouts under `worktrees/` stay out with no deny-list to keep up to
 * date. Untracked and not ignored counts too — a test written and not yet added is a file a link
 * reads. `alsoIgnored` are the trees a link names explicitly, ignored yet read by a wide guard.
 *
 * Measured 2026-09-08: listing per link cost 25 git spawns and 524 ms of the 1078 ms fingerprint
 * pass — more than reading and hashing all 95 MB of the tree. Three spawns and a filter: 158 ms.
 */
export function treeOf(root: string, alsoIgnored: readonly string[]): string[] {
  const ignored =
    alsoIgnored.length > 0 ? ask(root, 'ls-files', '-z', '--others', '--', ...alsoIgnored) : []

  return [
    ...new Set([
      ...ask(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'),
      ...ignored,
    ]),
  ].sort(byCodeUnit)
}

/**
 * The paths of `tree` a link reads. Prefix matching rather than a glob: every entry of `reads` is
 * a literal file or folder, which is what git's pathspec does with them — verified path for path
 * against a listing per link on 2026-09-08.
 */
export function filesRead(tree: readonly string[], link: GateLink): string[] {
  const specs = [...link.reads, ...(link.readsIgnored ?? [])]
  if (specs.includes('.')) return [...tree]

  return tree.filter(path => specs.some(spec => path === spec || path.startsWith(`${spec}/`)))
}

/** A path git lists and disk no longer has is a deletion, which must move the fingerprint. */
const bytesAt = (path: string): Buffer => {
  try {
    return readFileSync(path)
  } catch {
    return Buffer.from('\0gone')
  }
}

/**
 * What must be identical for a verdict to still hold: the command, the runtime, the resolved
 * dependencies, and every byte the link reads. Contents rather than timestamps — mtime misses an
 * edit that keeps the size and the minute, and this is the one function that must have no gap.
 *
 * A factory over the whole chain, for two measured reasons: the tree is listed once for all of
 * them, and the suite reads every file the other links read, so hashing without a memo would read
 * the same five thousand files twelve times.
 */
export function fingerprinterFor(
  root: string,
  runtime: string,
  links: readonly GateLink[],
): (link: GateLink) => string {
  const tree = treeOf(root, [...new Set(links.flatMap(link => link.readsIgnored ?? []))])
  const seen = new Map<string, string>()
  const hashOf = (path: string): string => {
    const known = seen.get(path)
    if (known !== undefined) return known

    const made = createHash('sha256')
      .update(bytesAt(join(root, path)))
      .digest('hex')
    seen.set(path, made)
    return made
  }

  return link => {
    const digest = createHash('sha256')
    digest.update(`${link.command}\0${runtime}\0`)
    for (const path of [...ALWAYS_READ, ...filesRead(tree, link)]) {
      digest.update(`${path}\0${hashOf(path)}\0`)
    }
    return digest.digest('hex')
  }
}
