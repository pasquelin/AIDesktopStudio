import { fireEvent, render, screen, within } from '@testing-library/react'
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

const show = (nodeId = NODE) =>
  render(<CharacterInspectorMorphs assetId={ASSET} documentId={WORKSHOP} nodeId={nodeId} />)

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
    expect(screen.queryByRole('group', { name: 'Formes' })).not.toBeInTheDocument()
  })

  it('draws one slider per shape the file reported, weighed at rest', () => {
    useModelFiles.getState().reportMorphs(WORKSHOP, NODE, ['smile', 'blink'])
    show()

    expect(screen.getByLabelText('smile')).toHaveValue('0')
    expect(screen.getByLabelText('blink')).toHaveValue('0')
  })

  it('mounts only the visible window of a long shape list', () => {
    const names = Array.from({ length: 150 }, (_, index) => `shape-${index}`)
    useModelFiles.getState().reportMorphs(WORKSHOP, NODE, names)
    show()

    expect(screen.getByLabelText('shape-0')).toBeInTheDocument()
    expect(screen.getAllByRole('slider').length).toBeLessThan(100)
  })

  it('resets a shape after it scrolls into the mounted window', async () => {
    const names = Array.from({ length: 150 }, (_, index) => `shape-${index}`)
    useModelFiles.getState().reportMorphs(WORKSHOP, NODE, names)
    show()
    const group = screen.getByRole('group', { name: 'Formes' })
    group.scrollTop = Number.MAX_SAFE_INTEGER
    fireEvent.scroll(group)
    const slider = await screen.findByLabelText('shape-149')
    fireEvent.change(slider, { target: { value: '0.75' } })
    const row = slider.closest('label')
    if (!row) throw new Error('The shape slider lost its labelled property row')

    fireEvent.click(within(row).getByRole('button'))

    expect(characterViewOf(useCharacterView.getState(), ASSET).morphs['shape-149']).toBe(0)
  })

  it("starts a different model's shapes at its first row", async () => {
    const other = 'node-other'
    useModelFiles.getState().reportMorphs(
      WORKSHOP,
      NODE,
      Array.from({ length: 150 }, (_, index) => `shape-${index}`),
    )
    useModelFiles.getState().reportMorphs(
      WORKSHOP,
      other,
      Array.from({ length: 150 }, (_, index) => `other-${index}`),
    )
    const view = show()
    const group = screen.getByRole('group', { name: 'Formes' })
    group.scrollTop = Number.MAX_SAFE_INTEGER
    fireEvent.scroll(group)
    await screen.findByLabelText('shape-149')

    view.rerender(<CharacterInspectorMorphs assetId={ASSET} documentId={WORKSHOP} nodeId={other} />)

    expect(screen.getByLabelText('other-0')).toBeInTheDocument()
  })

  // A weight is a preview of the view, never an edit of the character: the history stays empty.
  it('weighs a shape into the view, where the engine reads it', () => {
    useModelFiles.getState().reportMorphs(WORKSHOP, NODE, ['smile'])
    show()

    fireEvent.change(screen.getByLabelText('smile'), { target: { value: '0.75' } })

    expect(characterViewOf(useCharacterView.getState(), ASSET).morphs).toEqual({ smile: 0.75 })
  })
})
