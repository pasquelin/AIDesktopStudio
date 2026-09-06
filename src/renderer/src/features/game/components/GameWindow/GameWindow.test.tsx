import { act, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { useSettings } from '@/stores/settings'
import { GameWindow } from './GameWindow'

afterEach(() => {
  useSettings.setState({ settings: DEFAULT_SETTINGS })
})

/** Every viewport dressing handed to the engine, in order. */
const configured = vi.hoisted((): Record<string, unknown>[] => [])

vi.mock('@/engines/scene/SceneRenderer', () => ({
  SceneRenderer: class {
    mount = vi.fn()
    dispose = vi.fn()
    frameContents = () => true
    configure = (next: Record<string, unknown>) => {
      configured.push(next)
    }
  },
}))

vi.mock('@/game/gameStage', () => ({ createGameStage: () => ({ close: vi.fn() }) }))

/**
 * A window of its own opens on the defaults, and the settings live in another one: the lens the
 * person sets there must reach a game already running, and the studio's aids must not.
 */
it('follows the lens the person sets while the game runs, and shows no aid of the studio', async () => {
  render(<GameWindow />)
  await waitFor(() => expect(configured.length).toBeGreaterThan(0))

  act(() =>
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        three: { ...state.settings.three, fieldOfView: 35, showGrid: true },
      },
    })),
  )

  await waitFor(() => expect(configured.at(-1)?.fieldOfView).toBe(35))
  expect(configured.at(-1)?.showGrid).toBe(false)
})
