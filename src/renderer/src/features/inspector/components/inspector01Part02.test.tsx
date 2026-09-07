import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
// The expected words come from the French bundle rather than being spelt out, which is what keeps
// a renamed slot from leaving this case asserting a label the panel no longer draws.
import { lightNodeFixture, meshNode, spriteNodeFixture } from '@/engines/scene/scene-fixtures'
import { IDENTITY_TRANSFORM, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import type { Transform } from '@shared/domain/scene'
import { useSettings } from '@/stores/settings'
import { installScene, sceneNodeNow } from '@/stores/scene-fixtures'
import { useScenes } from '@/stores/scenes'
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

function moved(x: number, y: number, z: number): Transform {
  return { ...IDENTITY_TRANSFORM, position: { x, y, z } }
}

const nodeInStore = (id: string): SceneNode | null => sceneNodeNow('doc-1', id)

beforeEach(() => {
  install(meshNode('box-1'))
  // The preferences are a module-wide store: a case that writes one — the display unit — would
  // otherwise leave every case after it reading lengths in millimetres.
  useSettings.setState({ settings: DEFAULT_SETTINGS })
})

describe('inspector panel', () => {
  it('leaves a lone sprite its rotation row, inert, and keeps the two that act', () => {
    install(spriteNodeFixture('sprite-1'))
    render(withQueries(<Content />))

    expect(screen.getByText('Rotation')).toBeInTheDocument()
    expect(screen.getAllByLabelText('X').map(field => field.hasAttribute('disabled'))).toEqual([
      false,
      true,
      false,
    ])
  })

  /**
   * Through the same command as any other edit, so ⌘Z undoes a reset the way it undoes a drag —
   * and ENABLED only where there is something to undo. Every line draws the button since
   * 2026-08-19, or the field narrowed under the pointer at the very moment a value left its
   * default; what says which row moved is which button acts.
   */
  it('enables the reset of the rows that have moved alone, and undoes like any edit', async () => {
    install({ ...meshNode('box-1'), transform: moved(2, 0, 0) })
    render(withQueries(<Content />))

    const live = screen
      .getAllByRole('button', { name: /Revenir à la valeur par défaut/ })
      .filter(button => !button.hasAttribute('disabled'))

    expect(live).toHaveLength(1)
    await userEvent.click(live[0] as HTMLElement)

    expect(nodeInStore('box-1')?.transform.position).toEqual(IDENTITY_TRANSFORM.position)
    useScenes.getState().undo('doc-1')
    expect(nodeInStore('box-1')?.transform.position).toEqual({ x: 2, y: 0, z: 0 })
  })

  /**
   * The padlock is per axis and per channel, offered on the unfolded lines alone. What it writes
   * is NOT a command: ⌘Z gives back edits, never the way one was editing.
   */
  it('holds one axis still, and leaves that hold outside the history', async () => {
    install({ ...meshNode('box-1'), transform: moved(2, 0, 0) })
    render(withQueries(<Content />))

    // Matched loosely: the row carries the display unit since the Environment panel landed.
    await userEvent.click(screen.getByRole('button', { name: /^Position/ }))
    await userEvent.click(screen.getByRole('button', { name: /Figer l’axe X/ }))

    // By handle: three rows carry an axis called X, and only this one is held.
    const x = (): Element | null => document.querySelector('[data-sc="field:transform.position.x"]')
    expect(x()).toBeDisabled()
    expect(document.querySelector('[data-sc="field:transform.position.y"]')).toBeEnabled()

    // The hold survives an undo, which only takes back the move that came before it.
    useScenes.getState().undo('doc-1')
    expect(x()).toBeDisabled()
  })

  /**
   * A descriptor's own factory says what its default is — the transform was the only family
   * wired to one until 2026-08-19, so every other line of the panel drew a reset that could
   * never act. What a primitive holds when it is made is the one place that fact lives.
   */
  it('resets a descriptor field to what its factory gives', async () => {
    install({
      ...meshNode('box-1'),
      geometry: { kind: 'box', width: 4, height: 1, depth: 1 },
    })
    render(withQueries(<Content />))

    const width = screen.getByLabelText('Largeur')
    expect(width).toHaveValue('4')

    const row = width.parentElement
    const reset = within(row as HTMLElement).getByRole('button', {
      name: /Revenir à la valeur par défaut/,
    })

    expect(reset).toBeEnabled()
    await userEvent.click(reset)

    const box = nodeInStore('box-1')
    expect(box?.type === 'mesh' && box.geometry).toEqual({
      kind: 'box',
      width: 1,
      height: 1,
      depth: 1,
    })
  })

  /** Inert where the value already stands there, which is what tells the moved rows apart. */
  it('leaves the reset of an untouched descriptor field disabled', () => {
    install(meshNode('box-1'))
    render(withQueries(<Content />))

    const row = screen.getByLabelText('Largeur').parentElement

    expect(
      within(row as HTMLElement).getByRole('button', { name: /Revenir à la valeur par défaut/ }),
    ).toBeDisabled()
  })

  it('gives the row back to a sprite others hang from, which turning swings around it', () => {
    installScene('doc-1', {
      ...EMPTY_SCENE,
      nodes: [spriteNodeFixture('sprite-1'), meshNode('box-1', 'sprite-1')],
      selectedIds: ['sprite-1'],
    })
    render(withQueries(<Content />))

    expect(screen.getByText('Rotation')).toBeInTheDocument()
  })

  // The anchor is the last node picked, and it is not what the row is for: a cube selected after
  // a sprite still turns, and deciding on the anchor alone took its row away.
  it('keeps the row when a sprite is the anchor of a selection something else turns in', () => {
    installScene('doc-1', {
      ...EMPTY_SCENE,
      nodes: [meshNode('box-1'), spriteNodeFixture('sprite-1')],
      selectedIds: ['box-1', 'sprite-1'],
    })
    render(withQueries(<Content />))

    expect(screen.getByText('Rotation')).toBeInTheDocument()
  })

  it('fades a sprite through the history', () => {
    install(spriteNodeFixture('sprite-1'))
    render(withQueries(<Content />))

    fireEvent.change(screen.getByLabelText('Opacité'), { target: { value: '0.4' } })

    const node = nodeInStore('sprite-1')
    expect(node?.type === 'sprite' && node.sprite.opacity).toBe(0.4)

    useScenes.getState().undo('doc-1')
    const back = nodeInStore('sprite-1')
    expect(back?.type === 'sprite' && back.sprite.opacity).toBe(1)
  })

  it('follows the selection', () => {
    installScene('doc-1', {
      ...EMPTY_SCENE,
      nodes: [meshNode('box-1'), lightNodeFixture('light-1')],
      selectedIds: ['light-1'],
    })
    render(withQueries(<Content />))

    expect(screen.getByRole('button', { name: /Lumière/ })).toBeInTheDocument()
  })
})
