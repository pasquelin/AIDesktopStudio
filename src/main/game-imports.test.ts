import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { SOURCE_ROOT, WHOLE_PROJECT, sourceFiles } from './sourceFiles'
import { testFilesUnder } from './wideGuards'

/**
 * 🛑 What `src/game` may reach, held at ZERO.
 *
 * The runtime has to run TWICE — inside the studio, and inside an exported game that ships none
 * of it. So nothing under `src/game` imports the studio: not the window, not the main process,
 * not React, not Electron, and not a node builtin a browser has never had. What a host needs
 * from the studio arrives as a PARAMETER, which is why `host/` gets no exception here.
 *
 * A ratchet, and it is the only thing holding this: the compiler, eslint and every other suite
 * are green on `import { useScenes } from '@/stores/scenes'` written inside `src/game`. Knip does
 * report an unused export of this tree — measured 2026-08-26, and not what the audit expected —
 * but it says nothing about where an import comes FROM.
 *
 * Suites are swept along with the sources: a test that reaches into the studio drags the whole
 * of it into a tree whose point is not to need it.
 */
const GAME = join(SOURCE_ROOT, 'game')

/** What only the studio uses. A third-party library is fine; the studio's own stack is not. */
const STUDIO_STACK = /^(react|react-dom|react-i18next|i18next|zustand|electron)(\/|$)/

const ALLOWED_ALIASES = ['@shared/', '@game/']

const FORBIDDEN_ALIASES = ['@/', '@main/']

/** Both spellings: `node:fs` and the bare `fs`, which no rule of this repository refuses. */
const NODE_BUILTINS = new Set(builtinModules)

/**
 * Every specifier of one file that leaves the tree, as `<file> -> <specifier>`.
 *
 * Relative paths are resolved textually rather than against the disk: what matters is where the
 * specifier POINTS, and a file that does not exist yet points somewhere all the same.
 */
function reachesOutOf(file: string, code: string): string[] {
  const said = (specifier: string): string => `${relative(SOURCE_ROOT, file)} -> ${specifier}`

  return ts.preProcessFile(code, true, true).importedFiles.flatMap(({ fileName }) => {
    const bare = fileName.split('?')[0] ?? fileName
    if (bare.startsWith('.')) {
      const target = resolve(dirname(file), bare)
      return target.startsWith(GAME + sep) ? [] : [said(fileName)]
    }
    if (ALLOWED_ALIASES.some(alias => bare.startsWith(alias))) return []
    if (FORBIDDEN_ALIASES.some(alias => bare.startsWith(alias))) return [said(fileName)]
    const root = bare.split('/')[0] ?? bare
    const isNode = bare.startsWith('node:') || NODE_BUILTINS.has(root)
    return isNode || STUDIO_STACK.test(bare) ? [said(fileName)] : []
  })
}

/**
 * 🛑 What a SHIPPED file takes from `@shared/`, when it is not a type.
 *
 * `src/game` is MIT and the rest of the repository is PolyForm Noncommercial — that carve-out is
 * what makes an exported game its author's to sell, and it holds only while nothing here carries
 * another tree's code into the bundle. A type is gone by compile time; a value is not.
 *
 * Suites are out: a test ships nowhere, and reading a shared constant to assert against is fair.
 */
function valuesTakenFromShared(file: string, code: string): string[] {
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true)

  return parsed.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement)) return []
    const from = statement.moduleSpecifier
    if (!ts.isStringLiteral(from) || !from.text.startsWith('@shared/')) return []

    const said = [`${relative(SOURCE_ROOT, file)} -> ${from.text}`]
    // No clause at all is `import '@shared/x'`, which runs the module for its side effects.
    const clause = statement.importClause
    if (!clause) return said
    if (clause.isTypeOnly) return []

    const bindings = clause.namedBindings
    const named = bindings && ts.isNamedImports(bindings) ? bindings.elements : undefined
    return !clause.name && named && named.every(element => element.isTypeOnly) ? [] : said
  })
}

/** The window's bridge, reached through the global rather than through an import. */
const usesTheBridge = (code: string): boolean => /\bwindow\.studio\b/.test(code)

const gameFiles = (): string[] => testFilesUnder(GAME, /\.tsx?$/)

describe('what the game runtime may reach', () => {
  it(
    'imports nothing of the studio, from any of its files',
    () => {
      const found = gameFiles().flatMap(file => reachesOutOf(file, readFileSync(file, 'utf8')))

      expect(found.sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )

  it(
    'takes no VALUE from the shared tree, which is under other terms',
    () => {
      const found = sourceFiles(GAME).flatMap(file =>
        valuesTakenFromShared(file, readFileSync(file, 'utf8')),
      )

      expect(found.sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )

  it('reaches the studio through no global either', () => {
    const found = gameFiles().filter(file => usesTheBridge(readFileSync(file, 'utf8')))

    expect(found.map(file => relative(SOURCE_ROOT, file))).toEqual([])
  })

  /**
   * An empty result proves nothing unless the files were opened. A floor rather than a tally: it
   * separates « the walk works » from « the walk found one file ».
   */
  it('opened the tree to say so', () => {
    expect(gameFiles().length).toBeGreaterThan(20)
  })

  /** And it can fail — the four spellings that leave the tree, and the three that do not. */
  it('would see the studio reached for, however it was spelt', () => {
    const from = join(GAME, 'host', 'studioHost.ts')

    expect(reachesOutOf(from, "import { useScenes } from '@/stores/scenes'")).toEqual([
      'game/host/studioHost.ts -> @/stores/scenes',
    ])
    expect(reachesOutOf(from, "import { log } from '@main/log'")).toEqual([
      'game/host/studioHost.ts -> @main/log',
    ])
    expect(reachesOutOf(from, "import { memo } from 'react'")).toEqual([
      'game/host/studioHost.ts -> react',
    ])
    expect(reachesOutOf(from, "import { readFile } from 'node:fs/promises'")).toEqual([
      'game/host/studioHost.ts -> node:fs/promises',
    ])
    // The bare spelling of a builtin, which nothing else in this repository refuses.
    expect(reachesOutOf(from, "import { readFileSync } from 'fs'")).toEqual([
      'game/host/studioHost.ts -> fs',
    ])
    expect(reachesOutOf(from, "import { x } from '../../renderer/src/stores/scenes'")).toEqual([
      'game/host/studioHost.ts -> ../../renderer/src/stores/scenes',
    ])

    expect(reachesOutOf(from, "import type { Ref } from '@shared/domain/ref'")).toEqual([])
    expect(reachesOutOf(from, "import { createRingLog } from './ringLog'")).toEqual([])
    expect(reachesOutOf(from, "import Jolt from 'jolt-physics/wasm-compat'")).toEqual([])
  })

  /** And so can the other half: three spellings that carry code, and two that carry nothing. */
  it('would see a value taken from the shared tree', () => {
    const from = join(GAME, 'host', 'studioHost.ts')
    const taken = ['game/host/studioHost.ts -> @shared/domain/asset']

    expect(valuesTakenFromShared(from, "import { assetUrl } from '@shared/domain/asset'")).toEqual(
      taken,
    )
    expect(valuesTakenFromShared(from, "import '@shared/domain/asset'")).toEqual(taken)
    expect(
      valuesTakenFromShared(from, "import { type Asset, assetUrl } from '@shared/domain/asset'"),
    ).toEqual(taken)

    expect(
      valuesTakenFromShared(from, "import type { Asset } from '@shared/domain/asset'"),
    ).toEqual([])
    expect(
      valuesTakenFromShared(from, "import { type Asset } from '@shared/domain/asset'"),
    ).toEqual([])
  })
})

/** The interface core, which is held to more than the tree around it. */
const GAME_UI = join(GAME, 'ui')

/**
 * 🛑 The names a browser hands out, refused under `src/game/ui`.
 *
 * The core computes a layout and holds a runtime; what DRAWS one lives in `host/`, beside
 * `domInput.ts`. Reading the DOM here would tie the model to one renderer and make a Pixi or a
 * world-space one impossible without rewriting it — the frontier `uiRenderPort` exists to keep.
 *
 * The names are refused as identifiers, DECLARATIONS included: a parameter called `document` is
 * turned away too. A shadow is legal TypeScript and this costs a rename, where telling one from
 * the global needs a checker — and a rule nobody can read is a rule nothing holds.
 *
 * 🛑 **Its blind spot, in clear: an element reached by a STRING passes.** `globalThis['document']`
 * is a literal, not an identifier, so nothing here sees it. The roots are refused instead —
 * `globalThis` and `self` are on the list — which leaves only a host object handed IN as a
 * parameter, and that is the frontier `uiRenderPort` draws rather than a leak.
 */
const BROWSER_NAMES = new Set([
  'document',
  'window',
  'navigator',
  'globalThis',
  'self',
  'HTMLElement',
  'CanvasRenderingContext2D',
])

type NamesAProperty = ts.PropertyAccessExpression | ts.PropertyAssignment | ts.PropertySignature

const namesAProperty = (node: ts.Node): node is NamesAProperty =>
  ts.isPropertyAccessExpression(node) ||
  ts.isPropertyAssignment(node) ||
  ts.isPropertySignature(node)

/** Identifiers off the AST, so a name inside a comment or a string counts for nothing. */
function browserNamesIn(file: string, code: string): string[] {
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true)
  const found = new Set<string>()

  const walk = (node: ts.Node): void => {
    // A property is somebody else's name — `style.document` says nothing about the browser, and
    // neither does the `document` field a `UiFrame` carries. A SHORTHAND is not one of these:
    // `{ document }` names the global. `parent` is undefined on the source file itself.
    const named = node.parent !== undefined && namesAProperty(node.parent)
    const isProperty = named && node.parent.name === node

    if (ts.isIdentifier(node) && BROWSER_NAMES.has(node.text) && !isProperty) found.add(node.text)
    ts.forEachChild(node, walk)
  }
  walk(parsed)

  return [...found].map(name => `${relative(SOURCE_ROOT, file)} -> ${name}`)
}

describe('what the interface core may reach', () => {
  it('names nothing a browser hands out', () => {
    const found = testFilesUnder(GAME_UI, /\.tsx?$/).flatMap(file =>
      browserNamesIn(file, readFileSync(file, 'utf8')),
    )

    expect(found.sort()).toEqual([])
  })

  it('opened the core to say so', () => {
    expect(testFilesUnder(GAME_UI, /\.tsx?$/).length).toBeGreaterThan(0)
  })

  /** And it can fail — three spellings that name the browser, and three that do not. */
  it('would see the browser named, however it was spelt', () => {
    const from = join(GAME_UI, 'uiLayout.ts')
    const said = (name: string): string[] => [`game/ui/uiLayout.ts -> ${name}`]

    expect(browserNamesIn(from, 'const host = document.body')).toEqual(said('document'))
    expect(browserNamesIn(from, 'export function measure(host: HTMLElement) {}')).toEqual(
      said('HTMLElement'),
    )
    expect(browserNamesIn(from, 'const wide = window.innerWidth')).toEqual(said('window'))

    expect(browserNamesIn(from, "const host = globalThis['document']")).toEqual(said('globalThis'))

    // A shorthand IS the global, however it looks like a field.
    expect(browserNamesIn(from, 'const frame = { document }')).toEqual(said('document'))

    expect(browserNamesIn(from, '// the document this reads')).toEqual([])
    expect(browserNamesIn(from, "const said = 'window'")).toEqual([])
    expect(browserNamesIn(from, 'const held = state.document')).toEqual([])
    expect(browserNamesIn(from, 'const frame = { document: read }')).toEqual([])
    expect(browserNamesIn(from, 'type Frame = { document: UiDocument }')).toEqual([])
  })
})

/**
 * 🛑 The names that MEASURE a live tree, refused in the renderer that draws interfaces.
 *
 * The boxes `layoutOf` computes are the only geometry of an interface. A renderer reading one
 * back would make the model depend on a browser, leave a world-space renderer with no answer,
 * and put the editor's snapping one frame behind the pointer — so `pick` resolves from the
 * boxes alone, and this is what keeps it that way.
 *
 * Its blind spot, in clear: a property reached by a STRING passes. Named on the file rather
 * than on the folder, so `domInput.ts` may go on reading a pointer's `clientX` next door — and
 * the file is asserted to EXIST, a rename otherwise leaving this guard quietly measuring nothing.
 */
const MEASURING_NAMES = new Set([
  'getBoundingClientRect',
  'getClientRects',
  'elementFromPoint',
  'elementsFromPoint',
  'getComputedStyle',
  'offsetWidth',
  'offsetHeight',
  'offsetLeft',
  'offsetTop',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',
])

/** Identifiers off the AST, properties INCLUDED — that is where every one of these is read. */
function measuringNamesIn(code: string): string[] {
  const parsed = ts.createSourceFile('x.ts', code, ts.ScriptTarget.ESNext, true)
  const found = new Set<string>()

  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && MEASURING_NAMES.has(node.text)) found.add(node.text)
    ts.forEachChild(node, walk)
  }
  walk(parsed)

  return [...found].sort()
}

describe('what the interface renderer may read back', () => {
  const RENDERER = join(GAME, 'host', 'domUiRenderer.ts')

  it('measures nothing of the tree it drew', () => {
    expect(measuringNamesIn(readFileSync(RENDERER, 'utf8'))).toEqual([])
  })

  it('would see a measurement, however it was reached', () => {
    expect(measuringNamesIn('const box = node.getBoundingClientRect()')).toEqual([
      'getBoundingClientRect',
    ])
    expect(measuringNamesIn('const wide = host.offsetWidth')).toEqual(['offsetWidth'])

    expect(measuringNamesIn('// the rect this would read')).toEqual([])
    expect(measuringNamesIn("const said = 'offsetWidth'")).toEqual([])
  })
})
