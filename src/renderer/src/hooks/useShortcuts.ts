import { useEffect, useRef, type RefObject } from 'react'
import {
  commandDescriptor,
  commandFor,
  type CommandId,
  type CommandScope,
} from '@shared/domain/command'
import { copiesText, type MotionId, signatureOf } from '@shared/domain/shortcut'
import { IS_MAC } from '@/helpers/platform'
import { isTyping } from '@/helpers/typing'
import { armCommandScope, subscribeToCommands, type CommandAnswer } from '@/services/commandBus'
import { currentOverrides, motionFor } from '@/stores/bindings'
import { useLatest } from './useLatest'

export type ShortcutsOptions = {
  /** Which surface is listening: the same key means different things on each. */
  scope: CommandScope
  /** A document only listens while it is the visible tab. Keyboard only — see `listens`. */
  enabled: boolean
  /**
   * Whether the surface answers a command SENT to it, which is a different question from whether
   * it holds the keyboard: a published command names its scope, so two surfaces that share ⌘Z
   * cannot be confused by one. Defaults to `enabled`; the Explorer sets it while merely mounted,
   * so a menu row or an MCP client reaches it without the panel having been clicked into first.
   */
  listens?: boolean
  /**
   * Which document this surface shows, for the commands a sender addresses by name — see
   * `publishCommand`. Those reach it in a background tab too; keys never do.
   */
  documentId?: string
  /** `false` says the surface had nothing to do with it — an undo on an empty stack. */
  onCommand: (command: CommandId) => CommandAnswer | void
  /** Fires when the held set actually changes — never on a frame tick. */
  onMotionChange?: (held: Set<MotionId>) => void
  /**
   * Whether a flight is under way, and a flight OWNS its keys. Asked at the keystroke rather
   * than passed as state: it begins and ends on a mouse button, and rebuilding this effect
   * twice per gesture would drop whatever was held across it.
   */
  isFlying?: () => boolean
  /** Whether the ARROWS fly too — see `SceneRenderer.flightOwnsArrows`. */
  flightOwnsArrows?: () => boolean
}

function holdsText(): boolean {
  const selection = window.getSelection()
  return selection !== null && !selection.isCollapsed
}

/**
 * Commands fire once on press; motions are held, and reported only when the set changes.
 *
 * Pushing on change rather than letting the consumer poll every frame is what keeps an idle
 * viewport idle: a `requestAnimationFrame` loop that only reads a set nobody touched still
 * wakes the CPU sixty times a second.
 *
 * The set is also exposed as a mutable ref, for a consumer that already runs a loop and would
 * rather read it than be called.
 */
export function useShortcuts({
  scope,
  enabled,
  listens = enabled,
  documentId,
  onCommand,
  onMotionChange,
  isFlying,
  flightOwnsArrows,
}: ShortcutsOptions): {
  heldMotion: RefObject<Set<MotionId>>
} {
  const heldMotion = useRef<Set<MotionId>>(new Set())
  const handlers = useLatest({ onCommand, onMotionChange, isFlying, flightOwnsArrows })

  /**
   * The same surface, reached the other way: the native menu fires a command outright rather
   * than a key, and on macOS it is the menu — never the window — that hears an accelerator it
   * declared. Both doors have to lead here, or a row of the menu does nothing.
   *
   * Its own effect, outside `enabled`: a command ADDRESSED to a document must reach it in a
   * background tab, which is the one thing a key must never do.
   */
  useEffect(
    () =>
      subscribeToCommands((command, to) => {
        if (commandDescriptor(command)?.scope !== scope) return false
        if (to === null ? !listens : to !== documentId) return false

        // `void` from a surface means it acted: only one that says `false` outright is reported
        // as having done nothing.
        return handlers.current.onCommand(command) ?? true
      }),
    [scope, listens, documentId, handlers],
  )

  // Declared to the bus so a sender can be told its command reached nothing, rather than watching
  // it vanish — the one thing `publishCommand` cannot answer on its own.
  useEffect(() => (listens ? armCommandScope(scope) : undefined), [scope, listens])

  useEffect(() => {
    const held = heldMotion.current
    const release = () => {
      if (held.size === 0) return
      held.clear()
      handlers.current.onMotionChange?.(held)
    }

    if (!enabled) {
      release()
      return
    }

    /**
     * A flight, and nothing else, reads a key ahead of the tree — and only while one is under
     * way. A surface that shields what is behind it does so from a React handler, which capture
     * on `window` would run ahead of: outside a flight this must stay silent. See `onKeyDown`.
     */
    const onFlightKeyDown = (event: KeyboardEvent) => {
      if (!handlers.current.isFlying?.() || isTyping(event.target)) return
      // On the CODE, never the signature: holding Shift to boost would sign every direction as
      // `Shift+…`, and the table would match none of them.
      const motion = motionFor(event.code, event)
      if (!motion) return
      // An arrow belongs to the interface unless a GESTURE holds the flight: claimed under a
      // permanent one, every arrow of the window died for the session — see `flightOwnsArrows`.
      if (event.code.startsWith('Arrow') && handlers.current.flightOwnsArrows?.() === false) return

      // Holding a key repeats keydown; only a set that actually changed is worth reporting.
      if (!held.has(motion)) {
        held.add(motion)
        handlers.current.onMotionChange?.(held)
      }

      // The flight owns the key: the list the pointer left focused never sees the arrow, and `S`
      // does not reach `scene.scale` while it means "back". Only the modality tells them apart.
      event.preventDefault()
      event.stopPropagation()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // A field keeps every command, and the lookup is skipped rather than thrown away: ⌘E would
      // flatten a layer while its name is being typed, and the ⌘Z reflex would undo the typing
      // rather than the merge. `commandFor` walks the whole registry, on every keystroke typed.
      if (isTyping(event.target)) return

      const signature = signatureOf(event, IS_MAC)
      const command = commandFor(signature, scope, currentOverrides())
      if (!command) return
      if (copiesText(signature) && holdsText()) return
      event.preventDefault()
      // A held key repeats keydown. Space is held far more readily than ⌘Z, and a transport
      // toggled thirty times a second is a strobe, not a shortcut.
      if (!event.repeat) handlers.current.onCommand(command)
    }

    // In the bubble phase, and never consumed: the flight may already be over when the key comes
    // up, and a direction that stayed held would fly the camera on the next press of the button.
    const onKeyUp = (event: KeyboardEvent) => {
      const motion = motionFor(event.code)
      if (motion && held.delete(motion)) handlers.current.onMotionChange?.(held)
    }

    // The window losing focus never delivers the keyup: without this the camera would keep
    // flying after an ⌘Tab.
    const onBlur = release

    // The flight listens in capture, the commands stay in bubble. Moving the commands too would
    // run them ahead of every `stopPropagation` a surface uses to shield what is behind it.
    window.addEventListener('keydown', onFlightKeyDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onFlightKeyDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      release()
    }
  }, [enabled, scope, handlers])

  return { heldMotion }
}
