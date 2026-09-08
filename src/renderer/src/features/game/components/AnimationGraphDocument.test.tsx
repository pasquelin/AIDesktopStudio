// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { animationGraphPreset } from '@shared/domain/animationPresets'
import { installFakeBridge } from '@/services/fakeBridge'
import { AnimationGraphDocument } from './AnimationGraphDocument'

const PATH = 'Animations/character.anim.json'
const CHARACTER = animationGraphPreset('character')

describe('the animation graph editor', () => {
  it('opens the graph in the studio rather than handing the file to the system', async () => {
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER) } })

    render(<AnimationGraphDocument path={PATH} />)

    expect(await screen.findByRole('textbox', { name: 'JSON du graphe d’animation' })).toHaveValue(
      JSON.stringify(CHARACTER, null, 2),
    )
  })

  it('reports a read failure instead of leaving an empty editor behind', async () => {
    installFakeBridge({ animationGraphs: { read: () => Promise.reject(new Error('disk failed')) } })

    render(<AnimationGraphDocument path={PATH} />)

    expect(await screen.findByText('Ce graphe d’animation n’a pas pu être lu.')).toBeInTheDocument()
  })

  it('validates and saves an edited graph', async () => {
    const write = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER), write } })
    render(<AnimationGraphDocument path={PATH} />)
    const source = await screen.findByRole('textbox', { name: 'JSON du graphe d’animation' })

    fireEvent.change(source, {
      target: { value: JSON.stringify({ ...CHARACTER, id: 'hero' }, null, 2) },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(write).toHaveBeenCalledWith(PATH, { ...CHARACTER, id: 'hero' }))
  })

  it('keeps a graph the runtime would refuse off disk, and explains the refusal', async () => {
    const write = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ animationGraphs: { read: () => Promise.resolve(CHARACTER), write } })
    render(<AnimationGraphDocument path={PATH} />)
    const source = await screen.findByRole('textbox', { name: 'JSON du graphe d’animation' })

    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, layers: [] }) } })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

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
    await screen.findByRole('textbox', { name: 'JSON du graphe d’animation' })

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(
      await screen.findByText('Ce graphe d’animation n’a pas pu être écrit sur le disque.'),
    ).toBeInTheDocument()
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
    const source = await screen.findByRole('textbox', { name: 'JSON du graphe d’animation' })
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, id: 'hero' }) } })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, id: 'pilot' }) } })

    pending.finish?.(true)

    await vi.waitFor(() =>
      expect(source).toHaveValue(JSON.stringify({ ...CHARACTER, id: 'pilot' })),
    )
  })
})
