import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { scriptProps } from './scriptProps'

/**
 * What reading a script's declared settings costs, since the inspector does it on every keystroke.
 *
 * Measured 2026-08-27 on this Mac: **0,079 ms** for 25 lines, **0,61 ms** for 200 — under 4 % of
 * a 16,7 ms frame for the largest, and only while an inspector is showing a scripted entity.
 * Moving it to a worker would cost a round trip for less than it saves. Measured, not assumed.
 */
const script = (lines: number): string =>
  [
    "import { defineScript } from '@studio'",
    'export default defineScript({',
    '  props: { speed: 4, jump: true, name: "Bob" },',
    '  onUpdate(self, ctx, dt) {',
    ...Array.from({ length: lines }, (_, at) => `    self.moveBy(0, ${at}, -dt)`),
    '  },',
    '})',
  ].join('\n')

describe('reading the settings a script declares', () => {
  const small = script(20)
  const large = script(200)

  bench('a 25-line script', () => void scriptProps(small))
  bench('a 200-line script', () => void scriptProps(large))
})
