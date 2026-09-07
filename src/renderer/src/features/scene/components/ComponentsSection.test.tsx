import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { emptyHistory, run, undo } from '@/engines/core/history'
import type { Command } from '@/engines/core/history'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, nodeById, type SceneState } from '@/engines/scene/sceneState'
import type { SceneEdit } from '@/hooks/useSceneEdit'
import { useCode } from '@/stores/code'
import { ComponentsSection } from './ComponentsSection'

const sceneWith = (
  components?: SceneState['nodes'][number]['components'],
  beside: SceneState['nodes'] = [],
): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [components === undefined ? meshNode('a') : { ...meshNode('a'), components }, ...beside],
})

function show(state: SceneState) {
  const ran: Command<SceneState>[] = []
  const edit: SceneEdit = {
    run: command => ran.push(command),
    apply: vi.fn(),
    gesture: { onGestureStart: vi.fn(), onGestureEnd: vi.fn() },
  }
  const node = nodeById(state, 'a')
  if (!node) throw new Error('no node')
  render(<ComponentsSection node={node} nodes={state.nodes} edit={edit} />)

  return ran
}

describe('what the selected object does while the game runs', () => {
  it('says so when the object does nothing yet', () => {
    show(sceneWith())

    expect(screen.getByText('Cet objet ne fait rien pendant la partie.')).toBeInTheDocument()
  })

  /** The lot's own criterion: add one from the panel, ⌘Z takes it back. */
  it('adds a component the object had not got, and gives it back on undo', async () => {
    const ran = show(sceneWith())

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un composant' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Santé' }))

    const [command] = ran
    if (!command) throw new Error('nothing ran')

    const [added, history] = run(sceneWith(), emptyHistory<SceneState>(), command)
    expect(nodeById(added, 'a')?.components).toEqual([newComponent('Health')])
    expect(undo(added, history)[0]).toEqual(sceneWith())
  })

  it('draws one row per field the descriptor declares', () => {
    show(sceneWith([newComponent('Movement')]))

    expect(screen.getByText('Mouvement')).toBeInTheDocument()
    expect(screen.getByLabelText('Vitesse')).toBeInTheDocument()
    expect(screen.getByLabelText('Distance')).toBeInTheDocument()
  })

  /** 🛑 Typing a sibling's name by hand is a spelling test, and a misspelling shows as nothing. */
  it('offers the nodes beside it for a field that names one', () => {
    show(sceneWith([newComponent('SpringArm')], [{ ...meshNode('b'), name: 'Capsule' }]))

    expect(screen.getByLabelText('Élément suivi')).toContainHTML('Capsule')
  })

  /**
   * 🛑 The button was DRAWN on every field of every component and acted on none: nothing ever
   * handed `ComponentField` an `onReset`, and `FieldReset` draws an absent one inert.
   */
  it('puts a field back to what the registry declares, and offers nothing while it stands there', async () => {
    const ran = show(sceneWith([{ ...newComponent('SpringArm'), length: 2.04 }]))

    const buttons = screen.getAllByLabelText('Revenir à la valeur par défaut')
    // One per field, and only the one standing off its default acts.
    expect(buttons.filter(one => !one.hasAttribute('disabled'))).toHaveLength(1)
    await userEvent.click(buttons.find(one => !one.hasAttribute('disabled'))!)

    const drifted = sceneWith([{ ...newComponent('SpringArm'), length: 2.04 }])
    const command = ran[0]
    if (!command) throw new Error('nothing ran')
    const [after] = run(drifted, emptyHistory<SceneState>(), command)
    expect(nodeById(after, 'a')?.components?.[0]?.length).toBe(4)
  })

  it('takes off what the object carries', async () => {
    const ran = show(sceneWith([newComponent('Health')]))

    await userEvent.click(screen.getByRole('button', { name: 'Détacher' }))
    const [command] = ran
    if (!command) throw new Error('nothing ran')

    expect(nodeById(command.apply(sceneWith([newComponent('Health')])), 'a')?.components).toEqual(
      [],
    )
  })

  /**
   * 🛑 The rows come from the FILE, not from the component: a script that gained a setting shows
   * it the moment it is saved, and the component carries only the value.
   */
  it('shows a row per setting the script declares', () => {
    useCode.setState({
      files: {
        'script:Walk.ts': {
          script: 'script:Walk.ts',
          saved: '',
          source: 'export default defineScript({ props: { speed: 4 }, onUpdate() {} })',
        },
      },
    })

    show(sceneWith([{ type: 'Script', script: 'script:Walk.ts', props: { speed: 9 } }]))

    expect(screen.getByLabelText('speed')).toHaveValue('9')
  })

  /** A setting the inspector never touched answers the author's own default. */
  it('falls back to what the author wrote when the component carries nothing', () => {
    useCode.setState({
      files: {
        'script:Walk.ts': {
          script: 'script:Walk.ts',
          saved: '',
          source: 'export default defineScript({ props: { speed: 4 }, onUpdate() {} })',
        },
      },
    })

    show(sceneWith([{ type: 'Script', script: 'script:Walk.ts' }]))

    expect(screen.getByLabelText('speed')).toHaveValue('4')
  })
})

describe('the script a component runs', () => {
  const scripted = (named: string) => sceneWith([{ ...newComponent('Script'), script: named }])

  const holdingFiles = (...names: string[]) => {
    useCode.setState({
      files: Object.fromEntries(names.map(name => [name, { script: name, saved: '', source: '' }])),
    })
  }

  /** 🛑 The row a texture and a typeface are picked by — never a name to type by hand. */
  it('offers the project scripts as a list, by file name', () => {
    holdingFiles('script:Scripts/player.ts', 'script:Scripts/door.ts')

    show(scripted('script:Scripts/player.ts'))

    // By FILE name: the row is narrow, and the folders are what the menu holds.
    expect(screen.getByRole('option', { name: 'door.ts' })).toBeInTheDocument()
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'player.ts' }).selected).toBe(true)
  })

  /**
   * Dropping it would rewrite the component on the first edit, which is the one thing a missing
   * link must not do — the line `FontField` holds for a typeface this machine has not got.
   */
  it('keeps a script the project no longer holds, marked as missing', () => {
    holdingFiles('script:Scripts/door.ts')

    show(scripted('script:Scripts/gone.ts'))

    expect(screen.getByRole('option', { name: /gone\.ts/ })).toBeInTheDocument()
  })
})
