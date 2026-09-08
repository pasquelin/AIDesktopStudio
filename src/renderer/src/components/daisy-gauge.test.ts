import { describe, expect, it } from 'vitest'
import { stylesheet } from '../indexCss-fixtures'

/**
 * The two gauges daisyUI multiplies, held against the studio's own.
 *
 * A control of the plugin never reads `--sc-control`: it computes `--size-field * 8` for a field
 * (`.input-sm`, `.select-sm`, `.btn-sm`) and `--size-selector * 5` for a box one ticks
 * (`.checkbox-sm`, `.radio-sm`, `.toggle-md`). Left at the plugin's `.25rem` those landed on 32px
 * and 20px at every density, which is how a settings field stood four pixels taller than the
 * field beside it and ignored the compact setting outright.
 *
 * 🛑 Its blind spot: the MULTIPLIERS are daisyUI's own, read from its stylesheet on 2026-09-08 and
 * restated here as numbers. A major version that changes them leaves this green and the controls
 * wrong — the pair below is what to re-read in `node_modules/daisyui/components/`.
 */
const FIELD_STEPS = 8
const SELECTOR_STEPS = 5
const ROOT_FONT_SIZE = 16

const REM = /^([\d.]+)rem$/

function declarations(name: string): number[] {
  return [...stylesheet.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map(match => {
    const written = REM.exec((match[1] ?? '').trim())?.[1]
    return written === undefined ? Number.NaN : Number(written) * ROOT_FONT_SIZE
  })
}

/**
 * The comfortable gauge is stated by BOTH themes, the compact one once — three declarations, two
 * of them equal. Read by value rather than by position: the fixture globs the pieces of the
 * stylesheet in path order, which puts the light theme before the dark one.
 */
function gaugesOf(name: string): { comfort: number; compact: number } {
  const written = declarations(name)
  const comfort = Math.max(...written)
  const compact = Math.min(...written)

  expect(written).toHaveLength(3)
  expect(written.filter(one => one === comfort)).toHaveLength(2)

  return { comfort, compact }
}

describe('what daisyUI measures a control from', () => {
  it('puts a field on the studio gauge at both densities', () => {
    const field = gaugesOf('--size-field')

    expect(field.comfort * FIELD_STEPS).toBe(28)
    expect(field.compact * FIELD_STEPS).toBe(24)
  })

  it('puts a box one ticks at one size, and follows the density down', () => {
    const selector = gaugesOf('--size-selector')

    expect(selector.comfort * SELECTOR_STEPS).toBe(16)
    expect(selector.compact * SELECTOR_STEPS).toBe(14)
  })

  /**
   * The other half of the same wiring: the plugin floors a control's text at a fixed rem value,
   * which no font scale reaches. Read as a pair of rules rather than a computed size — the floor
   * is a token here, and what it resolves to is `text-scale.test.ts`'s subject.
   */
  it('floors the text of a control on the studio ladder, not on the plugin one', () => {
    expect(/--font-size-min:\s*var\(--text-tiny\);/.test(stylesheet)).toBe(true)
    expect(/--font-size-min:\s*var\(--text-mini\);/.test(stylesheet)).toBe(true)
  })

  /** What the numbers above are held against, and the reason they are not written twice. */
  it('is held against the gauge the studio own controls read', () => {
    expect(/--sc-control:\s*28px;/.test(stylesheet)).toBe(true)
    expect(/--sc-control:\s*24px;/.test(stylesheet)).toBe(true)
  })
})
