import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { RuntimeReport } from '@shared/domain/gameRuntime'
import { EMPTY_RUNTIME_PERFORMANCE } from '@shared/domain/gameRuntime'
import { GameWindowDebug } from './GameWindowDebug'

const RUNNING: RuntimeReport = {
  state: 'playing',
  tick: 12,
  fps: 60,
  frameMs: 16,
  entities: 3,
  logs: [],
  errors: [],
  veil: 0,
  performance: {
    ...EMPTY_RUNTIME_PERFORMANCE,
    cpuFrameMs: 2.5,
    renderMs: 1.25,
    drawCalls: 4,
    triangles: 120,
  },
}

describe('what a running game says about itself', () => {
  /** 🛑 The figures sit where a game draws its own interface: nothing is shown until it is asked
   *  for. */
  it('shows nothing until the drawer is opened', async () => {
    render(<GameWindowDebug report={RUNNING} />)

    expect(screen.queryByText(/objets/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Débogage' }))

    expect(screen.getByText(/3 objets · 60 i\/s · pas 12/)).toBeInTheDocument()
    expect(screen.getByText('CPU 2,5 ms · rendu 1,25 ms')).toBeInTheDocument()
    expect(screen.getByText('4 appels de dessin · 120 triangles')).toBeInTheDocument()
  })

  it('names the last fault in full, and says so on the button', async () => {
    render(
      <GameWindowDebug
        report={{
          ...RUNNING,
          logs: [{ level: 'error', message: 'system script threw: broken', at: 1 }],
        }}
      />,
    )

    // Warned on the closed drawer too, or a fault would wait for somebody to think of looking.
    expect(screen.getByRole('button', { name: 'Débogage' })).toHaveClass('text-warning')

    await userEvent.click(screen.getByRole('button', { name: 'Débogage' }))

    expect(screen.getByText('1 erreur')).toBeInTheDocument()
    expect(screen.getByText('system script threw: broken')).toBeInTheDocument()
  })

  it('says there is nothing wrong when there is nothing wrong', async () => {
    render(<GameWindowDebug report={RUNNING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Débogage' }))

    expect(screen.getByText('Aucune faute')).toBeInTheDocument()
  })
})
