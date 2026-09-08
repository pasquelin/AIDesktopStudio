import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GateLink } from './gateLinks'

/**
 * Where a link's verdict is remembered. Under `node_modules/` on purpose, as the compiler caches
 * are (`gate-caches.test.ts`): git never carries it and a fresh clone starts cold, so CI runs the
 * whole gate every time. **That is the safety net under all of this** — not the care taken over
 * the input lists below.
 */
export const CACHE_DIR = join('node_modules', '.cache', 'gate')

/** Ignored trees a link still reads: `agents-contract.test.ts` walks them. */
const IGNORED_BUT_READ = ['.agents', '.claude', '.grok']

/** A command as a file name, so a marker is readable in a listing. */
export const markerNameOf = (command: string): string =>
  command.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')

const ask = (root: string, ...args: string[]): string[] =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)

/**
 * The files a link reads, asked of git rather than walked: git already knows what is ignored, so
 * `node_modules/`, `out/`, `resources/` and the other checkouts under `worktrees/` stay out with
 * no deny-list to keep up to date. Untracked and not ignored counts too — a test written and not
 * yet added is a file the link reads.
 *
 * A link reading the whole tree also gets the three ignored trees a wide guard walks. The price is
 * paid knowingly: writing under `.agents/` invalidates the suite's marker. Safe in that direction.
 */
export function filesRead(root: string, reads: readonly string[]): string[] {
  const whole = reads.includes('.')
  const paths = whole ? [...reads, ...IGNORED_BUT_READ] : [...reads]

  return [
    ...new Set([
      ...ask(root, 'ls-files', '-z', '--', ...paths),
      ...ask(root, 'ls-files', '-z', '--others', '--exclude-standard', '--', ...paths),
      ...(whole ? ask(root, 'ls-files', '-z', '--others', '--', ...IGNORED_BUT_READ) : []),
    ]),
  ].sort()
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
 * dependencies, and every byte the link reads. Contents rather than timestamps — a timestamp
 * differs between two checkouts of one commit and would cache nothing.
 *
 * A factory rather than a function, for one measured reason: the suite reads the whole tree and
 * the other eleven links read subsets of it, so hashing file by file without a memo re-reads the
 * same five thousand files twelve times.
 */
export function fingerprinterFor(root: string, runtime: string): (link: GateLink) => string {
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

    for (const path of ['package.json', 'pnpm-lock.yaml', '.nvmrc']) {
      digest.update(`${path}\0${hashOf(path)}\0`)
    }
    for (const path of filesRead(root, link.reads)) {
      digest.update(`${path}\0${hashOf(path)}\0`)
    }
    return digest.digest('hex')
  }
}
