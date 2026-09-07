import { readFileSync } from 'node:fs'
import { basename, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROJECT_TREES, SOURCE_ROOT, WHOLE_PROJECT, sourceFiles } from './sourceFiles'
import { testFilesUnder } from './wideGuards'

/**
 * How a source file is named, and where it sits. Decided 2026-08-17; nothing held it before, and
 * three conventions had grown side by side — 324 camelCase, 307 kebab-case, 225 PascalCase.
 *
 * **A capital is earned by what the file HANDS OUT, not by what it happens to declare.** A file
 * named `CanvasEngine.ts` must export a component or a class called `CanvasEngine`; everything
 * else is camelCase. So the case of a name says what is behind it, which is the whole point of
 * picking one — and the rule reads the same in both directions, which is what makes it checkable.
 *
 * That phrasing was reached by measuring, not by reasoning. « Exports a class » was the first
 * try, and it demanded a capital for `main/project/store.ts`, which exports `NoProjectError`
 * among its functions: **an error class is a detail of a module, never what names a file.**
 * Requiring the name to MATCH is what tells the two apart, and it dropped six false findings.
 *
 * A hook lives in `hooks/useItsOwnName.ts`, wherever its caller does. And a `.tsx` holds ONE
 * component: a second one that grows there is a file waiting to be written, and its parent's
 * folder is where it goes.
 */
const RULE = 'a capital is earned by exporting a component or a class of that name'

/** `.d.ts` names the module it declares, not a module of ours: `sherpa-onnx-node` is a package. */
const isDeclaration = (path: string): boolean => path.endsWith('.d.ts')

/** The segment before the first dot — `audio.worker.ts` is named `audio`, and that is camelCase. */
const stem = (path: string): string => basename(path).split('.')[0] ?? ''

const isCamelCase = (name: string): boolean => /^[a-z][a-zA-Z0-9]*$/.test(name)
const isPascalCase = (name: string): boolean => /^[A-Z][a-zA-Z0-9]*$/.test(name)

/**
 * Every component or class a file declares, by name, deduplicated.
 *
 * Four spellings, and the deduplication is why: `export const LayerRow = memo(function LayerRow(`
 * declares one thing and matches two of them. They demand a lowercase second letter, which keeps
 * `TONES` and `GLYPHS` out — a constant is not a component. Classes are in: `ErrorBoundary` is
 * one, because `getDerivedStateFromError` still has no hook equivalent in React 19.
 */
function componentsIn(code: string): Set<string> {
  const declared = [
    ...code.matchAll(/(?:^|\n)(?:export )?(?:default )?function ([A-Z][a-z]\w*)/g),
    ...code.matchAll(/(?:^|\n)(?:export )?const ([A-Z][a-z]\w*) = (?:\(|memo|forwardRef)/g),
    ...code.matchAll(/(?:^|\n)(?:export )?(?:abstract )?class ([A-Z][a-z]\w*)/g),
    ...code.matchAll(/= memo\(function ([A-Z][a-z]\w*)/g),
  ]

  // `?? ''`: the group is filled whenever the pattern matched, which the type cannot know.
  return new Set(declared.map(match => match[1] ?? ''))
}

/**
 * Whether the file hands out a component or a class under `name` — a TYPE of that name does not
 * count. `GpuPipeline.ts` exports `type GpuPipeline` and `createGpuPipeline`, which makes it a
 * module with a well-named type, not a file whose subject is a class.
 */
function handsOut(code: string, name: string): boolean {
  return new RegExp(
    `(?:^|\\n)export (?:default )?(?:function|(?:abstract )?class|const) ${name}\\b|` +
      `(?:^|\\n)export (?:default )?const ${name} = memo\\(`,
  ).test(code)
}

/**
 * Every `use…` a file declares, exported or not, deduplicated — a private one is still a hook a
 * reader goes to `hooks/` to find, and `useAppliedSettings` had one.
 */
function hooksIn(code: string): Set<string> {
  const declared = [...code.matchAll(/(?:^|\n)(?:export )?(?:function|const) (use[A-Z]\w*)/g)]

  // `?? ''`: the group is filled whenever the pattern matched, which the type cannot know.
  return new Set(declared.map(match => match[1] ?? ''))
}

/** Whether the file IS `hooks/<name>.ts` — the promise the name of a hook file makes. */
function isFileOf(path: string, name: string): boolean {
  return (
    path.endsWith(`${sep}hooks${sep}${name}.ts`) || path.endsWith(`${sep}hooks${sep}${name}.tsx`)
  )
}

/**
 * A store is exempt from PLACEMENT, and it is the only thing that is.
 *
 * `useProject` is not a hook, it is the store itself — `create()` hands back something a component
 * subscribes to, and forty of them would have to move into `hooks/` under names nobody looks for
 * them by. The selectors written beside one are exempt for the same reason: `useHomeVisible` is
 * `homeIsVisible` subscribed, and the two halves of one answer belong in one file.
 *
 * The angle blind here, in clear: a real hook written under `stores/` is not reported as
 * MISPLACED. Decided 2026-08-17 — it is the price of not splitting every store from its own
 * selectors. Its NAME is held all the same, by the guard below, which exempts nothing.
 */
const isStore = (path: string): boolean => path.includes(`${sep}stores${sep}`)

const projectSources = PROJECT_TREES.flatMap(tree => sourceFiles(tree)).filter(
  path => !isDeclaration(path),
)

/** Read once: both guards below ask the same question of the same 1 300 files. */
const hooksByFile: [string, Set<string>][] = projectSources.map(path => [
  path,
  hooksIn(readFileSync(path, 'utf8')),
])

/**
 * The benchmarks, which `sourceFiles` drops along with the suites — and which nothing else was
 * reading, so `scene-picking.bench.ts` sat in kebab-case for as long as it existed without a
 * single guard noticing. A bench is production code that happens to be timed: it names a module
 * of the tree and follows the same rule.
 *
 * **Suites and fixtures stay out, and that is a decision rather than an oversight.** On the
 * LENIENT reading — camelCase or PascalCase accepted, only kebab and snake refused — 46 suites and
 * 35 fixtures are off-convention today; the strict rule below would refuse far more, and it has no
 * business judging a test, which never hands out what it tests. Most of them are named for a RULE
 * rather than for a module (`no-hardcoded-text.test.ts`), and renaming them would break every
 * `vi.mock('./x')` resolved from the file that moves — paid for twice here. A lot to be arbitrated,
 * not a line to slip into this guard.
 */
const benchFilesUnder = (tree: string): string[] => testFilesUnder(tree, /\.bench\.tsx?$/)

const reported = (path: string): string => relative(SOURCE_ROOT, path)

describe(`file names — ${RULE}`, () => {
  /**
   * Counted rather than listed while it emptied, because listing paths about to change would have
   * tied the guard to them. Fifteen lots took it to zero, so the count is gone and this reads as
   * the rule itself — the next off-convention file fails on sight.
   */
  it(
    'holds every name to the case its exports earn',
    () => {
      const swept = [...projectSources, ...PROJECT_TREES.flatMap(tree => benchFilesUnder(tree))]
      const wrong = swept.filter(path => {
        const name = stem(path)

        return isPascalCase(name) ? !handsOut(readFileSync(path, 'utf8'), name) : !isCamelCase(name)
      })

      expect(wrong.map(reported).sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )

  /**
   * A hook lives in `hooks/useItsOwnName.ts`, and nowhere else. `hooks/` is the one place a
   * reader looks for one, and twelve of them were somewhere else the day this rule landed — five
   * under `panels/inspector`, three under `spaces/audio`.
   *
   * Read on the file's NAME alone, that rule was blind on both sides, and both were paid for.
   * Twenty-one hooks were declared in files named for something else — three in `design/virtual`,
   * two in `helpers/planAccess`, five under `panels/assets` — and a reader had no way to find
   * them. And two files under `hooks/` carried a second hook whose name was not theirs, so
   * `useHeldCommand` was imported from `useShortcuts` and `useUsageEvents` from `useUsageReport`.
   *
   * So it reads the DECLARATIONS. Every `use[A-Z]` a project file declares must sit under
   * `hooks/`, in the file of its own name — one hook, one file, found by the name it is called by.
   */
  it(
    'gives every hook a file of its own name under hooks',
    () => {
      const misplaced = hooksByFile
        .filter(([path]) => !isStore(path))
        .flatMap(([path, names]) =>
          [...names]
            .filter(name => !isFileOf(path, name))
            .map(name => `${reported(path)} declares ${name}`),
        )

      expect(misplaced.sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )
})

describe('hook names', () => {
  /**
   * One `use…` name, one declaration — stores INCLUDED, and that is what the guard above cannot
   * say: it exempts `stores/` before it compares, so a store and a hook both answered to
   * `useDictation`. An auto-import picks whichever it finds first, and the two are not one shape.
   */
  it(
    'lets one name answer for one hook',
    () => {
      const byName = new Map<string, string[]>()
      for (const [path, names] of hooksByFile)
        for (const name of names) byName.set(name, [...(byName.get(name) ?? []), reported(path)])

      const shared = [...byName]
        .filter(([, paths]) => paths.length > 1)
        .map(([name, paths]) => `${name}: ${paths.sort().join(', ')}`)

      expect(shared.sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )

  /**
   * One component per file — counted whether the extra one is exported or not. A private
   * sub-component is exactly the case this is about: it is invisible from outside, so nothing
   * else would ever report it, and it is how a 40-line file becomes a 400-line one.
   *
   * Declarations, not exports, and that is the one place the two questions part ways: what names
   * a file is what it hands out, but what crowds a file is what lives in it.
   *
   * Its count went the way the hooks' did — 46 the day this guard landed, then zero eight lots
   * later — so the assertion is the rule itself, and the next crowded file fails on sight.
   */
  it(
    'gives every component a file of its own',
    () => {
      const crowded = projectSources.filter(
        path => path.endsWith('.tsx') && componentsIn(readFileSync(path, 'utf8')).size > 1,
      )

      expect(crowded.map(reported).sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )
})
