import { describe, expect, it } from 'vitest'
import type { MemorySnapshot, MemorySource } from './aiMemory'
import type { LocalModel } from './localModel'
import { localModel } from './localModel-fixtures'
import { fitAllowsUse, fitObstacleOf, fitOf, type MachineOffer } from './modelFit'

const GIGA = 1_000_000_000

const snapshot = (availableBytes: number, source: MemorySource = 'runtime'): MemorySnapshot => ({
  domain: 'unified',
  source,
  at: 0,
  physicalBytes: 100 * GIGA,
  appBudgetBytes: 50 * GIGA,
  rendererReservedBytes: GIGA,
  runtimeBytes: {},
  headroomBytes: 2 * GIGA,
  availableBytes,
})

/** A model that weighs two gigabytes and reserves four, whatever else the fixture defaults to. */
const model = (over: Partial<LocalModel> = {}): LocalModel =>
  localModel({ diskBytes: 2 * GIGA, reservationBytes: 4 * GIGA, ...over })

const offer = (over: Partial<MachineOffer> = {}): MachineOffer => ({
  snapshot: snapshot(40 * GIGA),
  diskFreeBytes: 300 * GIGA,
  installed: false,
  runtimeReady: true,
  ...over,
})

describe('fitOf', () => {
  it('calls a model compatible when the runtime answered and there is room to spare', () => {
    expect(fitOf(model(), offer())).toBe('compatible')
  })

  // R1: a probe reading sorts a catalogue and explains a refusal, and never admits a job — so it
  // can never answer `compatible` either. `unknown` is the honest reading, not a failure.
  it('answers unknown when no runtime answered', () => {
    expect(fitOf(model(), offer({ snapshot: snapshot(40 * GIGA, 'probe') }))).toBe('unknown')
    expect(fitOf(model(), offer({ snapshot: snapshot(40 * GIGA, 'none') }))).toBe('unknown')
  })

  it('refuses a model the whitelist does not admit, whatever the machine has', () => {
    expect(fitOf(model({ format: 'pickle' }), offer())).toBe('incompatible')
  })

  it('lets a plugin pickle through, and names CUDA when the machine has none', () => {
    expect(
      fitOf(model({ format: 'pickle', loader: 'plugin', runtimeStatus: 'supported' }), offer()),
    ).toBe('compatible')
    expect(fitObstacleOf(model({ needsCuda: true }), offer())).toBe('cuda')
    expect(fitObstacleOf(model({ needsCuda: true }), offer({ cuda: 'usable' }))).toBeNull()
  })

  /**
   * Telling someone holding an RTX that their model needs an NVIDIA card is the sentence this
   * separates out: the card is here, the torch beside it is not, and that is a download away.
   */
  it('names the card that is here apart from the card that is missing', () => {
    expect(fitObstacleOf(model({ needsCuda: true }), offer({ cuda: 'repairable' }))).toBe(
      'cudaTorch',
    )
  })

  it('refuses a model that does not fit in memory', () => {
    expect(fitOf(model({ reservationBytes: 50 * GIGA }), offer())).toBe('insufficient-memory')
  })

  // The reservation is a floor, never the peak (R3), so the margin above it is what the job has
  // to grow into. Past two thirds it runs, and it hurts.
  it('warns rather than refuses when the margin is thin', () => {
    expect(fitOf(model({ reservationBytes: 30 * GIGA }), offer())).toBe('slow')
  })

  // Disk before memory, and only when the model is not already here: what cannot land cannot run.
  it('refuses a model the disk cannot take', () => {
    expect(fitOf(model(), offer({ diskFreeBytes: GIGA }))).toBe('insufficient-memory')
  })

  it('ignores the disk for a model already installed', () => {
    expect(fitOf(model(), offer({ diskFreeBytes: 0, installed: true }))).toBe('compatible')
  })

  // A probe reports absence rather than guessing zero, and absence must not read as "no space".
  it('does not refuse on a disk reading it could not take', () => {
    expect(fitOf(model(), offer({ diskFreeBytes: null }))).toBe('compatible')
  })
})

describe('fitObstacleOf', () => {
  /**
   * The verdict says `insufficient-memory` for both, and a screen reading it alone would tell
   * someone to close applications when what is full is their disk.
   */
  it('tells a full disk from a machine that is too small', () => {
    expect(fitObstacleOf(model(), offer({ diskFreeBytes: GIGA }))).toBe('disk')
    expect(fitObstacleOf(model({ reservationBytes: 50 * GIGA }), offer())).toBe('memory')
    expect(fitOf(model(), offer({ diskFreeBytes: GIGA }))).toBe(
      fitOf(model({ reservationBytes: 50 * GIGA }), offer()),
    )
  })

  it('names nothing standing in the way when the model simply fits', () => {
    expect(fitObstacleOf(model(), offer())).toBeNull()
    // `unknown` is a reading of the SOURCE, not an obstacle: nothing is in the way either.
    expect(fitObstacleOf(model(), offer({ snapshot: snapshot(40 * GIGA, 'probe') }))).toBeNull()
  })
})

describe('fitAllowsUse', () => {
  // `slow` runs and warns. Only a hard no keeps the model out of reach.
  it('lets everything through but a hard no', () => {
    expect(fitAllowsUse('compatible')).toBe(true)
    expect(fitAllowsUse('slow')).toBe(true)
    expect(fitAllowsUse('unknown')).toBe(true)
    expect(fitAllowsUse('insufficient-memory')).toBe(false)
    expect(fitAllowsUse('incompatible')).toBe(false)
  })
})
