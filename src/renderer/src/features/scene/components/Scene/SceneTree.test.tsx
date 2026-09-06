import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { groupNodeFixture, meshNode } from '@/engines/scene/scene-fixtures'
import { SceneTree } from './SceneTree'
import { SceneActions } from './SceneActions'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { useModelFiles } from '@/stores/modelFiles'
import { workshopIdOf } from '@shared/domain/character'

/** jsdom implements no `DataTransfer`; the tree reads exactly these three members of one. */
function dragData() {
  const held = new Map<string, string>()
  const data = {
    // Read on the event after the one that set it, so it has to follow along.
    types: [] as string[],
    setData: (type: string, value: string) => {
      held.set(type, value)
      data.types = [...held.keys()]
    },
    getData: (type: string) => held.get(type) ?? '',
  }
  return data
}

function scene() {
  return sceneOf(useScenes.getState(), 'doc-1')
}

beforeEach(() => {
  installScene('doc-1')
})

describe('SceneTree', () => {
  it('shows and selects multiple meshes below one model root without making them scene nodes', async () => {
    const model = modelNodeFixture('character')
    useScenes.getState().replace('doc-1', { ...EMPTY_SCENE, nodes: [model] })
    useModelFiles.getState().reportMaterials(
      'doc-1',
      model.id,
      2,
      ['Hair', 'Skin'],
      [
        { id: 'mesh-0', name: 'Hair', materialSlots: [0] },
        { id: 'mesh-1', name: 'Head', materialSlots: [1] },
      ],
    )

    render(<SceneTree documentId="doc-1" modelContents />)

    expect(screen.getByText('Hair')).toBeInTheDocument()
    expect(screen.getByText('Head')).toBeInTheDocument()
    expect(scene().nodes).toEqual([model])

    await userEvent.click(screen.getByText('Hair'))

    expect(scene().selectedIds).toEqual([model.id])
    expect(useModelFiles.getState().selectedParts['doc-1']).toBe(`${model.id}:mesh-0`)
  })

  it('shows the scene root and its three default lights', () => {
    render(<SceneTree documentId="doc-1" />)

    expect(screen.getByText('Scène')).toBeInTheDocument()
    expect(screen.getByText('AmbientLight')).toBeInTheDocument()
    expect(screen.getByText('DirectionalLight')).toBeInTheDocument()
    expect(screen.getByText('HemisphereLight')).toBeInTheDocument()
  })

  it('selects the node the user clicks', async () => {
    render(<SceneTree documentId="doc-1" />)

    await userEvent.click(screen.getByText('AmbientLight'))

    expect(scene().selectedIds).toEqual([scene().nodes[0]?.id])
  })

  it('adds a node to the selection on a command-click, and removes it on the next', async () => {
    const user = userEvent.setup()
    render(<SceneTree documentId="doc-1" />)

    await user.click(screen.getByText('AmbientLight'))
    await user.keyboard('{Meta>}')
    await user.click(screen.getByText('HemisphereLight'))
    expect(scene().selectedIds).toHaveLength(2)

    await user.click(screen.getByText('HemisphereLight'))
    await user.keyboard('{/Meta}')
    expect(scene().selectedIds).toEqual([scene().nodes[0]?.id])
  })

  it('selects everything between the anchor and a shift-clicked node', async () => {
    const user = userEvent.setup()
    render(<SceneTree documentId="doc-1" />)

    await user.click(screen.getByText('AmbientLight'))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('HemisphereLight'))
    await user.keyboard('{/Shift}')

    expect(scene().selectedIds).toEqual(scene().nodes.map(node => node.id))
  })

  // The root is drawn, but it is not a node: selecting it means selecting nothing.
  it('clears the selection when the root is clicked', async () => {
    render(<SceneTree documentId="doc-1" />)

    await userEvent.click(screen.getByText('AmbientLight'))
    await userEvent.click(screen.getByText('Scène'))

    expect(scene().selectedIds).toEqual([])
  })

  // Extending to a row that cannot be selected has nowhere to land: it clears, like a plain click.
  it('never puts the root into a selection, whatever modifier is held', async () => {
    const user = userEvent.setup()
    render(<SceneTree documentId="doc-1" />)

    await user.click(screen.getByText('HemisphereLight'))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('Scène'))
    await user.keyboard('{/Shift}')

    expect(scene().selectedIds).toEqual([])
  })

  it('offers no eye on the root, which has nothing to hide', () => {
    render(<SceneTree documentId="doc-1" />)

    expect(screen.getAllByRole('button', { name: 'Afficher ou masquer' })).toHaveLength(3)
  })

  it('toggles visibility from the eye, through the history', async () => {
    render(<SceneTree documentId="doc-1" />)

    const eyes = screen.getAllByRole('button', { name: 'Afficher ou masquer' })
    await userEvent.click(eyes[0] as HTMLElement)
    expect(scene().nodes[0]?.visible).toBe(false)

    useScenes.getState().undo('doc-1')
    expect(scene().nodes[0]?.visible).toBe(true)
  })

  it('leaves the selection alone when the eye is clicked', async () => {
    render(<SceneTree documentId="doc-1" />)

    const eyes = screen.getAllByRole('button', { name: 'Afficher ou masquer' })
    await userEvent.click(eyes[1] as HTMLElement)

    expect(scene().selectedIds).toEqual([])
  })

  it('hangs a node from another when its row is dropped onto it, through the history', () => {
    render(<SceneTree documentId="doc-1" />)
    const rows = screen.getAllByRole('treeitem')

    const data = dragData()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    // The hover comes first, as the browser sends it: it is where the tree resolves what a
    // release would do, and the drop reports that same answer.
    fireEvent.dragOver(rows[2]!, { dataTransfer: data })
    fireEvent.drop(rows[2]!, { dataTransfer: data })

    const [first, second] = scene().nodes
    expect(first?.parentId).toBe(second?.id)

    useScenes.getState().undo('doc-1')
    expect(scene().nodes[0]?.parentId).toBeNull()
  })

  // The root stands for the scene: dropping onto it is how a node comes back out of a group.
  it('brings a node back out to the scene when dropped on the root', () => {
    render(<SceneTree documentId="doc-1" />)
    const rowOf = (name: string): HTMLElement =>
      screen.getByText(name).closest('[role="treeitem"]') as HTMLElement

    const down = dragData()
    fireEvent.dragStart(rowOf('AmbientLight'), { dataTransfer: down })
    fireEvent.dragOver(rowOf('DirectionalLight'), { dataTransfer: down })
    fireEvent.drop(rowOf('DirectionalLight'), { dataTransfer: down })
    expect(scene().nodes[0]?.parentId).not.toBeNull()

    // The drop opened the branch it landed in, so the moved row is still on screen.
    const out = dragData()
    fireEvent.dragStart(rowOf('AmbientLight'), { dataTransfer: out })
    fireEvent.dragOver(rowOf('Scène'), { dataTransfer: out })
    fireEvent.drop(rowOf('Scène'), { dataTransfer: out })

    expect(scene().nodes[0]?.parentId).toBeNull()
  })

  /**
   * The half the outliner did not have until 2026-08-26: every row was a target over its whole
   * height, so a node aimed BETWEEN two rows went inside one. jsdom measures at zero, so the row
   * is given a height — where in it the pointer sits tells an insertion from a reparent.
   */
  it('moves a node along its level when dropped between two rows, through the history', () => {
    render(<SceneTree documentId="doc-1" />)
    const rows = screen.getAllByRole('treeitem')
    const order = (): (string | undefined)[] =>
      scene()
        .nodes.filter(node => node.parentId === null)
        .map(node => node.name)
    const before = order()

    const data = dragData()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    // The bottom edge of the row below it: past it, and at the same level.
    rows[2]!.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
    fireEvent.dragOver(rows[2]!, { dataTransfer: data, clientY: 27 })
    fireEvent.drop(rows[2]!, { dataTransfer: data, clientY: 27 })

    expect(order()).toEqual([before[1], before[0], ...before.slice(2)])

    useScenes.getState().undo('doc-1')
    expect(order()).toEqual(before)
  })

  // It stands for the scene, not for a node: there is nothing for a row to sit beside it in.
  it('offers no insertion beside the root, only the drop that goes into it', () => {
    render(<SceneTree documentId="doc-1" />)
    const rows = screen.getAllByRole('treeitem')
    const before = scene().nodes.map(node => node.parentId)

    const data = dragData()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    rows[0]!.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
    fireEvent.dragOver(rows[0]!, { dataTransfer: data, clientY: 1 })
    fireEvent.drop(rows[0]!, { dataTransfer: data, clientY: 1 })

    // Taken as a drop INTO the scene, which is what the root means, and the node was already
    // there: nothing moved, and nothing was written to the history either.
    expect(scene().nodes.map(node => node.parentId)).toEqual(before)
  })

  /**
   * The reason anyone selects six objects: filing them all at once. ONE entry in the history —
   * six ⌘Z for one gesture is six presses the hand never asked for.
   */
  it('files the whole selection into the row it is dropped on, in one entry', async () => {
    const user = userEvent.setup()
    render(<SceneTree documentId="doc-1" />)
    const rowOf = (name: string): HTMLElement =>
      screen.getByText(name).closest('[role="treeitem"]') as HTMLElement

    await user.click(screen.getByText('AmbientLight'))
    await user.keyboard('{Meta>}')
    await user.click(screen.getByText('HemisphereLight'))
    await user.keyboard('{/Meta}')

    const data = dragData()
    fireEvent.dragStart(rowOf('AmbientLight'), { dataTransfer: data })
    fireEvent.dragOver(rowOf('DirectionalLight'), { dataTransfer: data })
    fireEvent.drop(rowOf('DirectionalLight'), { dataTransfer: data })

    const under = (name: string): string | null | undefined =>
      scene().nodes.find(node => node.name === name)?.parentId
    const sun = scene().nodes.find(node => node.name === 'DirectionalLight')?.id
    expect([under('AmbientLight'), under('HemisphereLight')]).toEqual([sun, sun])

    useScenes.getState().undo('doc-1')
    expect([under('AmbientLight'), under('HemisphereLight')]).toEqual([null, null])
  })

  // Handed over in the order of the screen, and laid down in that order: a batch that arrived
  // upside down would be a gesture nobody asked for.
  it('lays a selection dropped between two rows down in the order it was shown', async () => {
    const user = userEvent.setup()
    render(<SceneTree documentId="doc-1" />)
    const rows = screen.getAllByRole('treeitem')
    const order = (): (string | undefined)[] =>
      scene()
        .nodes.filter(node => node.parentId === null)
        .map(node => node.name)
    const [first, second, third] = order()

    // The last two rows, picked bottom first so the selection is built against the screen.
    await user.click(screen.getByText(third!))
    await user.keyboard('{Meta>}')
    await user.click(screen.getByText(second!))
    await user.keyboard('{/Meta}')

    const data = dragData()
    fireEvent.dragStart(rows[2]!, { dataTransfer: data })
    // The top edge of the first row of the level.
    rows[1]!.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
    fireEvent.dragOver(rows[1]!, { dataTransfer: data, clientY: 3 })
    fireEvent.drop(rows[1]!, { dataTransfer: data, clientY: 3 })

    expect(order().slice(0, 3)).toEqual([second, third, first])
    // 🛑 And the SCREEN follows: sorted by name whatever the scene held, the drag wrote a command
    // and an undo entry for a row that never moved.
    expect(
      screen
        .getAllByRole('treeitem')
        .slice(1, 4)
        .map(row => row.textContent),
    ).toEqual([second, third, first])
  })

  it('folds the root away, which is session state and not an edit', async () => {
    render(<SceneTree documentId="doc-1" />)

    await userEvent.click(
      screen.getAllByRole('treeitem')[0]?.querySelector('[data-chevron]') as HTMLElement,
    )

    expect(screen.queryByText('AmbientLight')).not.toBeInTheDocument()
  })

  it('forgets the open descendants when their parent is folded', async () => {
    installScene('doc-1', {
      ...EMPTY_SCENE,
      nodes: [
        groupNodeFixture('parent'),
        groupNodeFixture('child', 'parent'),
        meshNode('leaf', 'child'),
      ],
    })
    render(<SceneTree documentId="doc-1" />)

    expect(screen.getByText('leaf')).toBeInTheDocument()
    await userEvent.click(
      screen
        .getByText('parent')
        .closest('[role="treeitem"]')
        ?.querySelector('[data-chevron]') as HTMLElement,
    )
    await userEvent.click(
      screen
        .getByText('parent')
        .closest('[role="treeitem"]')
        ?.querySelector('[data-chevron]') as HTMLElement,
    )

    expect(screen.getByText('child')).toBeInTheDocument()
    expect(screen.queryByText('leaf')).not.toBeInTheDocument()
  })

  it('searches the scene tree and offers the inverse global fold action', async () => {
    render(
      <>
        <SceneActions />
        <SceneTree documentId="doc-1" />
      </>,
    )

    await userEvent.type(screen.getByRole('searchbox'), 'Ambient')
    expect(screen.getByText('AmbientLight')).toBeInTheDocument()
    expect(screen.queryByText('DirectionalLight')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tout replier' }))
    expect(screen.queryByText('AmbientLight')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tout déplier' })).toBeInTheDocument()
  })

  it('raises the node menu on a right-click, and nothing on the root', () => {
    const menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    render(<SceneTree documentId="doc-1" />)

    fireEvent.contextMenu(screen.getByText('AmbientLight'))
    expect(menu.labels()).toContain('Supprimer')

    // The root is a row but not a node: it stands for the scene, which has no name and no delete.
    fireEvent.contextMenu(screen.getByText('Scène'))
    expect(menu.raised).toHaveLength(1)
  })

  // The workshop of a model tab lists that one model: a scene menu there offered to delete it.
  it('raises the workshop menu, not the scene one, on the model of a character tab', () => {
    const workshop = workshopIdOf('asset-hero')
    const model = modelNodeFixture('character')
    useScenes.getState().replace(workshop, { ...EMPTY_SCENE, nodes: [model] })
    const menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    render(<SceneTree documentId={workshop} modelContents />)

    fireEvent.contextMenu(screen.getByText(model.name))

    expect(menu.labels()).toContain('Afficher les os')
    expect(menu.labels()).not.toContain('Supprimer')
  })

  /**
   * The rows of that menu act on the SELECTION, so what a right-click does to it is half the
   * gesture: it aims, it never composes. The pointer event matters as much as the menu one, and
   * macOS is where it bit hardest — Chromium delivers the Mac's secondary click as button 2 WITH
   * `ctrlKey`, which the row read as a toggle and used to take the node back out, leaving a
   * delete row that acted on the five others or on nothing at all. Not written as a case of its
   * own: the polyfilled pointer event of this environment drops the modifier, so it would pass
   * on the very defect it describes. One filter answers both.
   */
  it('keeps a selection of several when one of them is right-clicked', async () => {
    const user = userEvent.setup()
    installFakeBridge({ menu: fakeMenu().bridge })
    render(<SceneTree documentId="doc-1" />)
    const rowOf = (name: string): HTMLElement =>
      screen.getByText(name).closest('[role="treeitem"]') as HTMLElement

    await user.click(screen.getByText('AmbientLight'))
    await user.keyboard('{Meta>}')
    await user.click(screen.getByText('HemisphereLight'))
    await user.keyboard('{/Meta}')
    expect(scene().selectedIds).toHaveLength(2)

    fireEvent.pointerDown(rowOf('AmbientLight'), { button: 2 })
    fireEvent.contextMenu(rowOf('AmbientLight'), { button: 2 })

    expect(scene().selectedIds).toHaveLength(2)
  })

  it('renames a node from its own row, through the history', async () => {
    render(<SceneTree documentId="doc-1" />)

    await userEvent.dblClick(screen.getByText('AmbientLight'))
    await userEvent.clear(screen.getByLabelText('Renommer l’objet'))
    await userEvent.type(screen.getByLabelText('Renommer l’objet'), 'Soleil{Enter}')

    expect(scene().nodes[0]?.name).toBe('Soleil')
    useScenes.getState().undo('doc-1')
    expect(scene().nodes[0]?.name).toBe('AmbientLight')
  })
})
