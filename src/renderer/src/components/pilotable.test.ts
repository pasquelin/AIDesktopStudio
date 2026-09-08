import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from '../windowSources'
import { withoutComments } from './sourceText'

/**
 * The studio is driven from outside — by an MCP client over CDP, and by whatever a script reaches
 * for. That driving has to name a control, and the only names on screen are TRANSLATED: a script
 * written against « Position » stops working the moment the window is opened in English.
 *
 * `data-sc` is the name that does not move. It is derived from the code — `transform.position.x`
 * — and never from a word anyone reads.
 */

/** Every control that takes a handle, read off what it DECLARES rather than from a list here. */
const PILOTABLE: readonly string[] = Object.entries(WINDOW_SOURCES)
  .filter(([, source]) => /\bscId\??:\s*string/.test(source))
  .map(([path]) => path.split('/').pop()?.replace('.tsx', '') ?? '')
  .filter(name => /^[A-Z]/.test(name))
  .sort()

/** The sources of those controls, for the rules about what they write. */
const CONTROLS = Object.entries(WINDOW_SOURCES).filter(([path]) =>
  PILOTABLE.some(name => path.endsWith(`/${name}.tsx`)),
)

/**
 * The attribute region of one JSX opening tag, braces and strings counted.
 *
 * A regex up to the first `>` is not enough: `onChange={next => run(next)}` closes the tag four
 * characters early, and every site carrying an arrow function would read as attribute-less.
 */
function openingTag(source: string, from: number): string {
  let depth = 0
  let quote: string | null = null

  for (let index = from; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = null
    } else if (character === '"' || character === "'" || character === '`') quote = character
    else if (character === '{') depth += 1
    else if (character === '}') depth -= 1
    else if (character === '>' && depth === 0) return source.slice(from, index + 1)
  }

  return source.slice(from)
}

/** Every place a pilotable control is rendered, with the attributes it was given. */
function sitesOf(name: string): { path: string; tag: string }[] {
  const opens = new RegExp(`<${name}(?=[\\s/>])`, 'g')

  return Object.entries(WINDOW_SOURCES).flatMap(([path, source]) =>
    [...source.matchAll(opens)].map(match => ({ path, tag: openingTag(source, match.index) })),
  )
}

describe('a control the studio can be driven by', () => {
  it('finds the controls at all, so the rules below cannot pass on an empty glob', () => {
    expect(PILOTABLE.length).toBeGreaterThan(10)
  })

  /**
   * Written OR handed on: a vector draws no control of its own — it stacks three `NumberField`s
   * and extends the handle with each axis — and a link row hands its own to the select inside it.
   * Demanding the attribute itself would have asked both of them to draw a second, dead one.
   */
  it('offers a handle on every family of control', () => {
    const silent = CONTROLS.filter(
      ([, source]) => !source.includes('data-sc') && !/scId=\{/.test(source),
    ).map(([path]) => path)

    expect(silent, `these cannot be named from a script: ${silent.join(', ')}`).toEqual([])
  })

  /**
   * The whole point, and the one thing a reviewer cannot see by reading a diff: a handle composed
   * from a label is a handle that changes with the language, which is the defect this attribute
   * exists to remove. It would also pass every test written in French.
   */
  it('never builds a handle out of a word anyone reads', () => {
    const TRANSLATED = /data-sc=\{[^}]*\bt\(/
    const guilty = CONTROLS.filter(([, source]) => TRANSLATED.test(source)).map(([path]) => path)

    expect(guilty, `these name a control by a translated word: ${guilty.join(', ')}`).toEqual([])
  })

  /**
   * `label` is the prop every one of these carries, and it holds a translated string — so reading
   * it into the handle is the same defect as calling `t` inline, one indirection further away.
   */
  it('never builds a handle out of the label it was handed either', () => {
    const FROM_LABEL = /data-sc=\{[^}]*\blabel\b/
    const guilty = CONTROLS.filter(([, source]) => FROM_LABEL.test(source)).map(([path]) => path)

    expect(guilty).toEqual([])
  })

  /**
   * Prefixed by what the thing IS, so a script can tell a section from a field without knowing
   * the tree — `section:transform` folds, `field:transform.position.x` takes a value. Two kinds
   * and no more: the rule once offered `link:` and `action:` as facts, and nothing wrote either.
   *
   * Every handle of the window, not the design system's alone: twenty-four are written by hand
   * outside it — the settings, git, the new-document window — and the rule that reached those
   * accepted any spelling. Both forms of the attribute are read, `{…}` and `"…"`.
   */
  it('says what kind of thing it names, not only which one', () => {
    const HANDLES = /data-sc=(\{[^}]*\}?|"[^"]*")/g
    const KIND = /^[{"`]*(section|field):|Handle\(/
    // A handle held in a variable is answered by how that variable was BUILT — the generation
    // form spends one across seven branches rather than composing it seven times.
    const composed = (source: string, written: string): boolean =>
      /^\{\w+\}$/.test(written) &&
      new RegExp(`const ${written.slice(1, -1)} = (field|section)Handle\\(`).test(source)

    const unprefixed = Object.entries(WINDOW_SOURCES).flatMap(([path, source]) =>
      [...source.matchAll(HANDLES)]
        .map(match => (match[1] ?? '').replace(/^\{scId && /, ''))
        .filter(written => !KIND.test(written) && !composed(source, written))
        .map(written => `${path} — ${written}`),
    )

    expect(unprefixed.sort()).toEqual([])
  })

  /**
   * The half no rule above could see, and the one that mattered: a control WRITES the attribute
   * only when its caller names one, and `scId` is optional on every one of them. Measured on
   * 2026-08-20, before this existed — 57 of 197 call sites named a handle, so seven controls out
   * of ten rendered `data-sc={undefined}` and were invisible to every script.
   *
   * A site is answered by the attribute alone, whether it is a literal, a prop passed straight
   * through, or one composed from an id — what is refused is saying nothing.
   */
  it('is named by every caller that renders one', () => {
    const unnamed = PILOTABLE.flatMap(name =>
      sitesOf(name)
        .filter(({ tag }) => !/\bscId\b/.test(tag))
        .map(({ path }) => `${path} — <${name}>`),
    )

    expect(unnamed.sort()).toEqual([])
  })

  /**
   * The controls that go straight to the platform, bypassing the design system entirely — the
   * generation form, the settings window, the git panel, every window that is not a dock.
   *
   * Read per TAG, and that is the whole of it: read per file, one named control answered for
   * every one beside it, and three of the studio's most used fields were invisible while this was
   * green — the assistant's own box, the search of every collection, and the brush colour.
   */
  it('is written by every control that goes straight to the platform', () => {
    const RAW = /<(input|textarea|select)(?=[\s/>])/g
    const silent = Object.entries(WINDOW_SOURCES)
      .filter(([path]) => path.endsWith('.tsx'))
      .flatMap(([path, source]) => {
        const code = withoutComments(source)
        return (
          [...code.matchAll(RAW)]
            // The attribute, never the word: `WindowSearch` names `data-sc` in a comment saying
            // why it is not a field, and a rule reading the word alone was green on that file.
            .filter(match => !/data-sc[=\s]/.test(openingTag(code, match.index)))
            .map(match => `${path} — <${match[1]}>`)
        )
      })

    expect(silent.sort()).toEqual([])
  })
})
