import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { modelNodeFixture, rigStateFixture } from '@/engines/scene/scene-fixtures'
import type { RigState } from '@/engines/scene/rigState'
import { installFakeBridge } from '@/services/fakeBridge'
import { seedCharacter } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { useModelFiles } from '@/stores/modelFiles'
import { CharacterMotionSection } from './CharacterMotionSection'

const DOCUMENT = 'doc-1'
const ASSET = 'asset-hero'
const node = modelNodeFixture('a', ASSET)

const show = (): void => {
  render(<CharacterMotionSection assetId={ASSET} documentId={DOCUMENT} nodeId={node.id} />)
}

const measured = (rig: Partial<RigState> = {}): void => {
  useModelFiles.getState().reportRig(DOCUMENT, node.id, { ...rigStateFixture([]), ...rig })
}

const knowing = (...names: string[]): void => {
  seedCharacter(ASSET, null, {
    motions: names.map((name, index) => ({ id: `m-${index}`, name, assetId: `asset-${name}` })),
  })
}

beforeEach(() => {
  clearCharacters()
  useModelFiles.setState({ rigs: {} })
  installFakeBridge({})
})

describe('the motions a model of a scene knows', () => {
  it('says nothing at all while the file has not landed', () => {
    show()

    expect(screen.queryByText('Mouvements')).not.toBeInTheDocument()
  })

  /**
   * 🛑 A motion drives JOINTS. On a bare mesh the picker laid a real block onto a skeleton that
   * does not exist — `retargetPlanOf` pairs no bone — so it played, the head ran, and the model
   * stood still with nothing saying why. Moving the object itself stays a matter of transform
   * keys, which every node carries.
   */
  it('offers none on a bare mesh, which has no joint to drive', () => {
    measured({ status: 'staticMesh' })
    show()

    expect(screen.queryByText('Mouvements')).not.toBeInTheDocument()
  })

  /**
   * 🛑 `boneCount` counts the UNNAMED bones too, so a file whose export stripped its joint names
   * reads `skinnedMesh` — while `wireBonesOf` skips every one of them and the retarget pairs
   * nothing. Reading the status alone left the picker open on exactly that file.
   */
  it('offers none where the file carries bones no name can address', () => {
    measured({ status: 'skinnedMesh', boneCount: 22, bones: [], boneNames: [] })
    show()

    expect(screen.queryByText('Mouvements')).not.toBeInTheDocument()
  })

  it('offers them as soon as the file carries named bones, humanoid or not', () => {
    measured(rigStateFixture(['Hips', 'Spine']))
    show()

    expect(screen.getByText('Mouvements')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un mouvement' })).toBeInTheDocument()
  })

  /**
   * 🛑 A linked motion is written in the `.glb`, and this list holds the only way to unlink one.
   * Hidden, a model re-exported without its skeleton kept claiming motions nobody could remove.
   */
  it('keeps what is already linked reachable, and says why nothing more may be added', () => {
    measured({ status: 'staticMesh' })
    knowing('Marche')
    show()

    expect(screen.getByText('Marche')).toBeInTheDocument()
    expect(screen.getByText(/pas de squelette/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un mouvement' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer ce mouvement' })).toBeInTheDocument()
  })
})
