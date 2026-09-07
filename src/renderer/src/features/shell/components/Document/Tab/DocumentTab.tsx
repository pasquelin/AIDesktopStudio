import { mdiClose } from '@mdi/js'
import type { IDockviewPanelHeaderProps } from 'dockview-react'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolButton } from '@/components/ToolButton'
import { UiIcon } from '@/components/UiIcon'
import { InlineRename } from '@/components/InlineRename'
import { cn } from '@/helpers/cn'
import { renameDocument } from '@/helpers/rename'
import { workspaceById, workspaceLabelKey } from '@/helpers/workspaces'
import { useDocumentModified } from '@/hooks/useDocumentModified'
import { useDocuments } from '@/stores/documents'
import { closeTab } from './closeTab'
import { panelIsFileView } from '../../dockviewApi'
import { openDocumentTabMenu } from './documentTabMenu'
import { HINT_BOTTOM, TIP_BOTTOM } from '@/helpers/tooltip'

/**
 * A document's tab.
 *
 * Dockview's own close button removes the panel and nothing else — it cannot ask about unsaved
 * work, and it left the document's state, its history and its descriptor behind. The cross
 * drawn here goes through `closeTab` instead. Drag lives on `.dv-tab`, which Dockview owns.
 *
 * The glyph in front is the document's SECTION, and it is what makes one tab strip readable for
 * six of them: a scene, an image and a texture now sit side by side, where the title alone says
 * nothing about which editor a tab opens. Same table as the rail and the document list — one
 * vocabulary, or two lists mean two different things by the same picture.
 */
export function DocumentTab(props: IDockviewPanelHeaderProps) {
  const { t } = useTranslation()
  const workspace = useDocuments(state => state.documents[props.api.id]?.workspace)
  const title = useDocuments(state => state.documents[props.api.id]?.title) ?? props.api.title
  const modified = useDocumentModified(props.api.id)
  const [renaming, setRenaming] = useState(false)
  const isFileView = panelIsFileView(props.api.id)

  const close = (event: MouseEvent): void => {
    // Dockview reads a click on the tab as "activate me"; this one is not that.
    event.stopPropagation()
    closeTab(props.api.id)
  }

  const openMenu = (event: MouseEvent): void => {
    if (isFileView) return
    event.preventDefault()
    openDocumentTabMenu({ documentId: props.api.id, t, onRename: () => setRenaming(true) })
  }

  const commitRename = (name: string): void => {
    setRenaming(false)
    if (title) renameDocument(props.api.id, title, name)
  }

  /**
   * The field takes the whole tab while it is open — the drag, the close button and the space
   * glyph all step aside. Leaving a title mounted under a field would have a rename begin a
   * drag on the first pointer move.
   */
  if (renaming && title)
    return (
      <span className="flex-1 px-1">
        <InlineRename
          value={title}
          label={t('documents.renameLabel')}
          onCommit={commitRename}
          gauge="inline"
        />
      </span>
    )

  return (
    <span className="flex min-w-0 flex-1 items-center" onContextMenu={openMenu}>
      {workspace && (
        // A hint and no `aria-label`: the tab's own title is its accessible name, and one set
        // here would replace it (WCAG 2.5.3). The sentence is what the glyph cannot spell.
        <span
          className="flex shrink-0 items-center"
          {...HINT_BOTTOM(t(workspaceLabelKey(workspace)))}
        >
          <UiIcon path={workspaceById(workspace).icon} size={14} className="text-muted" />
        </span>
      )}
      {/* Double-click renames, as it does in the layer stack, the outliner and the track
          headers — the gesture a title one can edit is expected to answer. */}
      <span
        className="flex min-w-0 flex-1 items-center gap-0.5 px-1"
        onDoubleClick={() => {
          if (!isFileView) setRenaming(true)
        }}
      >
        <span className={cn('min-w-0 truncate', modified && 'font-semibold')}>{title}</span>
        {modified ? <span className="text-accent-ink shrink-0">*</span> : null}
      </span>
      {/* Same footprint as the cross it replaces, so a tab does not change width for having
          its own close button. */}
      <ToolButton
        icon={mdiClose}
        label={t('documents.close')}
        tooltip={TIP_BOTTOM}
        variant="header"
        iconSize={12}
        className="mr-1 size-4 shrink-0 self-center"
        onClick={close}
      />
    </span>
  )
}
