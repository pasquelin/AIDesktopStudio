import { readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { PROJECT_TREES, SOURCE_ROOT, sourceFiles, WHOLE_PROJECT } from './sourceFiles'

const MAIN = dirname(fileURLToPath(import.meta.url))

const SHOWS_TEXT = new Set([
  'showMessageBox',
  'showMessageBoxSync',
  'showErrorBox',
  'showOpenDialog',
  'showSaveDialog',
  'showOpenDialogSync',
  'showSaveDialogSync',
  'Notification',
])

const READ_FIELDS = new Set([
  'body',
  'buttonLabel',
  'buttons',
  'checkboxLabel',
  'detail',
  'message',
  'name',
  'subtitle',
  'title',
])

/**
 * One parse per file for the two guards that walk the whole project — the registries and the
 * bindings. Parsing 706 files twice took this file past the shared 15 s timeout the moment the
 * machine was busy; 2.5 s when idle, and nothing in the result changed.
 *
 * The dialog and menu checks below do NOT use it: they read `main` alone, they were here first,
 * and routing them through a cache they never needed would say this file has one invariant when
 * it has an optimisation.
 */
const parsedByPath = new Map<string, ts.SourceFile>()

function parsedFile(absolute: string, shown: string): ts.SourceFile {
  const cached = parsedByPath.get(absolute)
  if (cached !== undefined) return cached

  const source = ts.createSourceFile(
    shown,
    readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(shown),
  )
  parsedByPath.set(absolute, source)
  return source
}

/**
 * Fields a registry fills for something on screen to read out. `name` is absent on purpose: a
 * scene node carries one as document data — a scene whose contents are called `Groupe` in French
 * could not be shared with an English studio — and a store carries one as its storage id.
 * `message` is absent for the same kind of reason: it names a worker's failure, never a screen.
 */
const REGISTRY_FIELDS = new Set([
  'buttonLabel',
  'caption',
  'description',
  'emptyLabel',
  'heading',
  'hint',
  'label',
  'legend',
  'placeholder',
  'summary',
  'title',
  'tooltip',
])

/**
 * A key, not a word. Registries hand `label: 'skybox.exposure'` to a component that resolves it,
 * which is the pattern to encourage — flagging it would push people back to writing the word.
 */
function isKey(text: string): boolean {
  return /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/.test(text)
}

function isWords(text: string): boolean {
  return /\p{Letter}{2}/u.test(text)
}

function registryFindingsIn(path: string, code: string): string[] {
  return registryFindingsFrom(ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true))
}

function registryFindingsFrom(source: ts.SourceFile): string[] {
  const path = source.fileName
  const findings: string[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      REGISTRY_FIELDS.has(node.name.getText(source)) &&
      ts.isStringLiteral(node.initializer) &&
      isWords(node.initializer.text) &&
      !isKey(node.initializer.text)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.initializer.getStart(source))
      findings.push(`${path}:${line + 1} ${node.name.getText(source)}="${node.initializer.text}"`)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

function calledName(node: ts.CallExpression | ts.NewExpression, source: ts.SourceFile): string {
  const target = node.expression
  if (ts.isPropertyAccessExpression(target)) return target.name.getText(source)
  return target.getText(source)
}

function findingsIn(path: string, code: string): string[] {
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true)
  const findings: string[] = []

  const inspect = (node: ts.Node, call: string): void => {
    if (ts.isPropertyAssignment(node) && READ_FIELDS.has(node.name.getText(source))) {
      const written = [
        node.initializer,
        ...(ts.isArrayLiteralExpression(node.initializer) ? node.initializer.elements : []),
      ]

      for (const value of written) {
        if (!ts.isStringLiteral(value) || value.text.trim() === '') continue
        const { line } = source.getLineAndCharacterOfPosition(value.getStart(source))
        findings.push(`${path}:${line + 1} ${call} ${node.name.getText(source)}="${value.text}"`)
      }
    }

    ts.forEachChild(node, child => inspect(child, call))
  }

  const visit = (node: ts.Node): void => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments !== undefined) {
      const call = calledName(node, source)
      if (SHOWS_TEXT.has(call)) {
        for (const argument of node.arguments) inspect(argument, call)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

/**
 * What a menu item shows. `accelerator` is deliberately absent: `Shift+CmdOrCtrl+R` is a key
 * spec Electron parses, not a word — and it is the one literal the menu writes today.
 */
const MENU_FIELDS = new Set(['label', 'sublabel', 'toolTip'])

/**
 * A menu is built from plain objects rather than passed to a call, so the dialog check above
 * cannot see it. It is the other surface with no component and no `t` of its own.
 */
function menuFindingsIn(path: string, code: string): string[] {
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true)
  const findings: string[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      MENU_FIELDS.has(node.name.getText(source)) &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text.trim() !== ''
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.initializer.getStart(source))
      findings.push(`${path}:${line + 1} ${node.name.getText(source)}="${node.initializer.text}"`)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

/**
 * The main process draws the one surface the bundles could be forgotten on: a native dialog has
 * no component and no `t`, so its wording is written where the call is. Everything it shows is
 * read from `TRANSLATIONS[windowLanguage()]` today, and this is what keeps it that way.
 *
 * Only literals written into the call itself are seen — a string reaching it through a variable
 * is beyond a check that reads one file at a time. That is the shape worth catching: the one
 * somebody types in a hurry.
 */
describe('the main process', () => {
  it('never writes the words a dialog shows', () => {
    const findings = sourceFiles(MAIN).flatMap(path =>
      findingsIn(relative(MAIN, path), readFileSync(path, 'utf8')),
    )

    expect(findings).toEqual([])
  })

  it('would see a message typed into the call', () => {
    const found = findingsIn(
      'probe.ts',
      "dialog.showMessageBox(window, { message: 'Discard your work?', buttons: ['Cancel', 'Discard'] })",
    )

    expect(found).toHaveLength(3)
  })

  it('never writes the words the native menu shows', () => {
    const findings = sourceFiles(MAIN).flatMap(path =>
      menuFindingsIn(relative(MAIN, path), readFileSync(path, 'utf8')),
    )

    expect(findings).toEqual([])
  })

  it('would see a label typed into a menu item', () => {
    const found = menuFindingsIn(
      'probe.ts',
      "const item = { label: 'Undo', accelerator: 'CmdOrCtrl+Z' }",
    )

    expect(found).toHaveLength(1)
  })

  it('leaves alone what the caller reads from a bundle, and what is not a word', () => {
    const quiet = [
      'dialog.showMessageBox(window, { message: t.discardTitle, buttons: [t.cancel, t.discard] })',
      "dialog.showSaveDialog({ defaultPath: 'scene.glb' })",
      "log.warn('renderer', { message: 'a technical line nobody reads on screen' })",
    ]

    expect(quiet.flatMap((code, index) => findingsIn(`probe${index}.ts`, code))).toEqual([])
  })
})

/**
 * The third guard, and the one that watches where nobody looks: a registry. A field descriptor,
 * a tool definition, a settings row is neither a component nor a native dialog, so the renderer's
 * JSX check never sees it and the two above do not either — and it is exactly where a label lives.
 *
 * It runs from here, of all places, because it reads the tree off the disk: `src/shared` is
 * compiled for the web as well, where `node:fs` has no types and no business being imported.
 *
 * Reading and parsing every file of the project is not a unit test's usual budget: 2.5 s idle,
 * and past the shared 15 s the moment a dozen other suites share the machine. `WHOLE_PROJECT`
 * comes from `sourceFiles.ts` with the sweep it belongs to, rather than being raised for
 * everyone — the rest of this file has no business taking that long.
 */
describe('the registries', () => {
  // Every tree but `main`, where the bound-sentence check below reads that one too: `main` writes
  // its screens through `TRANSLATIONS`, not through a registry. That it stops short is its own
  // question.
  const trees = PROJECT_TREES.slice(1)

  // The `slice` above is a POSITION, and a position is not a promise: reorder `PROJECT_TREES` and
  // this check silently stops reading `renderer` while every assertion below stays green. Named
  // rather than counted, because the count would survive the reorder. Asked for by the review.
  it('drops the main tree and keeps the others, whatever their order becomes', () => {
    expect(trees.map(tree => basename(tree))).toEqual(['renderer', 'shared', 'preload', 'game'])
  })

  it(
    'name their words rather than writing them',
    () => {
      const findings = trees.flatMap(tree =>
        sourceFiles(tree).flatMap(path =>
          registryFindingsFrom(parsedFile(path, relative(SOURCE_ROOT, path))),
        ),
      )

      expect(findings).toEqual([])
    },
    WHOLE_PROJECT,
  )

  // The check above read no `.tsx` at all until now, so a registry written beside the component
  // that renders it was invisible to all three guards — the renderer's own check only walks JSX,
  // and an array of rows declared above the component is not JSX. An empty result proves nothing
  // unless the files were opened, so this counts them.
  //
  // The number guards the regression that matters — narrowing the scan back to `.ts` drops it to
  // zero. It is a floor, not a tally: it will not notice a handful of components going missing.
  it('reads the components too, not only the modules beside them', () => {
    const scanned = trees.flatMap(tree => sourceFiles(tree))

    expect(scanned.filter(path => path.endsWith('.tsx')).length).toBeGreaterThan(150)
  })

  // The shape the widened scan exists for: rows declared beside the component that renders them,
  // which is neither JSX nor a module of its own. Not a lock on how the file is parsed — the TS
  // parser recovers from JSX it was not told to expect and finds this either way, measured.
  it('sees a registry declared beside the component that renders it', () => {
    const found = registryFindingsIn(
      'probe.tsx',
      "const ROWS = [{ key: 'exposure', label: 'Exposure' }]\nconst A = () => <Row items={ROWS} />",
    )

    expect(found).toHaveLength(1)
  })

  it('would see a word written where a key belongs', () => {
    const found = registryFindingsIn(
      'probe.ts',
      "const field = { key: 'exposure', label: 'Exposure' }",
    )

    expect(found).toHaveLength(1)
  })

  it('leaves a key alone, and what carries no word', () => {
    const quiet = [
      "const a = { label: 'skybox.exposure' }",
      "const b = { label: t('skybox.exposure') }",
      "const c = { title: '—' }",
    ]

    expect(quiet.flatMap((code, index) => registryFindingsIn(`probe${index}.ts`, code))).toEqual([])
  })

  /**
   * The exclusion above is worth exactly what its edge is worth: dropping fixtures must not drop
   * anything a screen reads, and `stores/` holds both kinds side by side.
   */
  it('steps over the fixtures and over nothing else', () => {
    const stores = sourceFiles(join(SOURCE_ROOT, 'renderer', 'src', 'stores'))

    expect(stores.filter(path => path.endsWith('-fixtures.ts'))).toEqual([])
    expect(stores.some(path => path.endsWith('jobs.ts'))).toBe(true)
  })

  /**
   * `sourceFiles` feeds the dialog and menu guards too, and the main tree has fixtures of its
   * own — the exemption reaches them, so it is measured where it reaches rather than where it
   * was written for.
   */
  it('steps over the fixtures of the main tree as well, and keeps the rest', () => {
    const main = sourceFiles(MAIN)

    expect(main.filter(path => path.endsWith('-fixtures.ts'))).toEqual([])
    expect(main.some(path => path.endsWith('jobManager.ts'))).toBe(true)
  })
})

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
])

function literalsIn(expression: ts.Expression): string[] {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return [expression.text]
  if (ts.isTemplateExpression(expression))
    return [
      expression.head.text + expression.templateSpans.map(span => span.literal.text).join(' '),
    ]
  if (ts.isConditionalExpression(expression))
    return [...literalsIn(expression.whenTrue), ...literalsIn(expression.whenFalse)]
  if (ts.isBinaryExpression(expression) && LOGICAL_OPERATORS.has(expression.operatorToken.kind))
    return [...literalsIn(expression.left), ...literalsIn(expression.right)]
  if (ts.isParenthesizedExpression(expression)) return literalsIn(expression.expression)
  return []
}

/**
 * A sentence, as opposed to a class list or a keyword. The capital is what tells them apart:
 * `bg-surface flex size-full` holds spaces and lowercase words and is not a word anyone reads,
 * while anything a user is shown starts the way a sentence starts.
 */
function readsLikeASentence(text: string): boolean {
  return /^\p{Uppercase_Letter}\p{Lowercase_Letter}+\s+\p{Lowercase_Letter}/u.test(text.trim())
}

/**
 * A `.ts` read as JSX is worse than useless: `const f = <T,>(x: T) => x` opens a tag, the parser
 * drops into error recovery, and the declarations after it are never visited. Measured on three
 * modules of the window — 99, 46 and 33 parse errors, and 55 declarations gone unseen.
 */
function scriptKindOf(path: string): ts.ScriptKind {
  return path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function boundSentencesIn(path: string, code: string): string[] {
  return boundSentencesFrom(
    ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, scriptKindOf(path)),
  )
}

function boundSentencesFrom(source: ts.SourceFile): string[] {
  const path = source.fileName
  const findings: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      for (const text of literalsIn(node.initializer)) {
        if (!readsLikeASentence(text)) continue
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        findings.push(`${path}:${line + 1} ${text}`)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

/**
 * The blind spot the other guards admit to: a string reaching the screen through a name. The JSX
 * checks read what a tag holds, so `<p>{label}</p>` shows them an identifier and nothing else,
 * and the registry check reads named fields, which a bare `const` is not.
 *
 * It ran on the WINDOW ONLY until now, through a glob relative to the renderer — so `shared/`,
 * `preload/` and `main/` were seen by the registry check alone, which reads named fields and
 * nothing else. A sentence bound to a name in any of those 204 files reached no guard at all.
 * Measured before moving it: zero of them, today. The move is what keeps that true tomorrow.
 *
 * It lives here for the reason the registry check does: it reads the tree off the disk, and
 * `src/shared` is compiled for the web too, where `node:fs` has no types and no business.
 *
 * NARROW ON PURPOSE, and the shape it catches is the one somebody writes. A capital separates a
 * sentence from a class list: a check that cries wolf is a check somebody turns off. So it does
 * NOT see a lowercase phrase, a single capitalised word, an acronym, an object property or an
 * array element — the last two being the registry guard's job. What it adds is the bare binding.
 */
describe('the words nobody puts in a tag', () => {
  // All four trees where the registry check reads three: `main` writes its screens through
  // `TRANSLATIONS`, so a sentence bound to a name there reaches a dialog exactly as one bound in
  // the window reaches a tag. The registry check stopping at three is its own question.
  const findingsOf = (): string[] =>
    PROJECT_TREES.flatMap(tree =>
      sourceFiles(tree).flatMap(path =>
        boundSentencesFrom(parsedFile(path, relative(SOURCE_ROOT, path))),
      ),
    )

  it(
    'binds no sentence to a name anywhere in the project',
    () => {
      expect(findingsOf()).toEqual([])
    },
    WHOLE_PROJECT,
  )

  it('would see a sentence parked in a constant', () => {
    expect(boundSentencesIn('probe.tsx', "const label = 'Delete this project'")).toHaveLength(1)
  })

  it('reads a sentence that interpolates', () => {
    const code = 'const label = `Deleted ${count} of your assets`'

    expect(boundSentencesIn('probe.ts', code)).toHaveLength(1)
  })

  it('reads a module whose generic arrow would open a tag in JSX', () => {
    // Without the comma: `<T,>` stays a generic even in TSX, so the probe this inherited proved
    // nothing — it passed in either mode. `app/documentIo.ts:105` writes the shape that breaks.
    const code = "const asIs = <S>(state: S): unknown => state\nconst label = 'Delete this project'"

    expect(boundSentencesIn('probe.ts', code)).toHaveLength(1)
  })

  it('reads both sides of a ternary and of a guard', () => {
    const behind = [
      "const label = ok ? 'Loading your project' : 'Nothing to show'",
      "const other = bad && 'Something went wrong'",
    ]

    expect(
      behind.flatMap((code, index) => boundSentencesIn(`probe${index}.ts`, code)),
    ).toHaveLength(3)
  })

  it('leaves class lists, keywords and identifiers alone', () => {
    const quiet = [
      "const styles = 'bg-surface flex size-full flex-col justify-center gap-2'",
      "const mode = 'horizontal'",
      "const channel = 'window:state'",
      "const key = 'panels.assets'",
      "const path = 'Contents/Resources/ffmpeg'",
    ]

    expect(quiet.flatMap((code, index) => boundSentencesIn(`probe${index}.ts`, code))).toEqual([])
  })
})
