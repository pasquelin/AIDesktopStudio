import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LOCAL_RUNTIME, type ModelSummary } from '@shared/domain/model'
import { ModelPicker } from './ModelPicker'

const model = (over: Partial<ModelSummary> & { id: string }): ModelSummary => ({
  name: over.id,
  family: 'image',
  runsOn: 'scenario',
  source: 'scenario',
  origin: 'community',
  featured: false,
  capabilities: ['txt2img'],
  tags: [],
  ...over,
})

const MODELS: readonly ModelSummary[] = [
  model({ id: 'ssd-1b', name: 'SSD-1B', runsOn: LOCAL_RUNTIME, installed: true }),
  model({ id: 'sana', name: 'Sana 600M', runsOn: LOCAL_RUNTIME, installed: false }),
  model({ id: 'flux', name: 'Flux' }),
]

function open(over: Partial<Parameters<typeof ModelPicker>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <ModelPicker
      models={MODELS}
      value="ssd-1b"
      onChange={onChange}
      emptyLabel="Choisir un modèle"
      {...over}
    />,
  )

  return { onChange }
}

describe('the model in use', () => {
  it('is what the closed control names', () => {
    open()

    expect(screen.getByRole('button', { name: /SSD-1B/ })).toBeInTheDocument()
  })

  // § 20: the panel says what stands in the way rather than letting a click end in a 403.
  it('says so when nothing serves the employment yet', () => {
    open({ value: null })

    expect(screen.getByRole('button', { name: 'Choisir un modèle' })).toBeInTheDocument()
  })
})

// A `<button>` is labelable: the word above it has to open the list, or the name is decoration.
it('lets a label above it bind to the control', () => {
  render(
    <>
      <label htmlFor="picker">Modèle</label>
      <ModelPicker
        id="picker"
        models={MODELS}
        value="ssd-1b"
        onChange={vi.fn()}
        emptyLabel="Choisir un modèle"
      />
    </>,
  )

  expect(screen.getByLabelText('Modèle')).toBe(screen.getByRole('button', { name: /Modèle/ }))
})

describe('the pictures it will need', () => {
  // 🛑 Measured on screen: the round trip is ~830ms, and asking on OPEN drew 54 empty plates of
  // 61 for the whole of it. Asked for while the flyout is still closed, or a person never sees one.
  it('are asked for before the flyout is ever opened', () => {
    const onVisible = vi.fn()
    open({ onVisible })

    expect(onVisible.mock.calls.at(-1)?.[0].map((one: ModelSummary) => one.id)).toEqual([
      'ssd-1b',
      'sana',
      'flux',
    ])
  })
})

describe('choosing another one', () => {
  /**
   * § 15: it opens a flyout rather than replacing what is around it. Choosing a model is a step
   * of a generation, not a destination — the prompt above it has to stay on screen.
   */
  it('opens a menu without taking the panel away', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(MODELS.length)
  })

  it('answers with the model that was picked', async () => {
    const { onChange } = open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Flux/ }))

    expect(onChange).toHaveBeenCalledWith('flux')
  })

  it('closes once one is picked', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Flux/ }))

    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('narrowing the list', () => {
  it('keeps only what the search names', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'sana')

    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })

  it('keeps only what runs on this machine', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Local' }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })

  /**
   * `installed` is ABSENT for a cloud model, so a facet reading `!== false` let the whole
   * catalogue through and said nothing. It answers one question: are the weights on this disk.
   */
  it('keeps only the weights this disk holds under the installed facet', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Installé' }))

    expect(screen.getAllByRole('menuitem').map(row => row.textContent)).toEqual([
      expect.stringContaining('SSD-1B'),
    ])
  })

  it('says so when the narrowing matches nothing', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'nothing of the sort')

    expect(screen.queryAllByRole('menuitem')).toEqual([])
  })
})

// § 20 again, one row at a time: a download and a subscription are not the same gesture, and the
// difference has to be readable before the click rather than after it.
it('says on the row what stands between a model and a generation', async () => {
  open({
    refusalOf: candidate =>
      candidate.installed === false
        ? { word: 'Non installé', hint: 'Le studio peut récupérer ses poids' }
        : undefined,
  })

  await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))

  expect(screen.getByRole('menuitem', { name: /Sana 600M/ })).toHaveTextContent('Non installé')
})

/**
 * A promotion is a word on a row and nothing else: the picker shows every model it is handed,
 * in the order it is handed them. What is promoted is the HOST's business — see `GeneratorModel`.
 */
it('carries the host’s word onto a row without hiding any other', async () => {
  open({ promotedOf: candidate => (candidate.id === 'flux' ? 'pixel art' : undefined) })

  await userEvent.click(screen.getByRole('button', { name: /SSD-1B/ }))

  expect(screen.getAllByRole('menuitem')).toHaveLength(MODELS.length)
  expect(screen.getByRole('menuitem', { name: /Flux/ })).toHaveTextContent('pixel art')
  expect(screen.getByRole('menuitem', { name: /Sana 600M/ })).not.toHaveTextContent('pixel art')
})
