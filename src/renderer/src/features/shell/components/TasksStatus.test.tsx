import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeBridge } from '@/services/fakeBridge'
import { useTasks, type TaskRow } from '@/stores/tasks'
import { TasksStatus } from './TasksStatus'

const showing = (...rows: TaskRow[]): void => {
  useTasks.setState({ running: Object.fromEntries(rows.map(row => [row.id, row])) })
}

beforeEach(() => {
  useTasks.setState({ running: {} })
  installFakeBridge()
})

describe('the tasks indicator', () => {
  it('says nothing while nothing is running', () => {
    const { container } = render(<TasksStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts what is running and averages how far along it is', () => {
    showing({ id: 'a', label: 'Coucher', ratio: 0.4 }, { id: 'b', label: 'Bande', ratio: 0.8 })
    render(<TasksStatus />)

    expect(screen.getByRole('button')).toHaveTextContent('2 tâches')
    // Off `textContent`: the separator is U+00A0, and a matcher that normalises it would accept
    // a hand-written space.
    expect(screen.getByRole('button').textContent).toContain('60 %')
  })

  it('says what opening it does, which its own face never shows', () => {
    showing({ id: 'a', label: 'Coucher', ratio: 0.4 })
    render(<TasksStatus />)

    expect(screen.getByRole('button')).toHaveAttribute(
      'data-tooltip-content',
      'Ouvre la liste des tâches en cours',
    )
  })

  /**
   * The half that was missing everywhere but the video render: a bar is half of invariant 6, and
   * a task that cannot be stopped is a studio waiting on a disk it never chose to fill.
   */
  it('stops the one whose button was pressed, and no other', async () => {
    const cancel = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ tasks: { cancel } })
    showing({ id: 'a', label: 'Coucher', ratio: 0.4 }, { id: 'b', label: 'Bande', ratio: 0.8 })
    render(<TasksStatus />)

    await userEvent.click(screen.getByRole('button'))
    const stops = screen.getAllByRole('button', { name: 'Interrompre cette tâche' })
    await userEvent.click(stops[1] as HTMLElement)

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('b')
  })

  it('names each one by what it is working on', async () => {
    showing({ id: 'a', label: 'Coucher', ratio: 0.4 })
    render(<TasksStatus />)

    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Coucher')).toBeInTheDocument()
  })

  it('shows a measured processing phase when the worker reports one', async () => {
    showing({ id: 'a', label: 'Squelettage avancé', ratio: 0.4, phase: 'skinning' })
    render(<TasksStatus />)

    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Calcul du skinning')).toBeInTheDocument()
  })
})
