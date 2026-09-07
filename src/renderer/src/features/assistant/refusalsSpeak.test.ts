import { describe, expect, it } from 'vitest'
import { WRITTEN_SOURCES } from '@/components/testHarness'

/**
 * 🛑 A refusal that names nothing is one a caller cannot repair. Measured on the bench pass of
 * 2026-08-31 against deepseek-chat: 378 refusals, 234 of them with no `detail` at all — and the
 * model answered the very same call word for word. `detail` being optional is what let it happen.
 */
const ASSISTANT = WRITTEN_SOURCES.filter(([path]) => path.startsWith('../features/assistant/'))

/**
 * Prose, blanked rather than deleted, so a line number still names the line it came from. The
 * blind spot, written rather than hidden: a `//` inside a string literal takes the rest of that
 * line with it — none of this folder writes one, and the false positive is the better of the two.
 */
const withoutProse = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, line => ' '.repeat(line.length))

/**
 * Where each `refused(` of a module sits, and whether anything follows the refusal name. Read by
 * matching parentheses: a call wrapped by Prettier spans five lines, and a grep per line sees half.
 */
function refusalHasDetail(source: string, start: number): boolean {
  let at = start
  let depth = 1
  let hasDetail = false
  while (at < source.length && depth > 0) {
    const char = source[at]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === ',' && depth === 1) hasDetail = true
    else if (char === "'" || char === '"' || char === '`') {
      at += 1
      while (at < source.length && source[at] !== char) {
        if (source[at] === '\\') at += 1
        at += 1
      }
    }
    at += 1
  }
  return hasDetail
}

function refusalsIn(source: string): { line: number; hasDetail: boolean }[] {
  const found: { line: number; hasDetail: boolean }[] = []
  const calls = /\brefused\(/g
  let match = calls.exec(source)
  while (match !== null) {
    found.push({
      line: source.slice(0, match.index).split('\n').length,
      hasDetail: refusalHasDetail(source, match.index + match[0].length),
    })
    match = calls.exec(source)
  }
  return found
}

describe('every refusal the assistant hands back', () => {
  /**
   * By NAME, never by count — a cliquet on a number is cleared by splitting one call in two. A
   * site with honestly nothing to say goes in this list, spelled out; it is empty today.
   */
  it('says what was wrong, so the caller can repair it', () => {
    const silent = ASSISTANT.flatMap(([path, source]) =>
      refusalsIn(withoutProse(source))
        .filter(one => !one.hasDetail)
        .map(one => `${path}:${one.line}`),
    )

    expect(silent).toEqual([])
  })

  /**
   * A scanner that recognises nothing prints the same green as one that works — the reason
   * `wideGuards.ts` keeps a floor beside its detector. Well under the count, at 322 read.
   */
  it('is read by a scanner that still finds them', () => {
    const seen = ASSISTANT.flatMap(([, source]) => refusalsIn(withoutProse(source)))

    expect(seen.length).toBeGreaterThan(200)
  })
})
