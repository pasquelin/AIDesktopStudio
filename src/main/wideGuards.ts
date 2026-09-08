/**
 * Which tests no import graph can reach, and so which ones the short loop must always replay.
 *
 * `vitest related` walks imports. A handful of suites do not import what they check — they read
 * the tree, through `import.meta.glob` with `?raw` or through `fs` — so nothing connects them to
 * the file they would have caught. Measured on 2026-08-13: hardcoding a word into `Tree.tsx`
 * selects eight test files, all green, while `no-hardcoded-text` sits outside the selection.
 *
 * Detected rather than listed, and that is the whole point: a list would keep passing the day a
 * guard is added, covering one file fewer without a word. The net is deliberately wide — a suite
 * caught for a `readdirSync` over a temporary folder costs the second it takes to run.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
// With the extension, because `scripts/check.mjs` imports this module from bare Node, which
// resolves no extension of its own.
import { resolveSpecifier } from './sourceFiles.ts'

/**
 * The floor `scripts/check.mjs` refuses to run below. A detector that recognises nothing prints
 * the same green as one that works, and every hardcoded word would sail through it.
 *
 * Under the real count rather than on it — a suite legitimately deleted must not fail this — but
 * close enough to mean something: it sat at 20 while the count reached 58, where a silent loss of
 * thirty-eight guards would have passed. Never RAISE it to the count; `MOST_SLACK` below is what
 * now says when it has drifted too far, so this no longer rests on anyone remembering.
 *
 * Raised whenever `MOST_SLACK` says the gap has grown, never on a whim: 87 against 97 read on
 * 2026-09-03, when `window-ground.test.ts` took it past ten; 92 against 106 on 2026-09-04, when
 * `indexCss-fixtures` and `sceneRendererSource.testHelper` gave back the fourteen design guards
 * the `index.css` split had dropped and the eleven of `SceneRenderer` that had never been in the
 * net; 112 against 126 the same day, when the name list became a resolved hop into the module;
 * 122 against 132 on 2026-09-06, when `manualInputActions.test.ts` read the manual chapters; 123
 * against 133 the same day, the animation graph having brought its own beside them; 124 against
 * 134 the same day, the welcome reading its shipped clip folders off the disk; 125 against 135 on
 * 2026-09-07, when `no-unpainted-framing` swept the renderer for framings that draw nothing; 126
 * against 136 the same day, `site-leaves-pages` reading the workflow beside the one that already
 * did; 127 against 137 on 2026-09-08, when `localizedErrors.i18n.test.ts` added diagnostic coverage; 128
 * against 138 the same day, `no-physical-direction` sweeping the shared components for a layout
 * written from the left rather than from the inline start; 129 against 139 the same day, when
 * `rerunEverything` put the short loop's whole-suite trigger under a guard of its own.
 */
export const LEAST_GUARDS = 129

/**
 * How far the floor may sit below the real count before it stops meaning anything.
 *
 * A floor only drifts one way — guards are added, it is not — and nothing said so: it reached
 * seventeen below on 2026-08-19, back where a silent loss of seventeen guards would have passed.
 * `wideGuards.test.ts` fails when the gap grows past this, which turns « remember to raise it »
 * into « the suite tells you to ». **Raise the FLOOR when that happens, never this.**
 */
export const MOST_SLACK = 10

/**
 * A glob standing for files it does not name, rather than one naming a single file.
 *
 * Any wildcard, not just `**`. A review caught the narrow reading on 2026-08-13: `SettingLine`
 * reads `./*.tsx` and `property-line` reads `./*Field.tsx`, both through `?raw`, and both sat
 * outside the net while being exactly what it is for. A pattern with no `*` at all — `'./Row.tsx'`
 * — names its file, so an import graph already reaches it.
 */
function walksTheTree(code: string): boolean {
  const globs = [...code.matchAll(/import\.meta\.glob<?[^(]*\(\s*(\[[^\]]*\]|'[^']*')/g)]
  // `?? ''`: the group is filled whenever the pattern matched, which `noUncheckedIndexedAccess`
  // cannot know.
  return globs.some(match => (match[1] ?? '').includes('*'))
}

/**
 * A test that reads a file whose path it works out from its own position.
 *
 * `import.meta.dirname` and `import.meta.url` are how a suite reaches the repository rather than
 * a temporary folder — a fixture reads from `mkdtemp`, never from where its own source sits. That
 * makes this narrow on purpose: it added exactly the four below and nothing else.
 */
function readsAnchoredFile(code: string): boolean {
  return /readFileSync|readdirSync/.test(code) && /import\.meta\.(dirname|url)/.test(code)
}

/**
 * A file whose TEXT is inlined at build time — `?raw`, at an import or as a glob's query.
 *
 * Vite gives a `?raw` import ANOTHER module id than the file it reads, so nothing in the graph
 * relates the two: measured on 2026-09-04, `vitest related --run index-foundation.css` selects
 * ZERO suites while fourteen read that file. Quoted rather than anywhere in the text, so prose
 * about `?raw` does not count.
 */
const inlinesAFileAtBuildTime = (code: string): boolean => /'[^']*\?raw'/.test(code)

/** A module that reads the repository, whatever way it does it — what a suite borrows. */
function isASweep(code: string): boolean {
  return (
    inlinesAFileAtBuildTime(code) ||
    walksTheTree(code) ||
    readsAnchoredFile(code) ||
    asksGitForTheTree(code)
  )
}

/** Read once per module: a sweep is borrowed by dozens of suites, and the disk is not free. */
const sweeps = new Map<string, boolean>()

function isASweepModule(path: string): boolean {
  const known = sweeps.get(path)
  if (known !== undefined) return known

  const answer = isASweep(readFileSync(path, 'utf8'))
  sweeps.set(path, answer)
  return answer
}

/**
 * A suite that borrows a sweep instead of writing one, followed to the MODULE rather than matched
 * on its NAME.
 *
 * The name list this replaces had to be kept in step with the tree by hand, and it was not: cutting
 * `index.css` in three moved fourteen design guards — `tokensContrast`, the tightest of the
 * repository, among them — onto a module the list did not know. **The count went UP by five in the
 * same lot**, so the loss showed nowhere, which is the shape of every half-fix this file records.
 *
 * ONE hop, and only into a module that is itself a sweep. Deeper, or into anything that merely
 * touches `fs`, would drag most of the suite into the short loop for a `readdirSync` over a
 * temporary folder. **Blind**: a sweep borrowed through a third module, and one reached by
 * `new URL(…, import.meta.url)` rather than by an import — the hole `resolveSpecifier` writes.
 */
function borrowsTheSweep(code: string, from: string): boolean {
  return [...code.matchAll(/from '([^']+)'/g)].some(match => {
    const target = resolveSpecifier(match[1] ?? '', from)
    return target !== null && isASweepModule(target)
  })
}

/**
 * A suite that asks GIT for the tree instead of reading it — `git grep`, `git ls-files`.
 *
 * The sixth way, and it was missing for a day: a guard sweeping every TRACKED file goes through
 * neither `fs` nor a glob, so all five other detectors were blind to it while it was the only
 * thing standing between the repository and a defect it had just spent a lot removing.
 */
const asksGitForTheTree = (code: string): boolean => /execFileSync\(\s*'git'/.test(code)

/**
 * Whether a test reads sources it never imports. `from` is the suite's own path, without which the
 * borrowed sweep cannot be followed — a caller that has only the text gets the five other ways.
 *
 * Six ways. The fourth was missing until a review found it on 2026-08-13: a wide
 * `import.meta.glob`, a walk of the disk, a read of a file that is data rather than a module
 * (`vitest.config.ts` for the test projects), and a read anchored on the suite's own location.
 * That last one covers `csp.test.ts`, `licences.test.ts`, `permission-strings.test.ts` and
 * `gate-caches.test.ts` — four guards that sat outside the net while the floor read 32 and looked
 * healthy. The fifth arrived with `sourceFiles.ts`, for the suites that no longer read anything
 * themselves; the sixth with the first guard to ask git. A count above `LEAST_GUARDS` proves
 * nothing about what the detector cannot see, which is why the ways are enumerated here rather
 * than counted.
 *
 * **No file is recognised by its NAME any more.** `index.css` was, and the day it became three
 * files under other names the fourteen guards reading it left the net in silence.
 */
export function readsTheTree(code: string, from?: string): boolean {
  return (
    walksTheTree(code) ||
    readsAnchoredFile(code) ||
    asksGitForTheTree(code) ||
    inlinesAFileAtBuildTime(code) ||
    /readdirSync|vitest\.config\.ts/.test(code) ||
    (from !== undefined && borrowsTheSweep(code, from))
  )
}

/**
 * Every suite under `folder`, whatever it reads — or whatever else `matching` asks for.
 *
 * Exported because a guard that sweeps the SUITES rather than the sources has nowhere else to get
 * them: `sourceFiles.ts` excludes `.test.ts` by design. Two walks of the same tree would drift,
 * which is what the pattern is for: `file-names.test.ts` wants the BENCHES, and had written the
 * same recursion out a second time to get them.
 */
export function testFilesUnder(folder: string, matching = /\.test\.tsx?$/): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return testFilesUnder(path, matching)
    return matching.test(entry.name) ? [path] : []
  })
}

/**
 * Every test under `folder` that reads the tree, walked from disk rather than asked of git.
 *
 * A guard written minutes ago and not yet staged is exactly the one a short loop must not drop in
 * silence: measured on 2026-08-13, `git ls-files` answered 572 test files where the disk held 573,
 * and the missing one was a guard.
 *
 * Here rather than in the script, so the run and the test that guards it count the same set —
 * two walks would drift, and the drift would show as a floor that passes while the loop skips.
 */
export function wideGuardsUnder(folder: string): string[] {
  return testFilesUnder(folder).filter(path => readsTheTree(readFileSync(path, 'utf8'), path))
}
