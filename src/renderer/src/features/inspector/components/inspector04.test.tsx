import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
// The expected words come from the French bundle rather than being spelt out, which is what keeps
// a renamed slot from leaving this case asserting a label the panel no longer draws.
import { meshNode, rigStateFixture } from '@/engines/scene/scene-fixtures'
import { type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installDocuments } from '@/stores/document-fixtures'
import { useSelection } from '@/stores/selection'
import { useSettings } from '@/stores/settings'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { useModelFiles } from '@/stores/modelFiles'
import { installScene } from '@/stores/scene-fixtures'
import { installMaterial } from '@/stores/material-fixtures'
import { inSection } from './inspector-fixtures'
import { addModelTo, selectIn, useScenes } from '@/stores/scenes'
import { definition } from '../../shell/tools/inspector'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { withQueries } from '@/features/shell/components/query-fixtures'

const { Content } = definition

function install(node: SceneNode, selected = true): SceneState {
  const state: SceneState = {
    ...EMPTY_SCENE,
    nodes: [node],
    selectedIds: selected ? [node.id] : [],
  }
  installScene('doc-1', state)
  return state
}

beforeEach(() => {
  install(meshNode('box-1'))
  // The preferences are a module-wide store: a case that writes one — the display unit — would
  // otherwise leave every case after it reading lengths in millimetres.
  useSettings.setState({ settings: DEFAULT_SETTINGS })
})

describe('the inspector on an imported model', () => {
  // The panel selection outlives a test file, and one left behind puts another face of the
  // inspector in front — an asset's, a layer's — where this one reads a scene node.
  beforeEach(() => {
    useSelection.getState().selectFiles([])
  })

  // 🛑 The inspector no longer picks a clip at all. WHICH block plays is set on the band, where
  // the block one is talking about is visible; the skeleton and the motions are the window's.
  it('says what a model is, and offers no skeleton form of its own', () => {
    install(modelNodeFixture('model-1'))
    useModelFiles.setState({
      clips: { 'doc-1': { 'model-1': ['walk'] } },
      rigs: { 'doc-1': { 'model-1': rigStateFixture([]) } },
    })
    render(withQueries(<Content />))

    expect(screen.queryByLabelText('Clip')).not.toBeInTheDocument()
    expect(screen.getByText(/pas encore animable/)).toBeInTheDocument()
  })

  /**
   * ONE question about what covers a model, where two panels stood: an inventory of the file's
   * own pictures titled « material of the model », and the choice, titled the same. The first
   * opened a material it never attached, so an edit saved from it reached nothing.
   */
  it('asks one question about what covers a model, and starts on its own file', () => {
    install(modelNodeFixture('model-1'))
    render(withQueries(<Content />))

    expect(screen.getByText('Habillage')).toBeInTheDocument()
    expect(screen.getByLabelText('Recouvert par')).toHaveValue('own')
    // The inventory of the file's own pictures is gone with the panel that showed it.
    expect(screen.queryByText('Images du modèle')).not.toBeInTheDocument()
  })

  // The two modes exclude each other, and the panel shows it: a model covered by a picture has no
  // material list to read, and one wearing materials has no picture slot.
  it('offers a picture slot or a list of materials, never both at once', () => {
    install(modelNodeFixture('model-1'))
    render(withQueries(<Content />))

    fireEvent.change(screen.getByLabelText('Recouvert par'), { target: { value: 'image' } })
    expect(screen.getByLabelText('Couleur de base')).toBeInTheDocument()
    expect(screen.queryByLabelText('Matière 1')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Recouvert par'), { target: { value: 'materials' } })
    expect(screen.getByLabelText('Matière 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Couleur de base')).not.toBeInTheDocument()
  })

  // Blender's `+` and `−`, and they belong to the SECTION: a list is grown from its heading, not
  // from a button per row.
  it('grows and shrinks the list of material slots from its heading', () => {
    install(modelNodeFixture('model-1'))
    render(withQueries(<Content />))

    fireEvent.change(screen.getByLabelText('Recouvert par'), { target: { value: 'materials' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un emplacement' }))
    expect(screen.getByLabelText('Matière 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer cet emplacement' }))
    expect(screen.queryByLabelText('Matière 2')).not.toBeInTheDocument()
  })

  // One slot is what the `materials` mode IS: taking the last away would leave a mode with no
  // list, which reads as « own file » while the document still says otherwise.
  it('refuses to take the last material slot away', () => {
    install(modelNodeFixture('model-1'))
    render(withQueries(<Content />))

    fireEvent.change(screen.getByLabelText('Recouvert par'), { target: { value: 'materials' } })

    expect(screen.getByRole('button', { name: 'Retirer cet emplacement' })).toBeDisabled()
  })
})

/**
 * The 3D space held its selection in the scene alone, where this panel never looked — so the
 * asset clicked to import a model went on being described for as long as the tab stayed open,
 * whatever was picked in the outliner or in the viewport afterwards.
 */
describe('the inspector and what is picked in a scene', () => {
  beforeEach(() => {
    useSelection.getState().selectFiles([])
  })

  it('describes the node picked in the scene, over the file picked in the explorer before it', () => {
    install(meshNode('box-1'), false)
    useSelection.getState().selectFiles(['Images/etude.png'])
    selectIn('doc-1', ['box-1'])
    render(withQueries(<Content />))

    expect(screen.getByText('Géométrie')).toBeInTheDocument()
  })

  // A COMMAND selects too, and none of them go through `selectIn`: an import selects the model it
  // just put down. The scene's own face follows it, whichever door the selection came through.
  it('describes the node an import just put down', () => {
    install(meshNode('box-1'), false)

    addModelTo('doc-1', {
      id: 'asset-1',
      name: 'Robot',
      type: 'mesh',
      location: 'local',
      tags: [],
      createdAt: '2026-08-14T10:00:00.000Z',
    })
    render(withQueries(<Content />))

    expect(screen.getByText('Transformation')).toBeInTheDocument()
  })

  // The scene's own face is what a click in the void leaves: its environment is read there, and
  // there is nowhere else to read it.
  it('falls back to the scene itself when the pick lands in the void', () => {
    install(meshNode('box-1'), false)
    selectIn('doc-1', ['box-1'])
    selectIn('doc-1', [])
    render(withQueries(<Content />))

    expect(screen.getByText('Environnement')).toBeInTheDocument()
    expect(screen.queryByText('Géométrie')).not.toBeInTheDocument()
  })

  /**
   * A node outlives the tab it was picked in — nothing clears the selection when one closes — so
   * it must not speak for a document it has nothing to do with. Guarded on the owner, the panel
   * went empty on every switch between two scenes; counted as a voice, it left every texture
   * opened afterwards with no face at all.
   */
  it('describes the scene in front, whichever one the node was picked in', () => {
    useScenes.setState({
      states: {
        'doc-1': { ...EMPTY_SCENE, nodes: [meshNode('box-1')] },
        'doc-2': { ...EMPTY_SCENE, nodes: [meshNode('box-2')] },
      },
      histories: {},
      saved: {},
    })
    installDocuments({ 'doc-1': '3d', 'doc-2': '3d' }, 'doc-1')
    selectIn('doc-1', ['box-1'])

    installDocuments({ 'doc-1': '3d', 'doc-2': '3d' }, 'doc-2')
    render(withQueries(<Content />))

    // Its environment, since nothing is picked in it — and never the empty state, which is what
    // three panels contradicting each other looks like: the outliner of doc-2 highlights nothing
    // while the inspector claims there is nothing to describe.
    expect(screen.getByText('Environnement')).toBeInTheDocument()
  })

  it('describes a texture brought in front after a node was picked', () => {
    install(meshNode('box-1'), false)
    selectIn('doc-1', ['box-1'])
    installMaterial('doc-2')
    render(withQueries(<Content />))

    expect(inSection('Matière').getByLabelText('Rugosité')).toBeInTheDocument()
  })
})
