import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AiOverview, RoleRow } from '@shared/domain/aiOverview'
import { aiRoleId, SMART_SELECTION_ROLE } from '@shared/domain/aiRole'
import { localModel } from '@shared/domain/localModel-fixtures'
import { useAiModels } from '@/stores/aiModels'
import { chooseModels } from '@/stores/models-fixtures'
import { useModelForCapability } from '@/hooks/useModelForCapability'
import { SMART_SELECTION_MODEL } from '@shared/domain/smartSelectionInference'
import { localModelReady, modelForCapability, modelIsOnThisMachine } from './modelForCapability'

const imageRow = (over: Partial<RoleRow> = {}): RoleRow => ({
  role: aiRoleId('image', 'txt2img'),
  provider: null,
  chosen: { app: null, project: null },
  candidates: [
    {
      model: localModel({ id: 'ssd-1b' }),
      installed: true,
      loaded: false,
      holdable: true,
      unverified: false,
      supplied: false,
      serves: 1,
      fit: 'compatible',
      obstacle: null,
    },
  ],
  clouds: ['scenario'],
  ...over,
})

const overviewOf = (row: RoleRow): AiOverview => ({
  roles: [row],
  machine: { physicalBytes: 1, availableBytes: 1, diskFreeBytes: 1, gpu: null, vram: null },
  projectPath: null,
  installing: null,
  loading: null,
  loadFailure: null,
  installFailure: null,
  ollama: { ready: false, installed: false, names: [], progress: null, failed: false },
  engine: { known: false, missing: [], progress: null, failed: false },
})

const TXT2IMG = aiRoleId('image', 'txt2img')

beforeEach(() => {
  chooseModels()
  useAiModels.setState({ overview: null })
})

/**
 * The two forms answer one question, so they are tested against the same cases: the day they
 * disagree is the day a panel says a model is there and the one beside it says it is not.
 */
describe.each([
  ['read once', () => modelForCapability(TXT2IMG) ?? null],
  ['subscribed', () => renderHook(() => useModelForCapability(TXT2IMG)).result.current],
])('the model an employment generates with, %s', (_form, read) => {
  it('takes the one chosen for it', () => {
    chooseModels({ [TXT2IMG]: 'flux' })

    expect(read()).toBe('flux')
  })

  /**
   * 🛑 ADR-23 § C. The same weights serve `txt2img` and `inpaint`, and a person may well have
   * picked differently for each: filed per family, choosing a model to retouch with replaced the
   * one text-to-image was on, silently.
   */
  it('leaves the choice made for another employment of the same family alone', () => {
    chooseModels({ [aiRoleId('image', 'inpaint')]: 'ssd-1b' })

    expect(read()).toBeNull()
  })
})

it('recognises a model of this machine from the overview', () => {
  expect(modelIsOnThisMachine('ssd-1b', null)).toBe(false)
  expect(modelIsOnThisMachine('ssd-1b', overviewOf(imageRow()))).toBe(true)
  expect(modelIsOnThisMachine('flux', overviewOf(imageRow()))).toBe(false)
})

/** What the person chose in the settings wins: a panel leftover is not a decision. */
it('honours a local employment over the panel leftover', () => {
  chooseModels({ [TXT2IMG]: 'flux' })
  useAiModels.setState({
    overview: overviewOf(imageRow({ provider: { kind: 'local', modelId: 'ssd-1b' } })),
  })

  expect(modelForCapability(TXT2IMG)).toBe('ssd-1b')
})

/**
 * 🛑 A model of THIS machine is never sent to a cloud: the employment is served by an account,
 * and a leftover local id would be asked of a catalogue that has never heard of it.
 */
it('does not send a local leftover when the employment is a cloud', () => {
  chooseModels({ [TXT2IMG]: 'ssd-1b' })
  useAiModels.setState({
    overview: overviewOf(imageRow({ provider: { kind: 'cloud', providerId: 'scenario' } })),
  })

  expect(modelForCapability(TXT2IMG)).toBeUndefined()
})

it('names a cloud with no catalogue as the model itself', () => {
  const role = aiRoleId('code', 'txt2code')
  useAiModels.setState({
    overview: overviewOf(
      imageRow({ role, provider: { kind: 'cloud', providerId: 'anthropic' }, clouds: [] }),
    ),
  })

  expect(modelForCapability(role)).toBe('cloud:anthropic')
})

/** A code model of THIS machine is named by its own id, like every other local employment. */
it('names a code model of this machine by its manifest id', () => {
  const role = aiRoleId('code', 'txt2code')
  useAiModels.setState({
    overview: overviewOf(
      imageRow({ role, provider: { kind: 'local', modelId: 'qwen2.5-coder-7b-instruct-q4' } }),
    ),
  })

  expect(modelForCapability(role)).toBe('qwen2.5-coder-7b-instruct-q4')
})

/** Only the subscribed form takes one: the rail asks about the home, which generates nothing. */
it('answers nothing for no employment at all', () => {
  chooseModels({ [TXT2IMG]: 'flux' })

  expect(renderHook(() => useModelForCapability(null)).result.current).toBeNull()
})

/**
 * `[M]` The manager republishes the whole overview per percent of a load and per tick of an
 * install — around a hundred times per download — and the generator and every rail read this.
 * Subscribing to the object itself re-rendered them all for an answer that had not moved.
 */
it('does not re-render when a republished overview leaves the answer alone', () => {
  chooseModels({ [TXT2IMG]: 'flux' })
  useAiModels.setState({ overview: overviewOf(imageRow()) })

  let renders = 0
  const { result } = renderHook(() => {
    renders += 1
    return useModelForCapability(TXT2IMG)
  })
  const before = renders

  act(() => {
    useAiModels.setState({ overview: overviewOf(imageRow()) })
  })

  expect(result.current).toBe('flux')
  expect(renders).toBe(before)
})

/**
 * The gesture and the batch edit part company here. `smartSelectionHost` loads the shipped model
 * by NAME, so a cloud chosen for `background-removal/cutout` serves the menu's cutout and never
 * the pointer: reading the employment armed the tool, and the engine then refused the click.
 */
describe('whether a model of this machine is there to be run', () => {
  const cutoutRow = (over: Partial<RoleRow> = {}): RoleRow => ({
    ...imageRow(),
    role: SMART_SELECTION_ROLE,
    candidates: [
      {
        ...imageRow().candidates[0]!,
        model: localModel({ id: SMART_SELECTION_MODEL }),
      },
    ],
    ...over,
  })

  it('says no while nothing has been read at all', () => {
    expect(localModelReady(SMART_SELECTION_MODEL, null)).toBe(false)
  })

  it('says yes for a shipped model on the disk and allowed by the machine', () => {
    expect(localModelReady(SMART_SELECTION_MODEL, overviewOf(cutoutRow()))).toBe(true)
  })

  it('says no for one the machine has not the memory for, though it sits on the disk', () => {
    const refused = cutoutRow({
      candidates: [{ ...cutoutRow().candidates[0]!, fit: 'insufficient-memory' }],
    })

    expect(localModelReady(SMART_SELECTION_MODEL, overviewOf(refused))).toBe(false)
  })

  it('says no for one that was never downloaded', () => {
    const absent = cutoutRow({
      candidates: [{ ...cutoutRow().candidates[0]!, installed: false }],
    })

    expect(localModelReady(SMART_SELECTION_MODEL, overviewOf(absent))).toBe(false)
  })

  /** The whole point: the employment is served, and what runs the gesture is still not there. */
  it('says no when a cloud serves the employment and the shipped model is absent', () => {
    const cloudServed = cutoutRow({
      provider: { kind: 'cloud', providerId: 'scenario' },
      candidates: [{ ...cutoutRow().candidates[0]!, installed: false }],
    })

    expect(localModelReady(SMART_SELECTION_MODEL, overviewOf(cloudServed))).toBe(false)
  })
})
