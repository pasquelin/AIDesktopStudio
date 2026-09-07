import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useSettings } from '@/stores/settings'
import { TitleBar } from './TitleBar'

let menu = fakeMenu()

function pill(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

function labels(): string[] {
  return screen.getAllByRole('button').map(button => button.textContent ?? '')
}

/** One transfer for the whole gesture, as the platform hands it: the drop reads what the start wrote. */
function drag(from: string, onto: string): void {
  const dataTransfer = dragTransfer()
  fireEvent.dragStart(pill(from), { dataTransfer })
  fireEvent.dragOver(pill(onto), { dataTransfer })
  fireEvent.drop(pill(onto), { dataTransfer })
}

describe('TitleBar', () => {
  beforeEach(() => {
    useSettings.setState({ settings: structuredClone(DEFAULT_SETTINGS) })
    menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
  })

  it('draws the spaces in the order the settings carry', () => {
    useSettings.setState({
      settings: { ...DEFAULT_SETTINGS, workspaces: { order: ['audio', 'image'] } },
    })

    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    expect(labels()[0]).toBe('Audio')
  })

  it('switches workspace on a plain click, as it always did', () => {
    const onWorkspace = vi.fn()
    render(<TitleBar activeWorkspace="image" onWorkspace={onWorkspace} />)

    fireEvent.click(pill('Audio'))

    expect(onWorkspace).toHaveBeenCalledWith('audio')
  })

  it('writes the new order when a space is dropped on another', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    drag('Image', 'Audio')

    expect(write).toHaveBeenCalledWith({
      workspaces: { order: ['video', '3d', 'code', 'audio', 'image', 'materials', 'skyboxes'] },
    })
  })

  it('writes nothing when a space is dropped on itself', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    drag('Image', 'Image')

    expect(write).not.toHaveBeenCalled()
  })

  /**
   * `preventDefault` on dragover is what tells the platform a drop is welcome. Answering yes to
   * a drag the bar cannot read is how it would swallow a file dropped from the desktop.
   */
  it('refuses a drag that carries no space of ours', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    const accepted = !fireEvent.dragOver(pill('Audio'), { dataTransfer: dragTransfer() })

    expect(accepted).toBe(false)
  })

  // The dragged pill is not a place it can land: `drop` refuses it, so lighting it up would
  // promise a gesture that never happens.
  it('does not offer itself as a target while it is the one being dragged', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)
    const dataTransfer = dragTransfer()
    fireEvent.dragStart(pill('Image'), { dataTransfer })

    fireEvent.dragOver(pill('Image'), { dataTransfer })

    expect(pill('Image').classList.contains('ring-accent')).toBe(false)
  })

  // `dragleave` fires on the way into the pill's own icon. Reading `relatedTarget` is what
  // separates leaving the pill from moving about inside it.
  it('keeps the target lit when the pointer crosses into its own icon', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)
    const dataTransfer = dragTransfer()
    fireEvent.dragStart(pill('Image'), { dataTransfer })
    fireEvent.dragOver(pill('Audio'), { dataTransfer })

    const icon = pill('Audio').querySelector('svg')
    fireEvent.dragLeave(pill('Audio'), { relatedTarget: icon })

    expect(pill('Audio').classList.contains('ring-accent')).toBe(true)
  })

  it('drops the highlight when the pointer leaves without releasing', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)
    const dataTransfer = dragTransfer()
    fireEvent.dragStart(pill('Image'), { dataTransfer })
    fireEvent.dragOver(pill('Audio'), { dataTransfer })
    expect(pill('Audio').classList.contains('ring-accent')).toBe(true)

    fireEvent.dragLeave(pill('Audio'), { relatedTarget: document.body })

    expect(pill('Audio').classList.contains('ring-accent')).toBe(false)
  })

  /**
   * A drop needs a pointer that can hold a button down while it travels. These two gestures are
   * what the same reordering looks like to a keyboard (2.1.1) and to a pointer that cannot drag
   * (2.5.7) — and before them the bar had no other path at all, the setting being a dedicated one
   * the settings screen does not draw.
   */
  it('moves the focused space with Alt and an arrow', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Image'), {
      key: 'ArrowRight',
      code: 'ArrowRight',
      altKey: true,
      metaKey: true,
    })

    expect(write).toHaveBeenCalledWith({
      workspaces: { order: ['video', 'image', '3d', 'code', 'audio', 'materials', 'skyboxes'] },
    })
  })

  // The bare arrows belong to whoever walks the bar; taking them would be taking a gesture.
  it('leaves a bare arrow alone', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Image'), { key: 'ArrowRight', code: 'ArrowRight' })

    expect(write).not.toHaveBeenCalled()
  })

  /**
   * It was the studio's one keyboard gesture written outside the command registry: invisible to
   * the shortcuts screen, and beyond anything `shortcuts.overrides` could say.
   */
})
