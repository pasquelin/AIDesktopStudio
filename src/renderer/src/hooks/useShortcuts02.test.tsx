import type { CommandId } from '@shared/domain/command'
import type { MotionId } from '@shared/domain/shortcut'
import { fireEvent, renderHook } from '@testing-library/react'
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
  it('stays silent when disabled', async () => {
    const onCommand = vi.fn()
    mount(onCommand, false)
    await userEvent.keyboard('{g}')
    expect(onCommand).not.toHaveBeenCalled()
  })

  it('tracks a held motion key and releases it', async () => {
    // One `setup()` instance, because a key held down is state: the direct `userEvent.keyboard`
    // starts from a blank keyboard every call and would silently skip the release.
    const user = userEvent.setup()
    const { result } = mount(vi.fn(), true, undefined, undefined, () => true)

    await user.keyboard('{w>}')
    expect([...result.current.heldMotion.current]).toEqual(['forward'])

    await user.keyboard('{/w}')
    expect([...result.current.heldMotion.current]).toEqual([])
  })

  it('holds the same direction from an arrow as from its letter', async () => {
    const user = userEvent.setup()
    const { result } = mount(vi.fn(), true, undefined, undefined, () => true)

    await user.keyboard('{ArrowUp>}')
    expect([...result.current.heldMotion.current]).toEqual(['forward'])

    await user.keyboard('{/ArrowUp}')
    expect([...result.current.heldMotion.current]).toEqual([])
  })

  // The boost key IS Shift, so its own keydown already carries `shiftKey` — read through
  // `signatureOf` it signed as `Shift+ShiftLeft` and matched nothing, leaving the boost setting
  // inert and every direction pressed under it dead.
  it('holds boost, and the direction pressed while it is held', async () => {
    const user = userEvent.setup()
    const { result } = mount(vi.fn(), true, undefined, undefined, () => true)

    await user.keyboard('{Shift>}')
    expect([...result.current.heldMotion.current]).toEqual(['boost'])

    await user.keyboard('{ArrowUp>}')
    expect([...result.current.heldMotion.current]).toEqual(['boost', 'forward'])
  })

  // A list is walked with the arrows, so this is the ordinary way to hold one: the flight must
  // not inherit a direction the user pressed to move through the outliner.
  it('takes no direction from a key held before the flight began', () => {
    const onMotionChange = vi.fn()
    let flying = false
    const { result } = mount(vi.fn(), true, onMotionChange, undefined, () => flying)

    fireEvent.keyDown(document.body, { code: 'ArrowDown' })
    expect([...result.current.heldMotion.current]).toEqual([])

    flying = true
    expect(onMotionChange).not.toHaveBeenCalled()
  })

  it('keeps a direction key from reaching anything downstream while flying', () => {
    const downstream = vi.fn()
    document.addEventListener('keydown', downstream)
    onTestFinished(() => document.removeEventListener('keydown', downstream))
    mount(vi.fn(), true, undefined, undefined, () => true)

    fireEvent.keyDown(document.body, { code: 'ArrowDown' })

    // An arrow the outliner still focused would answer scrolls the list out from under the
    // flight; the flight is what owns the key while the button is down.
    expect(downstream).not.toHaveBeenCalled()
  })

  // `KeyS` is both "back" and the scale gizmo, and nothing but the button down tells them apart.
  it('answers a shared key as a direction while flying, not as its command', () => {
    const onCommand = vi.fn()
    mount(onCommand, true, undefined, undefined, () => true)

    fireEvent.keyDown(document.body, { code: 'KeyS' })

    expect(onCommand).not.toHaveBeenCalled()
  })

  it('answers that same key as its command when no flight is under way', () => {
    const onCommand = vi.fn()
    mount(onCommand, true, undefined, undefined, () => false)

    fireEvent.keyDown(document.body, { code: 'KeyS' })

    expect(onCommand).toHaveBeenCalledWith('scene.scale')
  })

  /**
   * A modal — `AssetPicker` — shields the surfaces behind it with `stopPropagation` on a React
   * handler, which runs from the root container — ahead of `window` in bubble, behind it in
   * capture. Moving the command lookup to capture let `Delete` reach `scene.delete` from a
   * button inside an open dialog, where `isTyping` is false.
   */
  it('lets a surface shield what is behind it from a command key', () => {
    const onCommand = vi.fn()
    mount(onCommand, true)
    const shield = document.body.appendChild(document.createElement('div'))
    const inside = shield.appendChild(document.createElement('button'))
    shield.addEventListener('keydown', event => event.stopPropagation())
    onTestFinished(() => shield.remove())

    fireEvent.keyDown(inside, { code: 'Delete' })

    expect(onCommand).not.toHaveBeenCalled()
  })

  it('leaves a direction key to the rest of the window when no flight is under way', () => {
    const downstream = vi.fn()
    document.addEventListener('keydown', downstream)
    onTestFinished(() => document.removeEventListener('keydown', downstream))
    mount(vi.fn(), true, undefined, undefined, () => false)

    fireEvent.keyDown(document.body, { code: 'ArrowDown' })

    expect(downstream).toHaveBeenCalled()
  })

  it('drops every held key when the window loses focus', async () => {
    const user = userEvent.setup()
    const { result } = mount(vi.fn())

    await user.keyboard('{w>}')
    window.dispatchEvent(new Event('blur'))
    expect([...result.current.heldMotion.current]).toEqual([])
  })

  it('reports the held set when it changes, so nobody has to poll it every frame', async () => {
    const user = userEvent.setup()
    const onMotionChange = vi.fn()
    mount(vi.fn(), true, onMotionChange, undefined, () => true)

    await user.keyboard('{w>}')
    expect(onMotionChange).toHaveBeenCalledTimes(1)
    expect([...(onMotionChange.mock.lastCall?.[0] ?? [])]).toEqual(['forward'])

    await user.keyboard('{/w}')
    expect(onMotionChange).toHaveBeenCalledTimes(2)
    expect([...(onMotionChange.mock.lastCall?.[0] ?? [])]).toEqual([])
  })

  it('stays quiet while a held key repeats', async () => {
    const user = userEvent.setup()
    const onMotionChange = vi.fn()
    mount(vi.fn(), true, onMotionChange, undefined, () => true)

    await user.keyboard('{w>}')
    // Dispatched by hand: holding a key makes the platform repeat keydown without any keyup,
    // which `userEvent` will not reproduce — it releases between calls. The set never changes,
    // so neither should the reports.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    expect(onMotionChange).toHaveBeenCalledTimes(1)
  })

  it('reports the release when the window loses focus', async () => {
    const user = userEvent.setup()
    const onMotionChange = vi.fn()
    mount(vi.fn(), true, onMotionChange, undefined, () => true)

    await user.keyboard('{w>}')
    onMotionChange.mockClear()
    window.dispatchEvent(new Event('blur'))
    expect(onMotionChange).toHaveBeenCalledTimes(1)
    expect([...(onMotionChange.mock.lastCall?.[0] ?? [])]).toEqual([])
  })

  // A held command is heard by the window, so a surface must not also fire it as a tap — the
  // press would run the command and the hold at once.
  it('leaves a held command to the hook that holds it', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    fireEvent.keyDown(window, { code: 'KeyD', altKey: true })

    expect(onCommand).not.toHaveBeenCalled()
  })
})

/**
 * The arrows are the interface's unless a GESTURE is holding the flight. Claimed under a
 * permanent one — where `isFlying` is unconditionally true — they were cancelled in the capture
 * phase for the whole window, and every tree, menu and slider stopped answering them.
 */
it('leaves the arrows to the interface when no gesture holds the flight', () => {
  const held: string[][] = []
  renderHook(
    () =>
      useShortcuts({
        scope: 'scene',
        enabled: true,
        onCommand: () => {},
        isFlying: () => true,
        flightOwnsArrows: () => false,
        onMotionChange: motions => held.push([...motions]),
      }),
    { wrapper: ShortcutsFixture },
  )

  fireEvent.keyDown(window, { code: 'ArrowUp' })
  expect(held).toEqual([])

  // The letters stay the camera's either way — that is the whole point of a permanent flight.
  fireEvent.keyDown(window, { code: 'KeyW' })
  expect(held).toEqual([['forward']])
})
