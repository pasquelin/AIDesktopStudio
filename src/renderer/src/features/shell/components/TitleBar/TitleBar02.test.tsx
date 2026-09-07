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

  it('follows a remap of the reordering command', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({
      write,
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        shortcuts: { overrides: { 'spaces.moveRight': 'Alt+KeyL' } },
      },
    })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Image'), { key: 'l', code: 'KeyL', altKey: true })

    expect(write).toHaveBeenCalledWith({
      workspaces: { order: ['video', 'image', '3d', 'code', 'audio', 'materials', 'skyboxes'] },
    })
  })

  it('drops the default once it has been remapped away', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({
      write,
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        shortcuts: { overrides: { 'spaces.moveRight': 'Alt+KeyL' } },
      },
    })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Image'), {
      key: 'ArrowRight',
      code: 'ArrowRight',
      altKey: true,
      metaKey: true,
    })

    expect(write).not.toHaveBeenCalled()
  })

  // Announced as well as heard: a reader told about a chord the remap has moved is told wrong.
  it('announces the chord it currently answers to', () => {
    useSettings.setState({
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        shortcuts: { overrides: { 'spaces.moveRight': 'Alt+KeyL' } },
      },
    })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    expect(pill('Image')).toHaveAttribute('aria-keyshortcuts', 'Alt+Meta+ArrowLeft Alt+KeyL')
  })

  it('writes nothing at the ends of the bar', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Image'), {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      altKey: true,
      metaKey: true,
    })

    expect(write).not.toHaveBeenCalled()
  })

  it('offers the same move in a menu, for a pointer that cannot drag', async () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    menu.picks('Déplacer à droite')
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.contextMenu(pill('Image'))

    await vi.waitFor(() =>
      expect(write).toHaveBeenCalledWith({
        workspaces: { order: ['video', 'image', '3d', 'code', 'audio', 'materials', 'skyboxes'] },
      }),
    )
  })

  it('disables the move the end of the bar refuses', async () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.contextMenu(pill('Image'))

    await vi.waitFor(() => expect(menu.offers('Déplacer à gauche')).toBe(false))
  })

  // The order changes, the focus does not move, and the label does not change: without this the
  // gesture succeeds in silence for anyone reading the screen rather than looking at it.
  it('says where the space landed', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Image'), {
      key: 'ArrowRight',
      code: 'ArrowRight',
      altKey: true,
      metaKey: true,
    })

    expect(screen.getByRole('status')).toHaveTextContent('Image en position 2 sur 7')
  })

  /**
   * Said aloud and never seen, so the grammar has to hold on its own. The sentence used to end
   * on a past participle — « {{label}} déplacé » — which a screen reader pronounced as « Image
   * déplacé » and « Vidéo déplacé »: three of the seven space names are feminine, and English
   * hides the problem because « moved » never agrees. The wording carries no participle now.
   */
  it('says it without an agreement French would have to make', () => {
    render(<TitleBar activeWorkspace="video" onWorkspace={vi.fn()} />)

    fireEvent.keyDown(pill('Vidéo'), {
      key: 'ArrowRight',
      code: 'ArrowRight',
      altKey: true,
      metaKey: true,
    })

    expect(screen.getByRole('status')).toHaveTextContent('Vidéo en position 3 sur 7')
  })

  /**
   * The home covers the spaces rather than being one of them, and the bar says so by rendering
   * it before the loop. Letting it be dragged would ask what "first" means for a button that is
   * always first.
   */
  it('leaves the home out of the reordering, and only the home', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} onHome={vi.fn()} home />)

    expect(pill('Accueil')).not.toHaveAttribute('draggable', 'true')
    expect(pill('Image')).toHaveAttribute('draggable', 'true')
  })

  it('does not let a space be dropped on the home', () => {
    const write = vi.fn(async () => undefined)
    useSettings.setState({ write })
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} onHome={vi.fn()} home />)

    drag('Image', 'Accueil')

    expect(write).not.toHaveBeenCalled()
  })

  // What the DOM can answer for is the shade, not where it came from — that `TITLE_BAR_GHOST` is
  // the only place it is written is held by `design/styles.test.ts`.
  it('lights up in the half-opaque shade this bar answers with', () => {
    render(<TitleBar activeWorkspace="image" onWorkspace={vi.fn()} />)

    expect(pill('Image')).toHaveClass('hover:bg-elevated/60', 'hover:text-text')
  })
})
