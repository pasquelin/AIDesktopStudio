// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InputMap } from '@shared/domain/inputMap'
import { onInputMapsChanged } from '@/engines/code/projectInputMaps'
import { fileViewPanelId, fileViewSave } from '@/features/shell/components/dockviewApi'
import { installFakeBridge } from '@/services/fakeBridge'
import { InputMapDocument } from './InputMapDocument'

const CHARACTER: InputMap = {
  version: 1,
  id: 'character',
  priority: 0,
  defaultActive: true,
  actions: [
    {
      id: 'jump',
      kind: 'button',
      bindings: [{ device: 'keyboard', code: 'Space' }],
    },
  ],
}

/**
 * ⌘S, as the menu runs it: the editor has no save button of its own, and the point of the shell
 * is that a file view is saved the way every other document is.
 */
const askedToSave = (path: string): (() => Promise<boolean>) | null =>
  fileViewSave(fileViewPanelId(path))

const save = async (path: string): Promise<void> => {
  await act(async () => {
    await askedToSave(path)?.()
  })
}

describe('the input map editor', () => {
  it('loads a map into the simple visual view', async () => {
    installFakeBridge({ inputMaps: { read: () => Promise.resolve(CHARACTER) } })

    render(<InputMapDocument path="Controls/character.input.json" />)

    expect(await screen.findByText('jump')).toBeInTheDocument()
    expect(screen.getByText(/Space/)).toBeInTheDocument()
  })

  it('reports a read failure instead of leaving a rejected task behind', async () => {
    installFakeBridge({ inputMaps: { read: () => Promise.reject(new Error('disk failed')) } })

    render(<InputMapDocument path="Controls/character.input.json" />)

    expect(
      await screen.findByText('Cette carte de contrôles n’a pas pu être lue.'),
    ).toBeInTheDocument()
  })

  it('validates and saves an edited JSON view', async () => {
    const write = vi.fn(() => Promise.resolve(true))
    installFakeBridge({
      inputMaps: { read: () => Promise.resolve(CHARACTER), write },
    })
    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')

    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    const source = screen.getByRole('textbox', { name: 'JSON de la carte' })
    fireEvent.change(source, {
      target: { value: JSON.stringify({ ...CHARACTER, priority: 20 }, null, 2) },
    })
    await save('Controls/character.input.json')

    expect(write).toHaveBeenCalledWith('Controls/character.input.json', {
      ...CHARACTER,
      priority: 20,
    })
  })

  /**
   * 🛑 The bridge has no change event, so without this a rebound `studio` map would only reach
   * the studio's own gamepad navigation once the project had been closed and opened again.
   */
  it('tells the surfaces that read control maps, so a rebind takes effect on saving', async () => {
    installFakeBridge({
      inputMaps: { read: () => Promise.resolve(CHARACTER), write: () => Promise.resolve(true) },
    })
    const told = vi.fn()
    const forget = onInputMapsChanged(told)
    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')

    await save('Controls/character.input.json')

    expect(told).toHaveBeenCalled()
    forget()
  })

  it('keeps invalid JSON off disk and explains the refusal', async () => {
    const write = vi.fn(() => Promise.resolve(true))
    installFakeBridge({
      inputMaps: { read: () => Promise.resolve(CHARACTER), write },
    })
    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')

    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    const source = screen.getByRole('textbox', { name: 'JSON de la carte' })
    fireEvent.change(source, { target: { value: '{' } })
    await save('Controls/character.input.json')

    expect(
      await screen.findByText('Le JSON ne décrit pas une carte de contrôles valide.'),
    ).toBeInTheDocument()
    expect(write).not.toHaveBeenCalled()
  })

  /**
   * 🛑 Both failures were caught under one message: a refused write read as « this text is not a
   * valid map » over a text that parsed perfectly, and pointed the author at the wrong thing.
   */
  it('says the disk refused, rather than blaming a text that parses', async () => {
    installFakeBridge({
      inputMaps: { read: () => Promise.resolve(CHARACTER), write: () => Promise.resolve(false) },
    })
    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')

    await save('Controls/character.input.json')

    expect(
      await screen.findByText('Cette carte de contrôles n’a pas pu être écrite sur le disque.'),
    ).toBeInTheDocument()
  })

  it('keeps a valid JSON edit when switching back to the expert view before saving', async () => {
    const write = vi.fn(async () => true)
    installFakeBridge({ inputMaps: { read: async () => CHARACTER, write } })
    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')
    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON de la carte' }), {
      target: { value: JSON.stringify({ ...CHARACTER, priority: 42 }) },
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Expert' }))
    await save('Controls/character.input.json')

    expect(write).toHaveBeenCalledWith('Controls/character.input.json', {
      ...CHARACTER,
      priority: 42,
    })
  })

  it('does not replace edits typed while an earlier save is pending', async () => {
    const pending: { finish: ((value: boolean) => void) | null } = { finish: null }
    const write = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          pending.finish = resolve
        }),
    )
    installFakeBridge({ inputMaps: { read: () => Promise.resolve(CHARACTER), write } })
    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')
    await userEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    const source = screen.getByRole('textbox', { name: 'JSON de la carte' })
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, priority: 20 }) } })
    void askedToSave('Controls/character.input.json')?.()
    fireEvent.change(source, { target: { value: JSON.stringify({ ...CHARACTER, priority: 30 }) } })

    pending.finish?.(true)

    await vi.waitFor(() =>
      expect(source).toHaveValue(JSON.stringify({ ...CHARACTER, priority: 30 })),
    )
  })
})

describe('a context two files carry', () => {
  it('is named on saving, rather than waiting for a Play to drop every script', async () => {
    installFakeBridge({
      inputMaps: {
        list: () =>
          Promise.resolve(['Controls/character.input.json', 'Controls/studio.input.json']),
        read: () => Promise.resolve(CHARACTER),
        write: () => Promise.resolve(true),
      },
    })

    render(<InputMapDocument path="Controls/studio.input.json" />)
    await screen.findByText('jump')
    await save('Controls/studio.input.json')

    expect(await screen.findByRole('alert')).toHaveTextContent('character')
  })

  it('says nothing when the project holds one file per context', async () => {
    installFakeBridge({
      inputMaps: {
        list: () => Promise.resolve(['Controls/character.input.json']),
        read: () => Promise.resolve(CHARACTER),
        write: () => Promise.resolve(true),
      },
    })

    render(<InputMapDocument path="Controls/character.input.json" />)
    await screen.findByText('jump')
    await save('Controls/character.input.json')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
