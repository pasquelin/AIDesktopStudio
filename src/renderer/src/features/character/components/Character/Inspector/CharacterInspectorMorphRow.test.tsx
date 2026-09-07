import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Slider from '@/components/SliderField'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { CharacterInspectorMorphRow } from './CharacterInspectorMorphRow'

const { drawn } = vi.hoisted(() => ({ drawn: vi.fn() }))

// The real field, counted: what this file is about is HOW MANY of them redraw when one moves.
vi.mock('@/components/SliderField', async importOriginal => {
  const held = await importOriginal<typeof Slider>()
  return {
    ...held,
    SliderField: (props: Slider.SliderFieldProps) => {
      drawn(props.label)
      return held.SliderField(props)
    },
  }
})

const ASSET = 'asset-hero'

beforeEach(() => {
  useCharacterView.setState({ views: {} })
  drawn.mockClear()
})

describe('one shape of a face, weighed', () => {
  /**
   * 🛑 A face carries around fifty-two shapes — under the hundred a virtual list starts windowing
   * at, so every one of them is mounted. Reading the weights as a RECORD redrew all of them on
   * every drag of any one.
   */
  it('redraws itself alone when its weight moves', () => {
    render(
      <>
        <CharacterInspectorMorphRow assetId={ASSET} name="smile" />
        <CharacterInspectorMorphRow assetId={ASSET} name="blink" />
        <CharacterInspectorMorphRow assetId={ASSET} name="frown" />
      </>,
    )
    drawn.mockClear()

    fireEvent.change(screen.getByLabelText('smile'), { target: { value: '0.75' } })

    expect(drawn.mock.calls.flat()).toEqual(['smile'])
  })

  it('weighs its own shape into the view, and reads it back', () => {
    render(<CharacterInspectorMorphRow assetId={ASSET} name="smile" />)

    fireEvent.change(screen.getByLabelText('smile'), { target: { value: '0.75' } })

    expect(characterViewOf(useCharacterView.getState(), ASSET).morphs).toEqual({ smile: 0.75 })
    expect(screen.getByLabelText('smile')).toHaveValue('0.75')
  })
})
