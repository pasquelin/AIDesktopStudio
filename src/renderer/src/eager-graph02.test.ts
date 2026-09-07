import { describe, expect, it } from 'vitest'

/**
 * What the first screen has to evaluate, walked from the entry point through STATIC imports only.
 *
 * Reading one file's text proves nothing here: what matters is what lands in the opening chunk,
 * and `import { X as Y }`, a multi-line specifier list, a sibling module importing the same thing,
 * or a `zod/v4` subpath all put it back while the file under watch stays untouched.
 *
 * Sources come from Vite rather than from `node:fs`: the renderer project carries no Node types.
 *
 * Lazy, and walked below at module load: the loaders read only the 307 sources the graph reaches,
 * where `eager` would read all 741 the globs match.
 */

const SOURCES: Record<string, () => Promise<string>> = {
  ...import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../shared/**/*.ts', { query: '?raw', import: 'default' }),
}

const ALIASES: readonly [string, string][] = [
  ['@/', './'],
  ['@shared/', '../../shared/'],
]

const EXTENSIONS = ['.ts', '.tsx']

/** Leaves, not modules: a stylesheet, a worker URL and a JSON bundle import nothing further. */
const NOT_MODULES = /\.(css|json)($|\?)|\?worker|\?raw|\?url/

/** `import … from 'x'` and `export … from 'x'`, but never `import type` nor `await import(`. */
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g

/**
 * Collapses `.` and `..` into the exact spelling the glob uses — `./a/b` inside the renderer,
 * `../../shared/…` outside it. Prefixing a leading `..` with `./` is what hid the whole of
 * `src/shared` from an earlier version of this walker: 104 edges dropped, every test still green.
 */
function normalise(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..' && parts.length > 0 && parts.at(-1) !== '..') parts.pop()
    else parts.push(part)
  }
  const joined = parts.join('/')
  return joined.startsWith('..') ? joined : `./${joined}`
}

function folderOf(key: string): string {
  return key.slice(0, key.lastIndexOf('/'))
}

/**
 * The key the glob knows this module by. A folder import lands on its `index`, and what it
 * imports next is relative to THAT file — resolving to the folder sends every specifier below
 * it into the void.
 */
function keyOf(candidate: string): string | null {
  const base = normalise(candidate)
  for (const path of [base, ...EXTENSIONS.flatMap(ext => [base + ext, `${base}/index${ext}`])]) {
    if (path in SOURCES) return path
  }
  return null
}

function specifierKey(specifier: string, from: string): string | null {
  for (const [prefix, target] of ALIASES) {
    if (specifier.startsWith(prefix)) return keyOf(target + specifier.slice(prefix.length))
  }
  return specifier.startsWith('.') ? keyOf(`${folderOf(from)}/${specifier}`) : null
}

function isLocal(specifier: string): boolean {
  return specifier.startsWith('.') || ALIASES.some(([prefix]) => specifier.startsWith(prefix))
}

/** `@scope/name`, so a subpath cannot dodge the assertion — `zod/v4` is still zod. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/')
  const scoped = specifier.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)
  return scoped.join('/')
}

type Graph = {
  packages: Set<string>
  files: Set<string>
  /** Local specifiers no key could be found for. Any of them is a branch walked off silently. */
  unresolved: Set<string>
}

/** Every package and every source file the entry point reaches without an `import()`. */
async function walk(): Promise<Graph> {
  const packages = new Set<string>()
  const files = new Set<string>()
  const unresolved = new Set<string>()
  const queue: string[] = ['./features/shell/components/main.tsx']

  while (queue.length > 0) {
    const key = queue.pop()
    if (key === undefined || files.has(key)) continue
    const load = SOURCES[key]
    if (load === undefined) continue
    files.add(key)

    for (const match of (await load()).matchAll(STATIC_IMPORT)) {
      const specifier = match[1]
      if (specifier === undefined || NOT_MODULES.test(specifier)) continue
      if (!isLocal(specifier)) {
        packages.add(packageOf(specifier))
        continue
      }

      const next = specifierKey(specifier, key)
      if (next === null) unresolved.add(`${key} → ${specifier}`)
      else queue.push(next)
    }
  }

  return { packages, files, unresolved }
}

/**
 * Where the panels live, DERIVED so the case below cannot go quiet over an empty prefix.
 *
 * `./panels/` was the whole answer until the panels moved under `features/<f>/components/`: a
 * fixed prefix then matched fewer of them at every lot, and the case read a shorter and shorter
 * list while staying green. `./panels/` no longer exists at all. The shell and the home are not
 * panels — their components ARE the first screen, which is what the whole file is about.
 */
const FIRST_SCREEN: readonly string[] = ['./features/home/', './features/shell/']

const drawsTheFirstScreen = (path: string): boolean =>
  FIRST_SCREEN.some(feature => path.startsWith(feature))

const PANEL_TREES: readonly string[] = [
  ...new Set(
    Object.keys(SOURCES)
      .map(key => /^\.\/features\/[^/]+\/components\//.exec(key)?.[0])
      .filter((tree): tree is string => tree !== undefined && !drawsTheFirstScreen(tree)),
  ),
]

/**
 * A module at the ROOT of a feature: the helper an editor keeps beside its components, which is
 * exactly what the neighbours case below counts. `./spaces/` said this until the editors moved.
 */
const FEATURE_MODULE = /^\.\/features\/[^/]+\/[^/]+\.tsx?$/

/**
 * Walked here rather than inside a case: the nine below ask the same question of the same tree,
 * and the first of them carried the whole reading on its own clock — 543 ms at best, 3 890 ms
 * on a machine at load 44, against a budget it cannot see. Module load is not timed, so a walk
 * that throws fails the file rather than the case; the nine now share one graph, 1 to 2 ms for
 * all of them.
 */
const GRAPH = await walk()

/**
 * What the chunk holds under a prefix — the prefix checked to still NAME something, since one that
 * names nothing filters nothing and reads exactly as green. `./settings/`, `./licences/` and
 * `./usage/` all went silent that way the day the tree became the features'.
 */
function deferredUnder(prefix: string): string[] {
  expect(Object.keys(SOURCES).some(key => key.startsWith(prefix))).toBe(true)

  return [...GRAPH.files].filter(path => path.startsWith(prefix))
}

describe('the opening chunk', () => {
  /**
   * The assertion that makes the others mean something. Twice now a resolution failed in silence
   * and took a whole subtree with it — a folder import that never found its `index`, then every
   * `@shared/*` at once — while the negative assertions below sailed through. A dropped edge is
   * a hole in the guard, so it is the guard's first failure.
   */
  it('pulls only these sixteen neighbours out of the features', () => {
    const { files } = GRAPH

    const neighbours = [...files].filter(
      path => FEATURE_MODULE.test(path) && !drawsTheFirstScreen(path),
    )

    expect(neighbours.sort()).toEqual([
      // The assistant's eleven, same day and same cause: the chat toast is on the first screen,
      // and everything it composes a turn with came in behind it, unseen under `./assistant/`.
      './features/assistant/batch.ts',
      './features/assistant/chatPanel.ts',
      './features/assistant/choices.ts',
      './features/assistant/confirm.ts',
      './features/assistant/confirmSentence.ts',
      './features/assistant/holdConfirmer.ts',
      './features/assistant/noteAssistant.ts',
      './features/assistant/remoteActions.ts',
      './features/assistant/starters.ts',
      './features/assistant/thoughtStream.ts',
      './features/assistant/wireConsent.ts',
      './features/dictation/capture.ts',
      './features/dictation/destination.ts',
      './features/dictation/insertAtCaret.ts',
      './features/image/canvasHosts.ts',
      './features/image/placeAsset.ts',
    ])
  })

  /**
   * Deferred by `features/shell/components/toolComponents.ts` on 9 August: every panel of the
   * table, the home screen's own included. Stated over the whole folder, so a panel added
   * tomorrow cannot land eager with the guard still green.
   *
   * The three left are reached for something other than a zone: the jobs list and its row
   * ARE a panel of the table since 11 August — but they are also what the status bar's flyout
   * opens (`app/JobsStatus.tsx:10`), which is the first screen, so the chunk holds them either
   * way. That is why `Jobs.tsx` may not read `helpers/toolRegistry`: it would drag the scene's
   * node kinds in behind it.
   *
   * The assets' `facets.ts` was the fourth until 24 August, pulled in by `revealAssetsOfKind`
   * — a function nothing called, deleted with the six other unread values. The budget shrank on
   * its own, which is what a budget that may only shrink is for.
   */
  it('reaches no panel of the tool table, except the list the status bar itself opens', () => {
    const { files } = GRAPH

    expect(
      [...files].filter(path => PANEL_TREES.some(tree => path.startsWith(tree))).sort(),
    ).toEqual([
      // The conversation of the assistant, on the first screen because its toast is — read for
      // the first time on 2026-08-31, when the tree became the features'.
      './features/assistant/components/Assistant/AssistantStatus.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversation.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationGauge.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationPicker.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationQuestion.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationStep.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationSuggestions.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationTurn.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationView.tsx',
      './features/assistant/components/Assistant/Conversation/AssistantConversationWorking.tsx',
      './features/assistant/components/Assistant/Conversation/Choice/AssistantConversationChoice.tsx',
      './features/assistant/components/Assistant/Conversation/Choice/AssistantConversationChoiceForm.tsx',
      './features/assistant/components/Assistant/Conversation/conversation.ts',
      './features/assistant/components/Assistant/Conversation/conversationStyles.ts',
      './features/assistant/components/Assistant/Toast/AssistantToast.tsx',
      './features/assistant/components/Assistant/Toast/revealChat.ts',
      // The five of the dictation, on the first screen because the composer's microphone is:
      // invisible to this case while they sat under `./dictation/`, and read for the first time
      // the day the tree became the features'.
      './features/dictation/components/Dictation/DictationButton.tsx',
      './features/dictation/components/Dictation/Status/DictationStatus.tsx',
      './features/dictation/components/Dictation/Status/DictationStatusListening.tsx',
      './features/dictation/components/Heard.tsx',
      './features/dictation/components/LevelMeter.tsx',
      './features/generation/components/JobRow/JobRow.tsx',
      './features/generation/components/JobRow/JobRowDetail.tsx',
      './features/generation/components/Jobs.tsx',
    ])
  })

  // A file rather than a folder: the licences are one window, among the shell's own components.
  it('never reaches the licences window', () => {
    expect(deferredUnder('./features/shell/components/LicencesWindow')).toEqual([])
  })

  // The chart library is the reason this one is deferred, more than the window's own weight.
  // `formatUnits` used to be the exception that let the window's own `format.ts` in: a job row
  // prices a run in the units the window totals, and the status bar carries those rows. It is in
  // `helpers/format.ts` now, which the opening chunk already reaches — hence the second assertion,
  // without which moving it back would read as a win while only shifting the weight.
  it('never reaches the usage window, nor what draws its charts', () => {
    const { files, packages } = GRAPH

    expect(deferredUnder('./features/usage/')).toEqual([])
    expect(files).toContain('./helpers/format.ts')
    expect(packages).not.toContain('recharts')
  })
})
