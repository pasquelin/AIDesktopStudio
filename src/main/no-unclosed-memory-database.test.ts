import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { siteOf, walkIn } from './astSites'
import { SOURCE_ROOT, WHOLE_PROJECT } from './sourceFiles'
import { testFilesUnder } from './wideGuards'

const calls = (node: ts.Node, ...names: readonly string[]): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  names.includes(node.expression.text)

/**
 * The two ways a suite gets a database, and there are no others.
 *
 * `memoryCatalog` (`project/catalog-fixtures.ts`) wraps `openMemoryDatabase`, so a fixture opens
 * one without a suite ever naming the driver. It is the MORE used of the two — thirteen sites
 * against fourteen — and it was invisible to this guard until 2026-08-14.
 */
const OPENERS = ['openMemoryDatabase', 'memoryCatalog']

/** The two ways a suite gives one back. Both are teardowns; neither is a plain statement. */
const TEARDOWNS = ['onTestFinished', 'afterEach']

/**
 * Suites that hand their database to the object which will close it, which no static rule follows.
 *
 * By FILE and with a reason in prose, the way `design/tokens.test.ts` carries its own. The entry
 * below is the shape `openCatalog: async () => memoryCatalog()` — the handle is given away at the
 * moment it is made, and comes back through its new owner. Reading that would mean following a
 * value across a constructor, which is a rule no reader could apply by eye.
 *
 * The test at the bottom asks whether an entry is still NEEDED, never whether its prose is true.
 */
const OWNED_ELSEWHERE: Record<string, string> = {
  'main/project/store01Part01.test.ts':
    'catalogues handed to `openCatalog`, given back by `store.ts` when the store closes',
  'main/project/store01Part02.test.ts':
    'catalogues handed to `openCatalog`, given back by `store.ts` when the store closes',
  'main/project/store01Part03.test.ts':
    'catalogues handed to `openCatalog`, given back by `store.ts` when the store closes',
  'main/project/store02.test.ts':
    'catalogues handed to `openCatalog`, given back by `store.ts` when the store closes',
  'main/project/store03.test.ts':
    'catalogues handed to `openCatalog`, given back by `store.ts` when the store closes',
  'main/project/store04.test.ts':
    'catalogues handed to `openCatalog`, given back by `store.ts` when the store closes',
  'main/memory/memoryClient.test.ts':
    'the database goes to the index, then to the store, and comes back through `memory.close()` — which is what the suite is there to exercise',
}

/**
 * The name the opening was bound to, whether declared or assigned.
 *
 * `undefined` for an opening nobody named — `serve(createCatalog(openMemoryDatabase()), port)` —
 * which no teardown can ever reach and so is always a finding. The climb stops at a function
 * boundary: `const open = () => openMemoryDatabase()` binds a factory, not a handle.
 */
function nameBoundTo(node: ts.Node): string | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current))
      return ts.isIdentifier(current.name) ? current.name.text : undefined
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.EqualsToken)
      return ts.isIdentifier(current.left) ? current.left.text : undefined
    if (ts.isFunctionLike(current)) return undefined
  }

  return undefined
}

/**
 * The names a teardown gives back — `driver.close` passed along, `() => driver.close()` alike.
 *
 * Read off the tree rather than off the text. A review caught the text reading absolving a leak
 * through a COMMENT that mentioned `driver.close()`, and through a string that spelt it: prose
 * about a handle is not a handle given back.
 */
function closedNamesOf(argument: ts.Expression | undefined): string[] {
  const names: string[] = []
  if (argument)
    walkIn(argument, node => {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'close' &&
        ts.isIdentifier(node.expression)
      )
        names.push(node.expression.text)
    })

  return names
}

const tally = (names: readonly string[]): Map<string, number> =>
  names.reduce((counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1), new Map())

/** One suite as the sweep sees it: the path a reader would open, and what the rule refuses in it. */
type Swept = { path: string; findings: readonly string[] }

/**
 * The exemptions a sweep no longer justifies — a key naming nothing, or a file the rule now clears.
 *
 * A pure function of the sweep rather than an assertion inside the suite, so it can be put in
 * default WITHOUT touching the tree: handed a made-up sweep it answers the same way. An exemption
 * kept past its need is worse than none, because it goes on covering whatever the file gains next.
 */
export function staleExemptions(swept: readonly Swept[]): string[] {
  const walked = new Set(swept.map(one => one.path))

  return [
    ...Object.keys(OWNED_ELSEWHERE).filter(path => !walked.has(path)),
    ...swept
      .filter(one => one.path in OWNED_ELSEWHERE && one.findings.length === 0)
      .map(o => o.path),
  ]
}

/**
 * The `describe` a node sits in, as a key — or the file itself for what sits outside them all.
 *
 * The coarsest scope a reader already sees. Without it a teardown answers for any opening ANYWHERE
 * in the file, and a `createServer()` called `catalog` was measured absolving a leaked
 * `memoryCatalog()` called `catalog` next door. Nearest block wins; the position is its identity.
 */
function enclosingBlock(node: ts.Node): string {
  for (let current = node.parent; current; current = current.parent)
    if (calls(current, 'describe')) return String(current.pos)

  return 'file'
}

/** The openings this file never gives back, named where a reader would open the suite. */
export function unclosedIn(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const openings: { key: string | undefined; site: string }[] = []
  const givenBack: string[] = []
  // Escaped rather than written out: the byte itself makes git read this whole file as binary,
  // which cost a review that could not open it. `no-literal-nul-byte.test.ts` holds the rule.
  const keyOf = (node: ts.Node, name: string): string => `${enclosingBlock(node)}\x00${name}`

  walkIn(file, node => {
    if (calls(node, ...OPENERS)) {
      const name = nameBoundTo(node)
      openings.push({
        key: name === undefined ? undefined : keyOf(node, name),
        site: siteOf(file, path, node),
      })
    } else if (calls(node, ...TEARDOWNS))
      givenBack.push(...closedNamesOf(node.arguments[0]).map(name => keyOf(node, name)))
  })

  const opened = tally(openings.flatMap(opening => (opening.key ? [opening.key] : [])))
  const closed = tally(givenBack)

  // A name short of teardowns names ALL its openings: which of them leaks cannot be told from a
  // name alone, and pointing at one of them pointed at the sound one half the time.
  return openings
    .filter(({ key }) => key === undefined || (opened.get(key) ?? 0) > (closed.get(key) ?? 0))
    .map(({ site }) => site)
}

/**
 * `openMemoryDatabase` hands out a native handle, and a suite that drops it never gives it back.
 *
 * Measured on 2026-08-14: fourteen openings across the five catalogue suites, zero teardowns.
 * `node:sqlite` is experimental and its handles are finalised by the garbage collector at a time
 * nobody chooses, so a leak here is not a tidiness question — it leaves twelve worker processes
 * holding databases nothing will ask for again.
 *
 * **Matched by NAME, and read off the TREE.** Two earlier drafts were shown green on a real leak:
 * one counted teardowns without reading whose they were, so closing a server answered for a
 * database; the next read the argument as text, so a comment explaining why the handle was left
 * open absolved it. The handle's own name has to come back, spelt as code.
 *
 * FOUR blind spots, written down rather than left to be found:
 *
 * - **the SUITES are read, and nothing else.** A fixture is not a `.test.ts`, so a third wrapper
 *   around `openMemoryDatabase` would open databases this guard never sees. `OPENERS` is the whole
 *   of what it knows, and it is a list somebody has to extend by hand — `memoryCatalog` was
 *   missing from it until 2026-08-14, which hid eight leaks.
 * - **named, not invoked.** `onTestFinished(() => { if (keep) d.close() })` gives the handle back
 *   on one branch and reads as sound on both: the rule sees the name spelt as code, never the call
 *   actually made. Following the branch would need the value resolved, which no reader does by eye.
 * - **a name inside a block, not a binding.** Two handles sharing a name inside the SAME
 *   `describe` share their tally. Across blocks they no longer do — keyed on the name alone, a
 *   `createServer()` called `catalog` was measured absolving a `memoryCatalog()` called `catalog`
 *   leaking next door, which is why the key carries the block. What is left is one `describe`
 *   opening twice under one name and giving back once, which the count still catches, and two
 *   different things sharing a name INSIDE one block, which it does not.
 * - **three correct spellings it refuses**, all erring towards the safe side and none in the tree:
 *   `const { close } = openMemoryDatabase()`, a handle renamed before its teardown, and a handle
 *   handed to a helper that closes it. Each reads as a leak.
 */
const sweep = (): { path: string; findings: string[] }[] =>
  testFilesUnder(SOURCE_ROOT).map(path => {
    const named = relative(SOURCE_ROOT, path)
    return { path: named, findings: unclosedIn(named, readFileSync(path, 'utf8')) }
  })

const findingsOf = (): string[] =>
  sweep().flatMap(({ path, findings }) => (path in OWNED_ELSEWHERE ? [] : findings))

describe('every database a suite opens by name is given back', () => {
  it(
    'gives back every database it opened, in every suite of the project',
    () => {
      expect(findingsOf()).toEqual([])
    },
    WHOLE_PROJECT,
  )

  // An empty result proves nothing unless the files were opened: pointed at a folder that does
  // not exist, the assertion above stays green.
  it('reads the suites the project ships', () => {
    expect(testFilesUnder(SOURCE_ROOT).length).toBeGreaterThan(100)
  })

  /**
   * An exemption that has stopped being needed is worse than none: it goes on covering whatever is
   * added to the file next. Held by REPLAYING the rule, not by asking whether the prose still
   * reads true — the day `store.test.ts` names its catalogues, this fails and the entry goes.
   */
  it('carries no exemption the rule would no longer refuse', () => {
    expect(staleExemptions(sweep())).toEqual([])
  })

  /**
   * What the exemption COSTS, measured rather than promised.
   *
   * An exempt file is exempt whole: a leak added to it tomorrow is one the sweep will not report,
   * even though the rule sees it perfectly well. Written as a test so the price is a number a
   * reader can check, not a sentence they have to trust.
   */
  it('hides a leak added to an exempt suite, which is the price of the entry', () => {
    const exempt = Object.keys(OWNED_ELSEWHERE)[0] ?? ''
    const leaked = `${readFileSync(join(SOURCE_ROOT, exempt), 'utf8')}\nconst extra = memoryCatalog()\n`

    expect(unclosedIn(exempt, leaked).length).toBeGreaterThan(0)
    expect(findingsOf()).toEqual([])
  })

  /**
   * The staleness check put in default, on made-up sweeps rather than on the tree.
   *
   * Without this, the assertion two cases above is a green nobody has ever seen go red — the
   * failure this whole file was rewritten three times to avoid.
   */
  it('names an exemption whose file the rule has stopped refusing', () => {
    const exempt = Object.keys(OWNED_ELSEWHERE)

    expect(staleExemptions(exempt.map(path => ({ path, findings: [`${path}:1`] })))).toEqual([])
    expect(staleExemptions(exempt.map(path => ({ path, findings: [] })))).toEqual(exempt)
    expect(staleExemptions([{ path: 'main/elsewhere.test.ts', findings: [] }])).toEqual(exempt)
  })

  /**
   * The widening `afterEach` brought, put in default.
   *
   * A suite where only half the blocks give their handle back does not read as sound — and only
   * the block that leaks is named. The tally is per `describe`, so the sound half answers for
   * itself and for nothing else.
   */
})

describe('database teardown scope', () => {
  it('refuses the block that keeps its handle, and names only that one', () => {
    expect(
      unclosedIn(
        'probe.ts',
        [
          "describe('a', () => {",
          '  beforeEach(() => { c = memoryCatalog() })',
          '  afterEach(() => c.close())',
          '})',
          "describe('b', () => {",
          '  beforeEach(() => { c = memoryCatalog() })',
          '})',
        ].join('\n'),
      ),
    ).toEqual(['probe.ts:6'])
  })

  /**
   * The hole the block key was added for, measured before and after.
   *
   * Keyed on the name alone, a `createServer()` called `catalog` and closed in one `describe`
   * answered for a `memoryCatalog()` called `catalog` leaking in the next — the same family of
   * defect that had this guard rejected three times over.
   */
  it('is not answered by a teardown of something else that shares the name', () => {
    expect(
      unclosedIn(
        'probe.ts',
        [
          "describe('a', () => {",
          '  const catalog = createServer()',
          '  afterEach(() => catalog.close())',
          '})',
          "describe('b', () => {",
          '  const catalog = memoryCatalog()',
          '})',
        ].join('\n'),
      ),
    ).toEqual(['probe.ts:6'])
  })

  it('reads the fixture that wraps the driver, not only the driver', () => {
    expect(unclosedIn('probe.ts', 'const catalog = memoryCatalog()')).toEqual(['probe.ts:1'])
    expect(
      unclosedIn('probe.ts', 'const catalog = memoryCatalog()\nonTestFinished(catalog.close)'),
    ).toEqual([])
  })

  // `afterEach` is the other teardown the tree uses, and it obeys the same rule about whose
  // handle comes back: an `afterEach` closing something else answers for nothing.
  it('takes a teardown written as afterEach, and only for the handle it names', () => {
    expect(unclosedIn('probe.ts', 'const c = memoryCatalog()\nafterEach(() => c.close())')).toEqual(
      [],
    )
    expect(unclosedIn('probe.ts', 'const c = memoryCatalog()\nafterEach(() => rm(root))')).toEqual([
      'probe.ts:1',
    ])
  })

  it('sees the opening the catalogue suites had left without a teardown', () => {
    expect(unclosedIn('probe.ts', 'const driver = openMemoryDatabase()')).toEqual(['probe.ts:1'])
  })
})

describe('database teardown forms', () => {
  it('takes the teardown passed by reference and the one wrapped in an arrow', () => {
    expect(
      unclosedIn('probe.ts', 'const d = openMemoryDatabase()\nonTestFinished(d.close)'),
    ).toEqual([])
    expect(
      unclosedIn('probe.ts', 'const d = openMemoryDatabase()\nonTestFinished(() => d.close())'),
    ).toEqual([])
  })

  // What the counting draft got wrong, and the reason this guard reads names.
  it('refuses a teardown that gives back something else', () => {
    expect(
      unclosedIn(
        'probe.ts',
        'const d = openMemoryDatabase()\nonTestFinished(() => server.close())',
      ),
    ).toEqual(['probe.ts:1'])
    expect(
      unclosedIn('probe.ts', "const d = openMemoryDatabase()\nonTestFinished(() => log('close'))"),
    ).toEqual(['probe.ts:1'])
  })

  // What the text-reading draft got wrong: prose about a handle is not a handle given back.
  it('refuses a comment and a string that only mention the teardown', () => {
    expect(
      unclosedIn(
        'probe.ts',
        'const d = openMemoryDatabase()\nonTestFinished(() => {\n  // d.close() is the store’s job\n  store.stop()\n})',
      ),
    ).toEqual(['probe.ts:1'])
    expect(
      unclosedIn(
        'probe.ts',
        "const d = openMemoryDatabase()\nonTestFinished(() => log('d.close skipped'))",
      ),
    ).toEqual(['probe.ts:1'])
  })
})

describe('database opening counts', () => {
  it('takes the handle reassigned before each test, once per opening', () => {
    expect(
      unclosedIn(
        'probe.ts',
        'beforeEach(() => {\n  driver = openMemoryDatabase()\n  onTestFinished(driver.close)\n})',
      ),
    ).toEqual([])
  })

  // Which of a short name's openings leaks cannot be told from the name, so it names them all —
  // an earlier draft credited them in order and pointed at the one that was sound.
  it('names every opening of a name that gives back fewer than it takes', () => {
    expect(
      unclosedIn(
        'probe.ts',
        'const d = openMemoryDatabase()\nconst d2 = openMemoryDatabase()\nonTestFinished(d2.close)',
      ),
    ).toEqual(['probe.ts:1'])
    expect(
      unclosedIn(
        'probe.ts',
        'driver = openMemoryDatabase()\ndriver = openMemoryDatabase()\nonTestFinished(driver.close)',
      ),
    ).toEqual(['probe.ts:1', 'probe.ts:2'])
  })

  // An opening nobody named is an opening no teardown can reach.
  it('refuses an opening handed straight to a caller', () => {
    expect(
      unclosedIn('probe.ts', 'serveCatalog(createCatalog(openMemoryDatabase()), port)'),
    ).toEqual(['probe.ts:1'])
  })

  it('reads neither a mention of the helper nor a teardown of its own', () => {
    expect(unclosedIn('probe.ts', "const name = 'openMemoryDatabase'")).toEqual([])
    expect(unclosedIn('probe.ts', 'onTestFinished(d.close)')).toEqual([])
  })
})
