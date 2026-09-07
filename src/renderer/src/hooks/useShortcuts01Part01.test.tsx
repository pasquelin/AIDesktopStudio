import type { CommandId } from '@shared/domain/command'
import type { MotionId } from '@shared/domain/shortcut'
import { fireEvent, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { ShortcutsFixture } from './shortcuts-fixtures'
import { useShortcuts } from './useShortcuts'

const mount = (
  onCommand: (command: CommandId) => void,
  enabled = true,
  onMotionChange?: (held: Set<MotionId>) => void,
  documentId?: string,
  isFlying?: () => boolean,
) =>
  renderHook(
    () =>
      useShortcuts({ scope: 'scene', enabled, documentId, onCommand, onMotionChange, isFlying }),
    { wrapper: ShortcutsFixture },
  )

describe('useShortcuts', () => {
  it('fires the command bound to the pressed physical key', async () => {
    const onCommand = vi.fn()
    mount(onCommand)
    await userEvent.keyboard('{g}')
    expect(onCommand).toHaveBeenCalledWith('scene.translate')
  })

  /**
   * The chord that started all this. On a French keyboard the key marked Q sits where a US
   * keyboard puts A, so reading the position fired the canvas's Select All AND swallowed the
   * keypress — the application could not be quit from the image space at all.
   */
  it('leaves ⌘ and the key marked Q to the platform, wherever that key sits', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    const quit = new KeyboardEvent('keydown', {
      code: 'KeyA',
      key: 'q',
      metaKey: true,
      cancelable: true,
      bubbles: true,
    })
    window.dispatchEvent(quit)

    expect(onCommand).not.toHaveBeenCalled()
    expect(quit.defaultPrevented).toBe(false)
  })

  it('fires a command from the key that PRINTS its letter, not the one at that position', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    // AZERTY: `g` is one position to the left of where a US keyboard has it.
    fireEvent.keyDown(window, { code: 'KeyH', key: 'g' })

    expect(onCommand).toHaveBeenCalledWith('scene.translate')
  })

  it('fires once for a key held down, not once per auto-repeat', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    fireEvent.keyDown(window, { code: 'KeyG' })
    fireEvent.keyDown(window, { code: 'KeyG', repeat: true })
    fireEvent.keyDown(window, { code: 'KeyG', repeat: true })

    expect(onCommand).toHaveBeenCalledTimes(1)
  })

  it('ignores a key typed into a text field', async () => {
    const onCommand = vi.fn()
    mount(onCommand)
    await userEvent.click(screen.getByLabelText('prompt'))
    await userEvent.keyboard('{g}')
    expect(onCommand).not.toHaveBeenCalled()
  })

  // A dropdown types too, and the shared guard is the only thing that knows it — a copy local to
  // this hook forgot it once already. Dispatched from the element rather than through focus, so
  // what this pins is the guard and not what jsdom does with focus on a `<select>`.
  it('ignores a key sent from a dropdown', () => {
    const onCommand = vi.fn()
    mount(onCommand)
    // Attached, because an orphan element's events never reach the `window` listener under test —
    // and removed after, because Testing Library's cleanup only owns what `render` created.
    const dropdown = document.body.appendChild(document.createElement('select'))
    onTestFinished(() => dropdown.remove())

    fireEvent.keyDown(dropdown, { code: 'KeyG' })

    expect(onCommand).not.toHaveBeenCalled()
  })

  // The platform copies a live selection from anywhere: taking ⌘C would leave the user no way
  // to copy the text they just highlighted.
  it('leaves ⌘C to the text the user has highlighted', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    const selection = window.getSelection()
    selection?.selectAllChildren(screen.getByLabelText('prompt').parentElement as HTMLElement)
    fireEvent.keyDown(window, { code: 'KeyC', metaKey: true })

    expect(onCommand).not.toHaveBeenCalled()

    selection?.removeAllRanges()
    fireEvent.keyDown(window, { code: 'KeyC', metaKey: true })
    expect(onCommand).toHaveBeenCalledWith('scene.copy')
  })

  /**
   * Why the rule is per command and not "⌘ wins from a field": ⌘E merges a layer down, and a
   * layer is renamed in an `<input>` while its document stays the active tab. Firing it there
   * would flatten the layer mid-rename, and the ⌘Z reflex undoes the typing, not the merge.
   */
  it.each(['KeyG', 'KeyD', 'KeyZ', 'KeyV', 'KeyC'])(
    'leaves ⌘%s alone when the command has not declared it',
    code => {
      const onCommand = vi.fn()
      mount(onCommand)

      fireEvent.keyDown(screen.getByLabelText('prompt'), { code, metaKey: true })

      expect(onCommand).not.toHaveBeenCalled()
    },
  )

  // The motion branch now sits behind its own typing check rather than behind an early return:
  // flying while writing in a field would be the regression that restructuring could cause.
})
