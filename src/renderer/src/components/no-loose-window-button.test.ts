import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from '../windowSources'

/**
 * The windows that are NOT docks dress themselves in DaisyUI, and every button of theirs used to
 * spell its own class string. Nine spellings covered six roles, and two components rendering the
 * SAME action row had drifted apart — `SettingActionsRow` painting primary where `MemoryAction`
 * painted plain — so the section that reindexes and compacts read as a run of cancellations.
 *
 * Nothing went red, and nothing could: `tokens.test.ts` reads colours and `text-scale.test.ts`
 * reads type sizes, but no guard had ever read these. This is that guard.
 *
 * 🛑 **Its blind spots, written rather than hidden.** It matches the BASE token `btn`, which is
 * what opens a DaisyUI button, and nothing else:
 *
 * - A modifier ALONE — `btn-primary`, `btn-error btn-outline` — passes. Two chord buttons need
 *   exactly that, a role for the base and a word for the STATE (listening, clashing), and no
 *   role names a state. A component painting `btn-primary` over the wrong base stays green.
 * - A class assembled at runtime (`` `btn btn-${size}` ``) is invisible to a text sweep.
 * - It says nothing about whether the role CHOSEN is the right one. `WINDOW_ACTION_DANGER` on a
 *   harmless row is a defect only a reader catches — that half is `/loop-design`'s PASS 0.
 */

/**
 * Where a role may be spelt out. Two, and the second earns it: `WindowIconButton` keeps its skin
 * UNEXPORTED so that no caller can wear the glyph without the tooltip the component makes
 * compulsory — publishing it from `windowStyles.ts` would reopen exactly that door.
 */
const HOMES: readonly string[] = ['WindowButton.tsx', 'WindowIconButton.tsx']

/** Comments talk ABOUT the classes — this guard's own prose would fail it otherwise. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * A string literal opening a DaisyUI button: the bare `btn` token, whatever follows it.
 *
 * The token and not the substring: `btn-primary` alone is a modifier, and a role is what it is
 * modifying. `\b` on both sides is what tells the two apart.
 */
const OPENS_A_BUTTON = /(['"`])(?:[^'"`\n]*\s)?btn(?=[\s'"`])[^'"`\n]*\1/

function findingsOf(): string[] {
  const loose: string[] = []

  for (const [path, code] of Object.entries(WINDOW_SOURCES)) {
    if (HOMES.some(home => path.endsWith(home))) continue

    withoutComments(code)
      .split('\n')
      .forEach((line, index) => {
        if (OPENS_A_BUTTON.test(line)) loose.push(`${path.replace('./', '')}:${index + 1}`)
      })
  }
  return loose.sort()
}

describe('a window button wears a role, never a class string', () => {
  it('is what every site outside the two files above does', () => {
    expect(findingsOf()).toEqual([])
  })

  // Reading nothing would satisfy the assertion above for ever, and this guard sweeps by glob:
  // one bad pattern and it goes quiet while staying green.
  it('reads the whole window rather than nothing at all', () => {
    expect(Object.keys(WINDOW_SOURCES).length).toBeGreaterThan(400)
  })

  // The regex is what the guard IS: a substring match would call `btn-primary` a loose button and
  // send the next reader hunting for a role that does not exist.
  it('tells the base token from a modifier, which is what makes it usable', () => {
    expect(OPENS_A_BUTTON.test(`className="btn btn-sm"`)).toBe(true)
    expect(OPENS_A_BUTTON.test(`className={cn(ROLE, 'btn-primary')}`)).toBe(false)
    expect(OPENS_A_BUTTON.test(`className="btn"`)).toBe(true)
    expect(OPENS_A_BUTTON.test(`className="button"`)).toBe(false)
  })
})
