import type { CommandId } from '@shared/domain/command'
import type { MotionId } from '@shared/domain/shortcut'
import { fireEvent, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { publishCommand } from '@/services/commandBus'
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
  it('registers no motion for a key typed into a field', () => {
    const onMotionChange = vi.fn()
    const { result } = mount(vi.fn(), true, onMotionChange, undefined, () => true)

    fireEvent.keyDown(screen.getByLabelText('prompt'), { code: 'KeyW' })

    expect([...result.current.heldMotion.current]).toEqual([])
    expect(onMotionChange).not.toHaveBeenCalled()
  })

  /**
   * The native menu fires a command, never a key — and on macOS the menu is what hears an
   * accelerator it declared, so the window never sees it. Both doors lead to the surface, or a
   * menu row does nothing: eleven of them did.
   */
  it('runs a command the menu published for its own scope', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    publishCommand('scene.frame')

    expect(onCommand).toHaveBeenCalledWith('scene.frame')
  })

  // Two surfaces are mounted at once — a scene tab and an image tab — and the same command must
  // not run on both. The scope is what tells them apart.
  it('leaves alone a command belonging to another surface', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    publishCommand('canvas.flatten')

    expect(onCommand).not.toHaveBeenCalled()
  })

  // A hidden tab stays mounted: it must not run what the tab in front was handed.
  it('ignores a published command while disabled', () => {
    const onCommand = vi.fn()
    mount(onCommand, false)

    publishCommand('scene.frame')

    expect(onCommand).not.toHaveBeenCalled()
  })

  /**
   * The one thing a key must never do, and the whole reason a sender may name a document: a
   * panel pinned to a background tab edits the document it SHOWS.
   */
  it('runs a command addressed to its document, hidden tab or not', () => {
    const onCommand = vi.fn()
    mount(onCommand, false, undefined, 'doc-1')

    publishCommand('scene.frame', 'doc-1')

    expect(onCommand).toHaveBeenCalledWith('scene.frame')
  })

  it('leaves alone a command addressed to another document, visible or not', () => {
    const onCommand = vi.fn()
    mount(onCommand, true, undefined, 'doc-1')

    publishCommand('scene.frame', 'doc-2')

    expect(onCommand).not.toHaveBeenCalled()
  })

  // Every surface holding no document at all — the explorer, a monitor. Addressed to a document,
  // the command is not theirs, and the tab in front is not a fallback.
  it('leaves alone an addressed command when it shows no document', () => {
    const onCommand = vi.fn()
    mount(onCommand)

    publishCommand('scene.frame', 'doc-1')

    expect(onCommand).not.toHaveBeenCalled()
  })
})
