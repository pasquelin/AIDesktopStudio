/**
 * How a guard of the MAIN process reads the project's sources rather than importing them.
 *
 * The AST guards that sweep the whole repository from this side need the same three things: the
 * walk, the five trees, and a timeout wide enough for them. Held here so a guard added later
 * inherits the same reading, and so the exclusion below is decided once. The window's guards have
 * no filesystem and borrow `renderer/src/windowSources.ts` instead — same idea, other mechanism.
 *
 * `wideGuards.ts` is the other half of this and NOT the same job: it detects which suites read
 * the tree, so the short loop replays them. It never hands one the files. A guard importing this
 * module still has to read something itself for `readsTheTree` to recognise it — both callers do,
 * through `readFileSync` anchored on `import.meta.url`.
 */
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Long enough for five trees of sources, parsed one file at a time. */
export const WHOLE_PROJECT = 60_000

/**
 * Test material is out, `-fixtures.ts` included: a fixture builds the data a suite asserts on and
 * never reaches a screen, so a job it names `Flux` is the label the API returns, not a word this
 * studio writes. The exclusion is a DECISION, taken 11/08 — a fixture forced through a bundle key
 * says nothing truer and reads worse.
 *
 * `.tsx` as well as `.ts`: the sweep was widened to components, and a fixture is a fixture on
 * either side.
 */
export function sourceFiles(directory: string, into: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) sourceFiles(path, into)
    else if (/\.tsx?$/.test(path) && !/(\.(test|bench)|-fixtures)\.tsx?$/.test(path))
      into.push(path)
  }

  return into
}

/** Where this module sits, which is `src/main` — the anchor the four trees are named from. */
const MAIN = dirname(fileURLToPath(import.meta.url))

/** `src/`, so a finding can be reported as the path a reader would open. */
export const SOURCE_ROOT = join(MAIN, '..')

/**
 * The five trees, `main` first.
 *
 * `main` is one of them, and not for symmetry: it writes its screens through `TRANSLATIONS` and
 * sorts what its own handlers return, so a defect bound in a module there reaches a reader
 * exactly as one bound in the window does. A guard that wants the others can take the tail.
 *
 * `game` is here so the rules on names, on language and on `.then()` reach it like anywhere else.
 * What it may IMPORT is another matter, held on its own by `main/game-imports.test.ts`.
 */
export const PROJECT_TREES: readonly string[] = [
  MAIN,
  ...['renderer', 'shared', 'preload', 'game'].map(tree => join(SOURCE_ROOT, tree)),
]

/**
 * Every name a module DECLARES and exports, mapped to whether it survives compilation.
 *
 * A VALUE is code that ships; a TYPE is gone by then, and an unread one is not always spare — an
 * exhaustiveness alias reddens by being READ, not by being exported, so a guard that deletes it
 * for want of a reader takes the check with it. Guards that weigh the two differently need the
 * distinction, so it is drawn once, here. No such type is exported today; the split is kept for
 * the guards, not for a current case.
 *
 * What it does not see, and why each would need a parser rather than a line: `export { x }` and
 * `export * from`, which re-publish a name declared elsewhere; `export default`, which carries no
 * name; and a declaration whose `export` keyword sits on its own line.
 */
export function exportedNames(code: string): Map<string, 'value' | 'type'> {
  return new Map(
    // `?? ''`: both groups are filled whenever the pattern matched, which the type cannot know.
    [...code.matchAll(DECLARES)].map(match => [
      match[2] ?? '',
      /^(?:type|interface)$/.test(match[1] ?? '') ? 'type' : 'value',
    ]),
  )
}

const DECLARES =
  /(?:^|\n)export (?:async |declare |abstract )*(function\*?|const|let|var|class|type|interface|enum) (\w+)/g

/**
 * Where an import specifier lands under `src`, or `null` when nothing does — a package, a node
 * builtin, or a spelling no file answers.
 *
 * `?worker` and `?raw` are Vite's, and the module they name is still a module. `.js` spelt for a
 * `.ts` file resolves too: `moduleResolution: 'bundler'` accepts both and this repo writes both —
 * a cycle spelt that way compiled, linted and BUILT while the ratchet said four.
 *
 * Shared rather than spelt per guard: four tables of aliases coexisted and none listed the same
 * ones, so a sweep silently skipped whatever its own table had forgotten.
 */
export function resolveSpecifier(specifier: string, fromFile: string): string | null {
  const bare = specifier.split('?')[0] ?? specifier
  const alias = ALIASES.find(([prefix]) => bare.startsWith(prefix))
  const target = alias
    ? join(SOURCE_ROOT, alias[1], bare.slice(alias[0].length))
    : bare.startsWith('.')
      ? resolve(dirname(fromFile), bare)
      : null
  if (target === null) return null

  const stem = target.replace(/\.[cm]?jsx?$/, '')
  const spellings = [
    target,
    `${stem}.ts`,
    `${stem}.tsx`,
    join(stem, 'index.ts'),
    join(stem, 'index.tsx'),
  ]
  return spellings.find(one => /\.tsx?$/.test(one) && isFile(one)) ?? null
}

/**
 * Whether a specifier names a file of this repository at all, told apart from a package by its
 * leading `.` or by an alias — `@testing-library/react` opens like an alias and is not one.
 */
export function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || ALIASES.some(([prefix]) => specifier.startsWith(prefix))
}

/** The aliases `tsconfig` and `electron.vite.config.ts` declare, as roots under `src/`. */
const ALIASES: readonly [string, string][] = [
  ['@/', 'renderer/src/'],
  ['@shared/', 'shared/'],
  ['@main/', 'main/'],
  ['@game/', 'game/'],
]

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
