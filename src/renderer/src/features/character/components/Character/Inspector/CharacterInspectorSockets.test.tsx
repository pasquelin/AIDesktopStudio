import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Rig } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { characterOf, seedCharacter, useCharacters } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { useCharacterView } from '@/stores/characterView'
import { CharacterInspectorSockets } from './CharacterInspectorSockets'

const ASSET = 'asset-hero'
const RIG: Rig = {
  origin: 'imported',
  bones: [
    { name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM, role: 'Hips' },
    { name: 'RightHand', parent: 'Hips', rest: IDENTITY_TRANSFORM },
  ],
}
const show = (rig: Rig | null = RIG): void => {
  render(<CharacterInspectorSockets assetId={ASSET} rig={rig} />)
}

const sockets = () => characterOf(useCharacters.getState(), ASSET).sockets

beforeEach(() => {
  clearCharacters()
  useCharacterView.setState({ views: {} })
  seedCharacter(ASSET, RIG, {})
})

describe('where an object can be hung on a character', () => {
  it('has nothing to say about a bare mesh', () => {
    seedCharacter(ASSET, null, {})
    show(null)

    expect(screen.queryByText(/point d’attache/i)).not.toBeInTheDocument()
  })

  it('says the character offers no point yet', () => {
    show()

    expect(screen.getByText(/aucun point d’attache/i)).toBeInTheDocument()
  })

  it('pins a named point on a bone, as one step of the history', async () => {
    show()

    await userEvent.type(screen.getByLabelText('Nom'), 'Main Droite')
    await userEvent.selectOptions(screen.getByLabelText('Os'), 'RightHand')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un point d’attache' }))

    expect(sockets()).toMatchObject([
      { name: 'Main Droite', bone: 'RightHand', rest: IDENTITY_TRANSFORM },
    ])
    expect(screen.getByLabelText('Nom')).toHaveValue('')

    useCharacters.getState().undo(ASSET)
    expect(sockets()).toEqual([])
  })

  it('offers the picked joint as the bone to pin on', () => {
    useCharacterView.getState().pickBone(ASSET, 'RightHand')
    show()

    expect(screen.getByLabelText('Os')).toHaveValue('RightHand')
  })

  it('takes a point back', async () => {
    seedCharacter(ASSET, RIG, {
      sockets: [{ id: 's1', name: 'Main Droite', bone: 'RightHand', rest: IDENTITY_TRANSFORM }],
    })
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Retirer ce point d’attache' }))

    expect(sockets()).toEqual([])
    expect(screen.getByText(/aucun point d’attache/i)).toBeInTheDocument()
  })

  it('adds nothing without a name', async () => {
    show()

    await userEvent.type(screen.getByLabelText('Nom'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un point d’attache' }))

    expect(sockets()).toEqual([])
  })
})
