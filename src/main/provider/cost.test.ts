import { APIError } from '@scenario-labs/sdk'
import { describe, expect, it, vi } from 'vitest'
import type { JobTarget } from '@shared/domain/job'
import { costEstimatorOf, type CostEstimator } from './cost'

const refusedWith = (status: number, body: object): unknown =>
  APIError.generate(status, body, undefined, new Headers())

// Nothing runs here by default: the cases below are about what the API answers.
const estimator = (answer: () => Promise<unknown>): CostEstimator =>
  costEstimatorOf(vi.fn(answer), () => false)

describe('cost estimate', () => {
  /**
   * What the API was observed doing on 9 August 2026, on both endpoints: 200, the figure beside
   * an empty `job`. The studio read the documented 402 alone, so no badge ever showed a price.
   */
  it('reads the estimate off the 200 a dry run answers with', async () => {
    const estimate = estimator(() =>
      Promise.resolve({ creativeUnitsCost: 12, creativeUnitsDiscount: 0, job: {} }),
    )

    await expect(estimate({ id: 'model_flux' }, { prompt: 'a rock' })).resolves.toEqual({
      creativeUnits: 12,
    })
  })

  /** A free model is priced at nothing, which is a figure — not the absence of one. */
  it('keeps a zero, which is a price and not a silence', async () => {
    const estimate = estimator(() => Promise.resolve({ creativeUnitsCost: 0, job: {} }))

    await expect(estimate({ id: 'model_free' }, {})).resolves.toEqual({
      creativeUnits: 0,
    })
  })

  /**
   * The documented answer, kept as a fallback: a dry run may refuse with a 402 carrying
   * `estimatedCost`. Read as an ordinary failure, the button would say nothing.
   */
  it('reads the estimate off the 402 the reference documents', async () => {
    const estimate = estimator(() =>
      Promise.reject(refusedWith(402, { message: 'Dry run completed', estimatedCost: 12 })),
    )

    await expect(estimate({ id: 'model_flux' }, { prompt: 'a rock' })).resolves.toEqual({
      creativeUnits: 12,
    })
  })

  it('asks whatever it was handed, with the body as it stands', async () => {
    const run = vi.fn(() => Promise.reject(refusedWith(402, { estimatedCost: 3 })))
    const target: JobTarget = { id: 'model_flux' }
    await costEstimatorOf(run, () => false)(target, { prompt: 'a rock' })

    expect(run).toHaveBeenCalledWith(target, { prompt: 'a rock' })
  })

  // A price is a courtesy: no figure means a button with no badge, never a button that refuses.
  it('answers with no figure rather than a failure when the API prices nothing', async () => {
    await expect(
      estimator(() => Promise.resolve({ job: {} }))({ id: 'model_flux' }, {}),
    ).resolves.toBeNull()
  })

  /**
   * A 402 is the answer; anything else is a failure, and swallowing it would leave an outage
   * with no line in the log and no entry in the journal — the button says nothing either way.
   */
  it('lets a refusal that is not a dry run travel', async () => {
    const estimate = estimator(() => Promise.reject(refusedWith(400, { message: 'bad body' })))

    await expect(estimate({ id: 'model_flux' }, {})).rejects.toThrow()
  })

  it('lets a dead network travel too', async () => {
    const estimate = estimator(() => Promise.reject(new Error('offline')))

    await expect(estimate({ id: 'model_flux' }, {})).rejects.toThrow('offline')
  })

  it('answers with no figure on a 402 that carries no number', async () => {
    const estimate = estimator(() => Promise.reject(refusedWith(402, { estimatedCost: 'twelve' })))

    await expect(estimate({ id: 'model_flux' }, {})).resolves.toBeNull()
  })

  // A 402 with nothing parsed behind it — a gateway's own page, an empty body.
  it('answers with no figure on a 402 that carries no body at all', async () => {
    const estimate = estimator(() =>
      Promise.reject(APIError.generate(402, undefined, 'Payment Required', new Headers())),
    )

    await expect(estimate({ id: 'model_flux' }, {})).resolves.toBeNull()
  })

  // A number that is not one: it would reach the button as « ~Infinity CU » or « ~NaN CU ».
  it('answers with no figure on a number that cannot be drawn', async () => {
    const estimate = estimator(() =>
      Promise.reject(refusedWith(402, { estimatedCost: Number.POSITIVE_INFINITY })),
    )

    await expect(estimate({ id: 'model_flux' }, {})).resolves.toBeNull()
  })
})

describe('a model of this machine', () => {
  /**
   * 🛑 Measured on screen: an estimate for `ssd-1b` reached `runModel` and came back
   * `404 Model ssd-1b not found`, journalled beside the generation's own failure — two error
   * lines for one gesture, and a request spent asking a service about something it never had.
   */
  it('is priced at nothing without the API being asked', async () => {
    const run = vi.fn(() => Promise.reject(new Error('the API must not be reached')))

    const estimate = await costEstimatorOf(run, () => true)({ id: 'ssd-1b' }, { prompt: 'a cat' })

    // Nothing rather than `null`: `null` reads as « could not estimate », and a consent asked for
    // a local model then promised a spend it could not size — Codex by MCP, 2026-09-06.
    expect(estimate).toEqual({ creativeUnits: 0 })
    expect(run).not.toHaveBeenCalled()
  })
})
