import { describe, expect, it } from 'vitest'
import { stylesheet } from '../indexCss-fixtures'

/**
 * The two gauges daisyUI multiplies, held to the studio's own.
 *
 * A control of the plugin never reads `--sc-control`: it computes `--size-field * 8` for a field
 * (`.input-sm`, `.select-sm`, `.btn-sm`) and `--size-selector * 5` for a box one ticks
 * (`.checkbox-sm`, `.radio-sm`, `.toggle-sm`). Left at the plugin's `.25rem` those landed on 32px
 * and 20px at every density, which is how a settings field stood four pixels taller than the
 * field beside it and ignored the compact setting outright.
 *
 * The DIVISION is what is guarded, not a computed size: written as a `calc`, a future gauge
 * carries the plugin with it and the density block needs no restatement.
 *
 * 🛑 Its blind spot, written rather than hidden: the divisors are DaisyUI 5.7.28's, read from
 * `node_modules/daisyui/components/` on 2026-09-08. A major version that changes a multiplier
 * leaves this green and the controls wrong.
 */
const derives = (token: string, gauge: string, steps: number): RegExp =>
  new RegExp(`${token}:\\s*calc\\(var\\(${gauge}\\) / ${steps}\\);`, 'g')

const declares = (token: string): RegExp => new RegExp(`${token}:\\s*[^;]+;`, 'g')

const times = (pattern: RegExp): number => [...stylesheet.matchAll(pattern)].length

describe('what daisyUI measures a control from', () => {
  /** Both themes state it; neither states a number. */
  it('divides a field out of the studio control gauge', () => {
    expect(times(derives('--size-field', '--sc-control', 8))).toBe(2)
    expect(times(declares('--size-field'))).toBe(2)
  })

  it('divides a box one ticks out of the gauge of a tick box', () => {
    expect(times(derives('--size-selector', '--sc-tick', 5))).toBe(2)
    expect(times(declares('--size-selector'))).toBe(2)
  })

  /** What those two divide, at both densities — the compact block is what the calc buys. */
  it('reads a gauge the density setting moves', () => {
    expect(times(declares('--sc-control'))).toBe(2)
    expect(times(declares('--sc-tick'))).toBe(2)
  })

  /**
   * The other half of the same wiring: the plugin floors a control's text at a fixed rem value,
   * which no font scale reaches — the appearance setting scaled every word of the studio except
   * those written inside a control.
   */
  it('floors the text of a control on the studio ladder, not on the plugin one', () => {
    expect(stylesheet).toMatch(/--font-size-min:\s*var\(--text-tiny\);/)
    expect(stylesheet).toMatch(/--font-size-min:\s*var\(--text-mini\);/)
  })
})
