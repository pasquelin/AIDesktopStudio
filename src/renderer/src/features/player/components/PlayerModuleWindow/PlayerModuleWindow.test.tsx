import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { useSettings } from '@/stores/settings'
import { PlayerModuleWindow } from './PlayerModuleWindow'

/** Every viewport dressing handed to the engine, in order. */
const configured = vi.hoisted((): Record<string, unknown>[] => [])

vi.mock('@/engines/scene/SceneRenderer', () => ({
  SceneRenderer: class {
    mount = vi.fn()
    unmount = vi.fn()
    apply = vi.fn()
    configure = (next: Record<string, unknown>) => {
      configured.push(next)
    }
  },
}))

/** The window used to freeze the studio's defaults: a lens changed in the settings never landed. */
it('draws with the viewport settings the person changes while it is open', async () => {
  render(<PlayerModuleWindow />)
  await waitFor(() => expect(configured.length).toBeGreaterThan(0))

  act(() =>
    useSettings.setState(state => ({
      settings: { ...state.settings, three: { ...state.settings.three, fieldOfView: 35 } },
    })),
  )

  await waitFor(() => expect(configured.at(-1)?.fieldOfView).toBe(35))
})
