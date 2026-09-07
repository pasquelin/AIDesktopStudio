import { mdiChevronRight, mdiFolderOutline } from '@mdi/js'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { COLUMN_ARROWS } from '@/hooks/useColumnKeys'
import type { FolderColumn } from '@/hooks/useFolderColumns'
import { useRoleOfFolder } from '@/hooks/useRoleOfFolder'
import { cn } from '@/helpers/cn'
import { roleIcon, roleInk } from '@/helpers/workspaces'
import { Row } from '../Row'
import { rowSkin } from '../styles'
import { UiIcon } from '../UiIcon'

export type FolderPickerColumnProps = {
  column: FolderColumn
  /** The folder chosen IN this column, if the walk goes on past it. */
  chosen: string | undefined
  onPick: (folder: string) => void
  /** An arrow was pressed on a row. The picker answers, since only it sees the other columns. */
  onArrow: (from: string, key: string) => void
  /** The row to put the caret on, once the keyboard has moved the choice. */
  focused: string | null
  /** Already translated — shown in place of the rows when the folder holds no sub-folder. */
  emptyLabel: string
  /** Names the column for a reader, since a listbox with no name is announced as « list box ». */
  label: string
}

/**
 * What one folder holds, as its own column.
 *
 * A listbox rather than a row of buttons: a column is a set of alternatives of which one is
 * chosen, which is what `aria-selected` says and what a button cannot. `Row` draws the line, so
 * this column keeps the height and the truncation every other list of the studio has.
 */
export function FolderPickerColumn({
  column,
  chosen,
  onPick,
  onArrow,
  focused,
  emptyLabel,
  label,
}: FolderPickerColumnProps) {
  const caret = useRef<HTMLDivElement>(null)
  // A folder that SERVES a section wears that section's glyph and hue, the way the explorer's tree
  // draws the very same folders: one colour code in the project, not one per surface.
  const roleOf = useRoleOfFolder()

  // Only where the keyboard put it: taking the focus on every render would pull the caret out of
  // the name field above on the first listing to come back.
  useEffect(() => {
    if (focused !== null && caret.current) caret.current.focus()
  }, [focused])

  if (column.read && column.entries.length === 0)
    return (
      <p className="text-muted m-0 w-(--sc-folder-column) shrink-0 px-2 py-1.5 text-xs">
        {emptyLabel}
      </p>
    )

  const onKeyDown =
    (folder: string) =>
    (event: KeyboardEvent): void => {
      if (COLUMN_ARROWS.includes(event.key)) {
        // The dialog behind binds none of these, but the columns scroll on them: an arrow that
        // both moved the choice and scrolled the frame moved the row out from under itself.
        event.preventDefault()
        onArrow(folder, event.key)
        return
      }

      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onPick(folder)
    }

  return (
    <div
      role="listbox"
      aria-label={label}
      // The half-step between rows is the menu's own: names run together without it, and a
      // column of folder names is read by scanning rather than line by line.
      className="flex w-(--sc-folder-column) shrink-0 flex-col gap-0.5 overflow-y-auto p-1"
    >
      {column.entries.map(entry => {
        const role = roleOf(entry.path)

        return (
          <div
            key={entry.path}
            ref={entry.path === focused ? caret : undefined}
            role="option"
            aria-selected={entry.path === chosen}
            // Both, and on the same element: `aria-selected` is what a reader hears, `data-selected`
            // is what lifts the row's own words out of `muted` on the picked fill.
            data-selected={entry.path === chosen ? '' : undefined}
            // A roving stop: one per column, so Tab steps from column to column rather than
            // through every folder a project holds.
            tabIndex={
              entry.path === chosen || (chosen === undefined && entry === column.entries[0])
                ? 0
                : -1
            }
            onClick={() => onPick(entry.path)}
            onKeyDown={onKeyDown(entry.path)}
            // The gauge, and it has to be HERE: `Row` draws itself at `h-full`, so a parent with no
            // height of its own leaves every line as tall as its text — `Tree` gives its rows one
            // through the virtualizer, and a list that does not is the one that reads cramped.
            className={cn(rowSkin(entry.path === chosen), 'h-(--sc-control) cursor-pointer')}
          >
            <Row
              icon={role ? roleIcon(role) : mdiFolderOutline}
              iconInk={role ? roleInk(role) : undefined}
              title={entry.name}
              // What says a folder opens a column of its own — the Finder draws the same one. The
              // quiet ink rather than an opacity: it is a glyph that informs, held to 3:1 (1.4.11).
              actions={<UiIcon path={mdiChevronRight} size={12} className="text-muted" />}
            />
          </div>
        )
      })}
    </div>
  )
}
