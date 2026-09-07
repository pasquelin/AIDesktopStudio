/**
 * What it means for a build to ship the same bytes twice.
 *
 * No test of the suite can see this: a duplicate is made by the bundler, out of files no import
 * graph reaches. `eager-graph.test.ts` walks the static imports from the entry point and is blind
 * to it by construction — the decoders that made this necessary arrived one from
 * `copy-decoders.mjs`, outside every import, and one from three.js's own `new URL('../libs/…')`.
 *
 * The rule lives here rather than in the script that launches it: a rule kept inside its launcher
 * is a rule no test can reach, and a walk that returns nothing then reads exactly like a clean
 * artefact.
 *
 * It sees one class of waste and not the other. Of the 1 899 658 bytes this lot removed, it would
 * have caught 835 738 — the four byte-identical twins. The rest had no twin at all, and it is
 * `decoderUrls.test.ts`, inside `pnpm validate`, that keeps those from coming back.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

/**
 * Below this the walk found something other than a build — an emptied folder, a wrong root — and
 * "no duplicate" would read like a clean artefact. Measured at 143 files on 2026-08-13; set well
 * under it, since what a build emits moves with the code.
 */
export const LEAST_FILES = 40

/** The same bytes, under every path that carries them. */
export type ShippedTwice = { paths: string[]; bytes: number }

// `join`, not a template: the release pipeline builds on Windows, where a mixed separator would
// print paths nobody can paste back.
export function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/**
 * Which of the artefact's programs a file belongs to — `main`, `preload` or `renderer`. A file
 * lying at the root of the artefact belongs to none, and those are one set.
 */
function programOf(root: string, path: string): string {
  const [first, ...rest] = relative(root, path).split(sep)
  return rest.length === 0 ? '' : (first ?? '')
}

/**
 * Every group of files holding identical bytes WITHIN one program.
 *
 * Across two it is not a copy: they cannot share a file at run time — one is a Node process
 * reading from disk, the other a window loading over its own protocol — and `shared/` compiles
 * into both, so there will always be some.
 *
 * 🛑 What that buys, in clear: an asset copied into a program that has no use for it is waste
 * this cannot see. Empty files are left out too, two of them being the same bytes by definition.
 * Those are the whole tolerance; an exemption list is the line someone adds instead of deleting
 * the copy.
 */
export function shippedTwice(root: string, files: string[]): ShippedTwice[] {
  const byDigest = new Map<string, { paths: string[]; bytes: number }>()

  for (const path of files) {
    const content = readFileSync(path)
    if (content.length === 0) continue

    const digest = `${programOf(root, path)}:${createHash('sha256').update(content).digest('hex')}`
    const seen = byDigest.get(digest)
    if (seen) seen.paths.push(path)
    else byDigest.set(digest, { paths: [path], bytes: content.length })
  }

  return [...byDigest.values()].filter(group => group.paths.length > 1)
}

/** What the copies cost the artefact: every path beyond the first, at its own weight. */
export function wastedBytes(groups: ShippedTwice[]): number {
  return groups.reduce((total, group) => total + group.bytes * (group.paths.length - 1), 0)
}

/** Whether a build exists to be judged at all. */
export function isBuilt(folder: string): boolean {
  return statSync(folder, { throwIfNoEntry: false })?.isDirectory() === true
}

export async function replaceDirectory(
  destination: string,
  populate: (staging: string) => Promise<void>,
): Promise<void> {
  mkdirSync(dirname(destination), { recursive: true })
  const staging = mkdtempSync(join(dirname(destination), `.${basename(destination)}-`))
  try {
    await populate(staging)
    const previous = `${staging}-previous`
    if (existsSync(destination)) renameSync(destination, previous)
    try {
      renameSync(staging, destination)
    } catch (error) {
      if (existsSync(previous)) renameSync(previous, destination)
      throw error
    }
    rmSync(previous, { recursive: true, force: true })
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
