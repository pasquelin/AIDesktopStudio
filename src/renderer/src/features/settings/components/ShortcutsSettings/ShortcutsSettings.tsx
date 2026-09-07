import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  bindingOf,
  COMMAND_SCOPES,
  commandsIn,
  conflicts,
  type CommandDescriptor,
  type CommandId,
} from '@shared/domain/command'
import type { Signature } from '@shared/domain/shortcut'
import { useOverrides } from '@/hooks/useOverrides'
import { useStagedNavigation } from '@/hooks/useStagedNavigation'
import { resolveBindings } from '@/stores/bindings'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { ShortcutsSettingsScope } from './ShortcutsSettingsScope'
import { ShortcutsSettingsSearchByChord } from './ShortcutsSettingsSearchByChord'

/**
 * The shortcuts screen. What no descriptor can express: a binding is captured by pressing it,
 * and a conflict only exists between two commands, never within one.
 *
 * Grouped by scope because that IS the rule: the same key on two surfaces is the design — only
 * one of them is ever listening — and showing them in one flat list would read as a clash.
 */
export function ShortcutsSettings() {
  const { t } = useTranslation()
  const [overrides, setOverrides] = useOverrides()
  // What the screen SHOWS is resolved against the system; what `bind` writes is not — see
  // `resolveBindings`. Read raw, this screen offered ⌃⌘F for a full screen that answers F11.
  // Resolved once and handed down: a merge per row is 171 of them on every keystroke.
  // The scheme too: it is the middle layer, so a row shows the key the CHOSEN application gives
  // a command, and calls it remapped only where the person themselves moved it.
  const [preset, custom] = useStagedNavigation()
  const resolved = useMemo(
    () => resolveBindings(overrides, preset, custom),
    [overrides, preset, custom],
  )
  /**
   * What is listening, if anything. ONE state rather than one per listener: a row and the
   * search box each holding their own meant a keypress could be recorded as a binding and used
   * as a query at the same time.
   */
  const [listening, setListening] = useState<CommandId | 'search' | null>(null)
  const [query, setQuery] = useState<Signature | null>(null)

  const capturing = listening === 'search' ? null : listening

  // Rebuilt only when a binding moves, not on every keystroke of a capture.
  const clashing = useMemo(() => new Set(conflicts(resolved)), [resolved])

  const bind = (id: CommandId, signature: Signature | null): void => {
    setListening(null)

    const next = { ...overrides }
    // Removed rather than set to the default value: the row then reads as "not remapped", and
    // a future version changing that default reaches this user too.
    if (signature === null) delete next[id]
    else next[id] = signature

    setOverrides(next)
  }

  // The question people actually ask is "what has ⌘K?", not "what is undo bound to".
  const matches = (descriptor: CommandDescriptor): boolean =>
    query === null || bindingOf(descriptor.id, resolved) === query

  return (
    <div className="mt-3 flex flex-col gap-4">
      <ShortcutsSettingsSearchByChord
        query={query}
        listening={listening === 'search'}
        onListen={() => setListening(listening === 'search' ? null : 'search')}
        onQuery={signature => {
          setListening(null)
          setQuery(signature)
        }}
      />

      {COMMAND_SCOPES.map(scope => (
        <ShortcutsSettingsScope
          key={scope}
          scope={scope}
          descriptors={commandsIn(scope).filter(matches)}
          overrides={overrides}
          resolved={resolved}
          clashing={clashing}
          capturing={capturing}
          onCapture={setListening}
          onBind={bind}
        />
      ))}

      {query !== null && !COMMAND_SCOPES.some(scope => commandsIn(scope).some(matches)) && (
        <p className={WINDOW_CAPTION}>{t('settings.chordFree')}</p>
      )}
    </div>
  )
}
