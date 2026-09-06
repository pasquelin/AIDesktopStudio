import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { workshopIdOf } from '@shared/domain/character'
import { seedCharacter } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { useModelFiles } from '@/stores/modelFiles'
import { CharacterInspectorMorphs } from './CharacterInspectorMorphs'

const ASSET = 'asset-hero'
const WORKSHOP = workshopIdOf(ASSET)
const NODE = 'node-hero'

const show = (): void => {
  render(<CharacterInspectorMorphs assetId={ASSET} documentId={WORKSHOP} nodeId={NODE} />)
}

beforeEach(() => {
  clearCharacters()
  useCharacterView.setState({ views: {} })
  useModelFiles.getState().forget(WORKSHOP)
  seedCharacter(ASSET, null, {})
})

describe('the shapes a model offers to weigh', () => {
  it('says the file carries none', () => {
    show()

    expect(screen.getByText(/aucune forme/i)).toBeInTheDocument()
  })

  it('draws one slider per shape the file reported, weighed at rest', () => {
    useModelFiles.getState().reportMorphs(WORKSHOP, NODE, ['smile', 'blink'])
    show()

    expect(screen.getByLabelText('smile')).toHaveValue('0')
    expect(screen.getByLabelText('blink')).toHaveValue('0')
  })

  // A weight is a preview of the view, never an edit of the character: the history stays empty.
  it('weighs a shape into the view, where the engine reads it', () => {
    useModelFiles.getState().reportMorphs(WORKSHOP, NODE, ['smile'])
    show()

    fireEvent.change(screen.getByLabelText('smile'), { target: { value: '0.75' } })

    expect(characterViewOf(useCharacterView.getState(), ASSET).morphs).toEqual({ smile: 0.75 })
  })
})
