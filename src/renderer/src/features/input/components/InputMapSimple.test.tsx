// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InputMap } from '@shared/domain/inputMap'
import { inputMapPreset } from '@shared/domain/inputPresets'
import { InputMapSimple } from './InputMapSimple'

const STUDIO: InputMap = {
  version: 1,
  id: 'studio',
  priority: 100,
  defaultActive: true,
  actions: [{ id: 'navigate', kind: 'axis2', bindings: [] }],
}

describe('the starting points of the simple view', () => {
  it('takes the preset’s actions and keeps the map’s own context id', async () => {
    const onChange = vi.fn()
    render(<InputMapSimple map={STUDIO} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Personnage' }))

    const next = onChange.mock.calls[0]?.[0] as InputMap
    expect(next.id).toBe('studio')
    expect(next.actions.map(action => action.id)).toContain('jump')
  })

  it('hands out a copy, so a later edit never reaches the shared preset', async () => {
    const onChange = vi.fn()
    render(<InputMapSimple map={STUDIO} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Véhicule' }))
    await userEvent.click(screen.getByRole('button', { name: 'Véhicule' }))

    const first = onChange.mock.calls[0]?.[0] as InputMap
    const second = onChange.mock.calls[1]?.[0] as InputMap
    expect(first).not.toBe(second)
    expect(first.actions[0]).not.toBe(second.actions[0])
  })

  /**
   * 🛑 The chip says what the map HOLDS, not what it is called: the click keeps the map's own id,
   * so reading the id lit nothing for a character map named `hero` and lit « Personnage » for a
   * file merely named `character` that had been re-pointed at the vehicle preset.
   */
  it('lights the preset the map holds, whatever the map is called', () => {
    const hero: InputMap = { ...inputMapPreset('character'), id: 'hero' }
    render(<InputMapSimple map={hero} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Personnage' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Véhicule' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('names each binding as a label, not a choice', () => {
    render(<InputMapSimple map={inputMapPreset('character')} onChange={vi.fn()} />)

    expect(screen.getByText('Clavier · Space')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clavier · Space' })).not.toBeInTheDocument()
  })

  it('lights nothing when the map holds no preset', () => {
    render(<InputMapSimple map={STUDIO} onChange={vi.fn()} />)

    const lit = screen
      .getAllByRole('button')
      .filter(one => one.getAttribute('aria-pressed') === 'true')

    expect(lit).toEqual([])
  })
})
