import { useEffect, useState } from 'react'
import { useDebounced, SEARCH_DELAY_MS } from '@/hooks/useDebounced'
import { useRowHeight } from '@/hooks/useRowHeight'
import { useTranslation } from 'react-i18next'
import { mdiBrain } from '@mdi/js'
import { MEMORY_TYPES, type MemoryScope, type MemoryType } from '@shared/domain/assistantMemory'
import { MEMORY_SHOWN } from './memoryShown'
import { Collection } from '@/components/Collection/Collection'
import { EmptyState } from '@/components/EmptyState'
import { WindowChip } from '@/components/WindowChip'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { fieldHandle } from '@/components/scHandle'
import { cn } from '@/helpers/cn'
import { useAssistantMemory } from '@/stores/assistantMemory'
import { useProject } from '@/stores/project'
import { SETTING_COLUMN } from '../settingStyles'
import { MemoryRelations } from './Relations/MemoryRelations'
import { MemoryRowActions } from './Row/MemoryRowActions'
import { MemoryRowDetail } from './Row/MemoryRowDetail'
import { MemoryUpkeep } from './MemoryUpkeep'
import { WindowInput } from '@/components/WindowInput'
import { WindowSelect } from '@/components/WindowSelect'

/**
 * What the assistant has learned, and the only screen that can correct it.
 *
 * 🛑 The panel asks for a listing when it OPENS, and never on mount: the memory thread opens
 * lazily, and a store connected at boot would have every window pay for a database nobody has
 * asked a question of.
 */

/** The `p-2` a `Collection` puts around its own rows — counted, or the last row is clipped. */
const LIST_PAD = 16

/** What one open row's detail is given before the list starts scrolling instead of the page. */
const OPEN_ROW_ROOM = 220

/** What the empty state needs to be read: its glyph, its padding and a sentence on two lines. */
const EMPTY_ROOM = 160

/** Past this the list scrolls rather than the page: a settings section is not a whole screen. */
const LIST_CAP = 320

export function MemorySettings() {
  const { t } = useTranslation()
  const memories = useAssistantMemory(state => state.memories)
  const loaded = useAssistantMemory(state => state.loaded)
  const look = useAssistantMemory(state => state.look)
  // 🛑 Which of « nothing learned » and « no project open » is true is not the memory's to know:
  // its `project` scope answers an empty list for both, and the two ask for opposite things.
  const opened = useProject(state => state.project !== null)
  // Held HERE and handed to `look`, rather than read back off the store: the store's own scope
  // moves when the listing lands, so a chip reading it would light up a beat after the click.
  const [scope, setScope] = useState<MemoryScope>('project')
  const [text, setText] = useState('')
  // 🛑 Debounced, or every keystroke clears the list, crosses IPC and pays an FTS scan on the
  // memory thread — for an answer the next keystroke throws away.
  const searched = useDebounced(text.trim(), SEARCH_DELAY_MS)
  const [type, setType] = useState<MemoryType | ''>('')
  const [openId, setOpenId] = useState<string | null>(null)
  const rowHeight = useRowHeight('control')
  // Room for the open row's own detail, so opening one does not put a scrollbar inside a page
  // that already scrolls. Past the cap the list scrolls, which is what a cap is for.
  const shown = memories.length * rowHeight + (openId === null ? 0 : OPEN_ROW_ROOM)
  // 🛑 The empty arm is not the floor: `EmptyState` is a 32 px glyph inside `p-6`, so a list
  // sized for one row clipped the very sentence a project with no memories exists to show.
  const listHeight = memories.length === 0 ? EMPTY_ROOM : Math.min(shown + LIST_PAD, LIST_CAP)

  useEffect(() => {
    // The one place a listing is asked for. `look` carries the scope AND the filters, so the
    // panel never holds a query the store disagrees with.
    void look(scope, {
      states: MEMORY_SHOWN,
      ...(searched ? { text: searched } : {}),
      ...(type ? { types: [type] } : {}),
    })
  }, [look, scope, searched, type])

  return (
    <div className={cn(SETTING_COLUMN, 'mt-6 gap-4')}>
      {/* `WindowChip` and not `Chip`: the settings window is not a dock — see its own file. */}
      <div className="flex gap-2">
        <WindowChip
          label={t('settings.memoryProject')}
          hint={t('settings.memoryProjectHint')}
          selected={scope === 'project'}
          onClick={() => setScope('project')}
        />
        <WindowChip
          label={t('settings.memoryGlobal')}
          hint={t('settings.memoryGlobalHint')}
          selected={scope === 'global'}
          onClick={() => setScope('global')}
        />
      </div>

      <div className="flex gap-2">
        {/* 🛑 `input-sm` and not `WindowSearch`, which is the NAV field of a window: it is
            `input-xs w-full shrink-0`, so it stood eight pixels shorter than the select beside it
            and took the whole row without yielding. Every other settings form is `…-sm`. */}
        <WindowInput
          data-sc={fieldHandle('memory.search')}
          type="search"
          className="min-w-0 grow"
          aria-label={t('settings.memorySearch')}
          placeholder={t('settings.memorySearch')}
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <WindowSelect
          data-sc="field:memory.type"
          aria-label={t('settings.memoryFilterAll')}
          /**
           * 🛑 A FLOOR, never a cap: the select must not take twice the field beside it. Bare
           * `w-auto` is worse —
           * `[M]` a native select sizes on the option SHOWN, so it jumped between 67 and 122 px
           * as the filter moved. The floor holds it still; it grows rather than truncate.
           */
          className="w-auto min-w-40 shrink-0"
          value={type}
          onChange={event => setType(event.target.value as MemoryType | '')}
        >
          <option value="">{t('settings.memoryFilterAll')}</option>
          {MEMORY_TYPES.map(one => (
            <option key={one} value={one}>
              {t(`memoryTypes.${one}`)}
            </option>
          ))}
        </WindowSelect>
      </div>

      <p className={WINDOW_CAPTION}>{t('settings.memoryCount', { count: memories.length })}</p>

      {/* 🛑 As tall as it HOLDS, capped — never a flat `h-80`. A virtualized list needs a stated
          height, and a stated one in a page that SCROLLS leaves dead space under a short list:
          one memory left four hundred pixels of nothing before the upkeep section. The gauge is
          read rather than written, which is what `useGauge` exists for — a constant would be
          right at one density only. `LIST_PAD` is the `p-2` the collection puts around itself. */}
      <div style={{ height: listHeight }}>
        <Collection
          items={memories}
          label={t('settings.memory')}
          expandedId={openId}
          // 🛑 The two, and `onOpen` is the point: `onToggleRow` is the CHEVRON alone, twelve
          // pixels of glyph to aim at for a row whose whole width says nothing happens on it.
          onToggleRow={one => setOpenId(openId === one.id ? null : one.id)}
          onOpen={one => setOpenId(openId === one.id ? null : one.id)}
          renderRowDetail={one => (
            <>
              <MemoryRowDetail memory={one} />
              <MemoryRelations memory={one} among={memories} onOpen={setOpenId} />
            </>
          )}
          renderRow={one => (
            <div className="flex w-full items-center gap-2 pl-1.5">
              <span className="grow truncate text-xs">{one.summary}</span>
              <span className={WINDOW_CAPTION}>{t(`memoryTypes.${one.type}`)}</span>
              <MemoryRowActions memory={one} />
            </div>
          )}
          empty={
            <EmptyState
              icon={mdiBrain}
              message={emptyMessage(t, {
                loaded,
                scope,
                opened,
                searching: text.trim().length > 0,
              })}
            />
          }
        />
      </div>

      <MemoryUpkeep memories={memories} />
    </div>
  )
}

/**
 * Empty, unmatched, or a studio with no project open — three different things to say, and a
 * fourth that says nothing at all.
 *
 * 🛑 Silent while the first answer is on its way: `loaded` exists precisely so a panel drawn
 * before it does not claim « nothing learned », and the branch that did was the one it guards.
 * And « open a project » is only true when none IS open — the memory answers an empty list for
 * both cases, so the project store is what tells them apart.
 */
function emptyMessage(
  t: (key: string) => string,
  where: { loaded: boolean; scope: MemoryScope; opened: boolean; searching: boolean },
): string {
  if (!where.loaded) return ''
  if (where.searching) return t('settings.memoryUnmatched')
  if (where.scope === 'project' && !where.opened) return t('settings.memoryNoProject')

  return t('settings.memoryEmpty')
}
