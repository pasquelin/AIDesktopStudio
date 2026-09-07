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
  it('resolves every static import it walks', () => {
    const { unresolved, files, packages } = GRAPH

    expect([...unresolved]).toEqual([])
    expect(packages).toContain('react')
    expect(packages).toContain('dockview-react')
    expect(files).toContain('./features/shell/components/toolComponents.ts')
    expect(files).toContain('../../shared/domain/tool.ts')
    // Deep anchors, both of them the first screen itself: the walk has to reach past the entry
    // point and past the shell, or every negative assertion below passes on an empty graph.
    expect(files).toContain('./features/shell/components/Shell/Shell.tsx')
    expect(files).toContain('./features/home/components/HomeView/HomeView.tsx')
  })

  // Deferred by `Generator.tsx` on 8 August: −219,38 kB, three quarters of it zod.
  it('never reaches the generation form, nor what validates it', () => {
    const { files } = GRAPH

    expect(files).not.toContain('./components/DynamicForm/DynamicForm.tsx')
    expect(files).not.toContain('./helpers/dynamicFormSchema.ts')
  })

  it('never reaches the form libraries', () => {
    const { packages } = GRAPH

    expect(packages).not.toContain('zod')
    expect(packages).not.toContain('react-hook-form')
    expect(packages).not.toContain('@hookform/resolvers')
  })

  // Deferred by `engines/core/fonts.ts` on 8 August: −483,56 kB. Same property, same guard.
  it('never reaches the font parser', () => {
    const { packages } = GRAPH

    expect(packages).not.toContain('opentype.js')
  })

  // Deferred by `main.tsx` on 9 August: −48,38 kB, preloads counted. The registry, the search
  // over it and the draft store all came along for the ride.
  it('never reaches the settings window', () => {
    const { files } = GRAPH

    // The whole folder, not a sample of it: naming files lets a sibling — `AccountSettings`
    // reused by an onboarding, say — walk back in with the guard still green.
    expect(deferredUnder('./features/settings/')).toEqual([])
    expect(files).not.toContain('./stores/settingsDraft.ts')
    expect(files).not.toContain('../../shared/domain/settingsRegistry.ts')
    expect(files).not.toContain('../../shared/domain/settingsSearch.ts')
  })

  it('never reaches the welcome window', () => {
    expect(deferredUnder('./features/welcome/')).toEqual([])
    expect(GRAPH.files).not.toContain('./engines/welcome/WelcomeBackdrop.ts')
  })

  /**
   * The handler table reaches all fourteen families — the canvas, the scene, the rig, git, the
   * timeline — for a door that is off by default and never called at launch. `remoteActions.ts`
   * imports it on the call for that reason, and this is what keeps the edge dynamic.
   */
  it('never reaches the action handlers, which the MCP door loads on its first call', () => {
    const { files } = GRAPH

    expect([...files].filter(path => path.endsWith('Handlers.ts')).sort()).toEqual([])
    expect(files).not.toContain('./features/assistant/executor.ts')
  })

  // The heaviest row of the table, and the one that was described but never held: six editors,
  // megabytes between them, of which a session opens one or two.
  it('never reaches an editor', () => {
    const { files } = GRAPH

    const editors = [
      './features/image/components/ImageDocument/ImageDocument.tsx',
      './features/scene/components/Scene/Document/SceneDocument.tsx',
      './features/video/components/SequenceDocument.tsx',
      './features/audio/components/AudioDocument.tsx',
      './features/skybox/components/Skybox/Document/SkyboxDocument.tsx',
      './features/material/components/Material/MaterialDocument.tsx',
    ]

    expect(editors.filter(editor => files.has(editor))).toEqual([])
  })

  /**
   * What still comes out of the editors' folders, and it is never an editor: something the first
   * screen does reach for a helper that happens to live next to one. Four of the six left when
   * the panels went lazy — they came in through a panel, not through the shell.
   *
   * A budget rather than a ban — the list is allowed to shrink, never to grow, and one entry more
   * means something on the first screen reached further than it needed.
   *
   * The dictation's three arrived on 2026-08-31 without the first screen changing: the case read
   * `./spaces/` alone, and they sat under `./dictation/`. Widening the reading is what put them
   * in; they are the microphone of the composer, which is on the first screen.
   */
})
