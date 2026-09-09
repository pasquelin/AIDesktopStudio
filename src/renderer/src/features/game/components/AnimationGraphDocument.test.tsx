// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AnimationGraph } from '@shared/domain/animationGraph'
import { animationGraphPreset } from '@shared/domain/animationPresets'
import { fileViewPanelId, fileViewSave } from '@/features/shell/components/dockviewApi'
import { installFakeBridge } from '@/services/fakeBridge'
import { AnimationGraphDocument } from './AnimationGraphDocument'

const PATH = 'Animations/character.anim.json'
const CHARACTER = animationGraphPreset('character')
const JSON_LABEL = 'JSON du graphe d’animation'

/** ⌘S, as the menu runs it: the editor has no save button — a file view saves like a document. */
const askedToSave = (): (() => Promise<boolean>) | null => fileViewSave(fileViewPanelId(PATH))

const save = async (): Promise<boolean> => {
  const run = askedToSave()
  if (!run) throw new Error('no save registered for the graph')
  let answered = false
  await act(async () => {
    answered = await run()
  })
  return answered
}

const openJson = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('tab', { name: 'JSON' }))
  return screen.getByRole('textbox', { name: JSON_LABEL })
}

describe('the animation graph editor', () => {
  /**
   * 🛑 The text was the WHOLE editor: a graph was read by scrolling JSON, where a control map of
   * the same project offered forms. Both wear one shell now, and both open on what the file does.
   */
  it('opens on what the graph plays, rather than on its text', async () => {
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER) } })

    render(<AnimationGraphDocument path={PATH} />)

    expect(await screen.findByText('idle')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: JSON_LABEL })).not.toBeInTheDocument()
  })

  it('reports a read failure instead of leaving an empty editor behind', async () => {
    installFakeBridge({ animationGraphs: { read: () => Promise.reject(new Error('disk failed')) } })

    render(<AnimationGraphDocument path={PATH} />)

    expect(await screen.findByText('Ce graphe d’animation n’a pas pu être lu.')).toBeInTheDocument()
  })

  it('edits a state as a field, and writes the graph the forms hold', async () => {
    const write = vi.fn((_path: string, _graph: AnimationGraph) => Promise.resolve(true))
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER), write } })
    render(<AnimationGraphDocument path={PATH} />)
    await screen.findByText('idle')

    await userEvent.click(screen.getByRole('tab', { name: 'Expert' }))
    const speed = screen.getAllByRole('spinbutton', { name: 'Vitesse' })[0]
    if (!speed) throw new Error('no speed field drawn for the first state')
    await userEvent.clear(speed)
    await userEvent.type(speed, '2')
    await save()

    expect(write.mock.calls[0]?.[1].layers[0]?.states[0]?.speed).toBe(2)
  })

  it('validates and saves an edited text', async () => {
    const write = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER), write } })
    render(<AnimationGraphDocument path={PATH} />)
    await screen.findByText('idle')

    const source = await openJson()
    fireEvent.change(source, {
      target: { value: JSON.stringify({ ...CHARACTER, id: 'hero' }, null, 2) },
    })
    await save()

    expect(write).toHaveBeenCalledWith(PATH, { ...CHARACTER, id: 'hero' })
  })

  it('keeps a graph the runtime would refuse off disk, and explains the refusal', async () => {
    const write = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER), write } })
    render(<AnimationGraphDocument path={PATH} />)
    await screen.findByText('idle')

    const source = await openJson()
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, layers: [] }) } })
    await save()

    expect(
      await screen.findByText('Le JSON ne décrit pas un graphe d’animation valide.'),
    ).toBeInTheDocument()
    expect(write).not.toHaveBeenCalled()
  })

  /** A file the disk would not take is not a file the author mistyped. */
  it('says the disk refused the write, rather than blaming what was typed', async () => {
    installFakeBridge({
      animationGraphs: {
        read: () => Promise.resolve(CHARACTER),
        write: () => Promise.resolve(false),
      },
    })
    render(<AnimationGraphDocument path={PATH} />)
    await screen.findByText('idle')

    expect(await save()).toBe(false)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce graphe d’animation n’a pas pu être écrit sur le disque.',
    )
  })

  it('does not replace edits typed while an earlier save is pending', async () => {
    const pending: { finish: ((value: boolean) => void) | null } = { finish: null }
    const write = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          pending.finish = resolve
        }),
    )
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER), write } })
    render(<AnimationGraphDocument path={PATH} />)
    await screen.findByText('idle')
    const source = await openJson()
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, id: 'hero' }) } })
    void askedToSave()?.()
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, id: 'pilot' }) } })

    pending.finish?.(true)

    await vi.waitFor(() =>
      expect(source).toHaveValue(JSON.stringify({ ...CHARACTER, id: 'pilot' })),
    )
  })
})
