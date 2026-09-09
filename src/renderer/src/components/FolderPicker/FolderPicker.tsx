import { Fragment, useState, type ReactNode } from 'react'
import { FOLDER_ROOT, folderTrail, nameOf } from '@shared/domain/folder'
import { useColumnKeys } from '@/hooks/useColumnKeys'
import { useFolderColumns } from '@/hooks/useFolderColumns'
import { FolderPickerColumn } from './FolderPickerColumn'
import { FolderPickerCreate } from './FolderPickerCreate'

export type FolderPickerProps = {
  /** The chosen folder, relative to the project. `FOLDER_ROOT` is the project folder itself. */
  value: string
  onChange: (folder: string) => void
  /** The project's own name, which is what the first column is headed with. */
  rootName: string
  /**
   * Every word this draws, already translated: it draws what it is handed and looks nothing up,
   * the way every other component of `design/` does.
   */
  labels: {
    columns: string
    empty: string
    newFolder: string
    newFolderName: string
    newFolderLabel: string
    create: string
    cancel: string
    folderTaken: string
    folderFailed: string
  }
  /**
   * What the surface around this does — the dialog's own Cancel and Create.
   *
   * Handed IN rather than drawn after, so the three sit on one line the way every save panel of
   * this machine arranges them: New folder on the left, the surface's own on the right. They are
   * withdrawn while a folder is being named, where the line already carries a field and two
   * buttons of its own.
   */
  actions?: ReactNode
}

/**
 * Where something goes in the project, picked in COLUMNS — the Finder's browser, and the shape
 * every save panel on this machine opens on.
 *
 * One column per level: picking a folder opens its own column beside it and makes it the answer.
 * There is one notion and not two — where you are IS where it goes — which is what a tree could
 * not say and what a drop-down plus a breadcrumb said twice.
 *
 * The walk is the whole of the state: picking a folder higher up drops every column past it.
 */
export function FolderPicker({ value, onChange, rootName, labels, actions }: FolderPickerProps) {
  const { columns, reread } = useFolderColumns(value)
  const [naming, setNaming] = useState(false)
  const { focused, onArrow } = useColumnKeys(columns, onChange)
  const trail = folderTrail(value)

  return (
    // Fills whatever height it is given, the columns taking the slack: this browses a window,
    // and a fixed box would leave a strip of nothing under it with the buttons floating there.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Where the document will be written, ABOVE the columns — the way the save panel puts its
          own. The lit rows say it too, but only to whoever reads three columns at once.

          Cut at the START, which is what `Row` already does for a path: the far end carries the
          folder the document lands in, and clipping the ordinary way keeps the half nobody needs. */}
      <p className="text-text truncate-start m-0 text-xs">
        {trail.map(folder => (folder === FOLDER_ROOT ? rootName : nameOf(folder))).join(' / ')}
      </p>

      <div
        role="group"
        aria-label={labels.columns}
        // `panel`, darker than the dialog it sits on: the studio's surfaces are recessed, and a
        // browser drawn in the dialog's own fill reads as a stretch of nothing with a border.
        // Grows with the window down to a floor: under three rows a column browser is a slot,
        // and the walk it is there to show no longer reads.
        className="border-border bg-panel min-h-48 flex-1 overflow-x-auto rounded-(--radius-sc-sm) border"
      >
        <div className="flex h-full min-w-min">
          {columns.map((column, index) => (
            <Fragment key={column.folder}>
              {index > 0 && <div className="bg-border w-px shrink-0" aria-hidden="true" />}
              <FolderPickerColumn
                column={column}
                // The next step of the walk is what this column has chosen — and the last column
                // has chosen nothing, which is what leaves it with no row lit.
                chosen={trail[index + 1]}
                onPick={onChange}
                onArrow={onArrow}
                focused={focused}
                emptyLabel={labels.empty}
                label={column.folder === FOLDER_ROOT ? rootName : nameOf(column.folder)}
              />
            </Fragment>
          ))}

          {/* The room a column WOULD take, ruled off like the others. Without it the browser
              stops mid-way and the rest of the frame reads as a panel that failed to draw. */}
          <div className="bg-border w-px shrink-0" aria-hidden="true" />
          <div className="min-w-(--sc-folder-column) flex-1" aria-hidden="true" />
        </div>
      </div>

      {/* One line, the way a save panel arranges it: what makes a folder on the left, what
          settles the dialog on the right. */}
      <div className="flex items-center gap-2">
        <FolderPickerCreate
          folder={value}
          labels={labels}
          naming={naming}
          onNaming={setNaming}
          onCreated={onChange}
          onReread={() => reread(value)}
        />

        {/* `ms-auto` and not a stretched button at the start: what makes a folder is as wide as its
            own label, and the room between the two ends belongs to neither. */}
        {!naming && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
