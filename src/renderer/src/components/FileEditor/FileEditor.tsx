import { useId, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { FIELD_HELP } from '../styles'
import { ViewSwitch, type ViewSwitchOption } from '../ViewSwitch/ViewSwitch'

export type FileEditorProps<Id extends string> = {
  /**
   * Already translated, one line: what this KIND of file is and what changing it does. It is the
   * first thing read on opening a format one has never seen, and the reason it is a required prop
   * rather than an option — an editor that explains nothing is the defect this shell exists for.
   */
  description: string
  views: readonly ViewSwitchOption<Id>[]
  /** Already translated. What the run of views chooses between. */
  viewsLabel: string
  view: Id
  onView: (id: Id) => void
  /** Already translated. What went wrong with the file, said above what it is about. */
  error?: string | null
  /** The active view's own body. Only the shown one is mounted — its host decides. */
  children: ReactNode
  scId: string
}

/**
 * The shell every file the studio edits as a FORM wears: a run of views, one sentence saying what
 * the file is, a band for a refusal, and the body that scrolls.
 *
 * Written once because the second such editor — a control map and an animation graph read the
 * same way — would otherwise copy the loading, the modified mark, the save and the view bar along
 * with the layout. What a format owns is its FORMS; everything around them is this.
 */
export function FileEditor<Id extends string>({
  description,
  views,
  viewsLabel,
  view,
  onView,
  error,
  children,
  scId,
}: FileEditorProps<Id>) {
  const base = useId()
  const panelId = `${base}panel`

  return (
    <div className="bg-surface text-text flex size-full min-h-0 flex-col">
      <header className="border-border bg-panel flex flex-col gap-1.5 border-b p-(--sc-gutter)">
        <ViewSwitch
          label={viewsLabel}
          options={views}
          value={view}
          onChange={onView}
          baseId={base}
          panelId={panelId}
          scId={scId}
        />
        <p className={cn(FIELD_HELP, 'm-0 px-1')}>{description}</p>
      </header>
      {error && (
        <p role="alert" className="text-warning border-border m-0 border-b px-3 py-2 text-xs">
          {error}
        </p>
      )}
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${base}${view}`}
        // A COLUMN, so a view that fills its panel — a text editor — can ask for the room the
        // forms take from their own content.
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {children}
      </div>
    </div>
  )
}
