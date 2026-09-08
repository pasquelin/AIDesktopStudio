import { orElse } from '@shared/promises'
import { Input } from '../Input'
import { mdiFolderPlusOutline } from '@mdi/js'
import { useState, type KeyboardEvent } from 'react'
import { isComposing } from '@/helpers/composition'
import { getBridge } from '@/services/bridge'
import { Button } from '../Button'
import { UiIcon } from '../UiIcon'

export type FolderPickerCreateProps = {
  /** Where the new folder is made — the one the columns have chosen. */
  folder: string
  labels: {
    newFolder: string
    newFolderName: string
    newFolderLabel: string
    create: string
    cancel: string
    folderTaken: string
    folderFailed: string
  }
  /**
   * Whether a name is being typed. Held by the picker rather than here: the line this sits on
   * carries the dialog's own buttons too, and they are withdrawn while a folder is being named.
   */
  naming: boolean
  onNaming: (naming: boolean) => void
  /** The folder was made: its path, which becomes the chosen one. */
  onCreated: (folder: string) => void
  /** Reads the chosen folder's column again, so the row that just appeared is drawn. */
  onReread: () => void
}

/**
 * Making a folder without leaving the dialog, in the folder the columns have chosen.
 *
 * Bottom left, which is where every save panel on this machine puts it. Where the folder lands is
 * read off the trail above the columns, not off this button's label.
 *
 * Committed on the button and on Enter — deliberately NOT on blur, which is what `InlineRename`
 * does: a blur-commit would make a folder nobody asked for out of a half-typed name.
 */
export function FolderPickerCreate({
  folder,
  labels,
  naming,
  onNaming,
  onCreated,
  onReread,
}: FolderPickerCreateProps) {
  const [draft, setDraft] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const give = (open: boolean): void => {
    onNaming(open)
    setDraft(open ? labels.newFolderName : '')
    setRefusal(null)
  }

  const create = async (): Promise<void> => {
    const name = draft.trim()
    if (!name) return

    const outcome = await orElse(getBridge()?.project.newFolder(folder, name), null)

    // What the disk says it made, not what was asked for: the name travels through a parser and
    // a filesystem that both normalise. `from` is empty for something that CAME — `PathChange`.
    const made = outcome?.done[0]?.to
    if (made === undefined) {
      setRefusal(
        outcome?.refused[0]?.reason === 'exists' ? labels.folderTaken : labels.folderFailed,
      )
      return
    }

    onReread()
    give(false)
    onCreated(made)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // The dialog around it submits on Enter and closes on Escape: a name typed here must reach
    // neither, or naming a folder would make the document.
    event.stopPropagation()
    if (isComposing(event)) return
    if (event.key === 'Escape') give(false)
    if (event.key === 'Enter') void create()
  }

  if (!naming)
    return (
      <Button variant="primary" onClick={() => give(true)} className="shrink-0 gap-1.5">
        <UiIcon path={mdiFolderPlusOutline} size={14} className="shrink-0" />
        {labels.newFolder}
      </Button>
    )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label className="text-muted truncate text-xs" htmlFor="sc-folder-picker-name">
        {labels.newFolder}
      </label>

      <div className="flex items-center gap-2">
        <Input
          autoFocus
          data-sc="field:folderPicker.name"
          id="sc-folder-picker-name"
          aria-label={labels.newFolderLabel}
          value={draft}
          className="flex-1 text-xs"
          onChange={event => {
            setDraft(event.target.value)
            setRefusal(null)
          }}
          onKeyDown={onKeyDown}
        />

        {/* Spelt out rather than left to Enter: a field whose only way out is a key looks stuck
            to whoever does not try one. */}
        <Button className="shrink-0" onClick={() => give(false)}>
          {labels.cancel}
        </Button>
        <Button
          variant="primary"
          className="shrink-0"
          disabled={draft.trim() === ''}
          onClick={() => void create()}
        >
          {labels.create}
        </Button>
      </div>

      {refusal && (
        <p role="alert" className="text-warning m-0 text-xs">
          {refusal}
        </p>
      )}
    </div>
  )
}
