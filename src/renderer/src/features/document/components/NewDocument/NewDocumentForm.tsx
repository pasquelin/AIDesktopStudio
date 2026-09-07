import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { orElse } from '@shared/promises'
import {
  extensionOfKind,
  roleForKind,
  type DocumentDescriptor,
  type DocumentKind,
} from '@shared/domain/document'
import { checkDocumentName } from '@shared/domain/documentName'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import type { DocumentTemplateId, NamedDocumentPlace } from '@shared/domain/newDocument'
import { DEFAULT_SCENE_TEMPLATE, type SceneTemplateId } from '@shared/domain/sceneTemplate'
import { DEFAULT_UI_TEMPLATE, type UiTemplateId } from '@shared/domain/uiTemplates'
import { Button } from '@/components/Button'
import { FolderPicker } from '@/components/FolderPicker/FolderPicker'
import { FIELD_FILL, FILE_EXTENSION } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { isComposing } from '@/helpers/composition'
import { getBridge } from '@/services/bridge'
import { takenDocumentNames, untitledDocumentName, useDocuments } from '@/stores/documents'
import { DOCUMENT_NAME_REFUSALS } from '../../documentName'
import { NewDocumentTemplates } from './NewDocumentTemplates'
import { NewDocumentUiTemplates } from './NewDocumentUiTemplates'

export type NewDocumentFormProps = {
  kind: DocumentKind
  /** The folder the Explorer pointed at, or `null` to open on this kind's own. */
  picked: string | null
  projectName: string
  /** The documents a tab holds and no file does yet — nowhere on disk for the picker to find. */
  open: readonly DocumentDescriptor[]
  onCancel: () => void
  onSubmit: (place: NamedDocumentPlace) => void
}

/**
 * What a document is called, what it opens on, and where it goes. Mounted under a `key` of its
 * kind, so picking another remounts rather than reconciles — which is what leaves it one effect.
 *
 * A name is refused where it is TYPED and the refusal follows the FOLDER: one taken here is free
 * in the next. Two template states because `empty` is the one id both families spell.
 */
export function NewDocumentForm({
  kind,
  picked,
  projectName,
  open,
  onCancel,
  onSubmit,
}: NewDocumentFormProps) {
  const { t } = useTranslation()

  const [folder, setFolder] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [template, setTemplate] = useState<SceneTemplateId>(DEFAULT_SCENE_TEMPLATE)
  const [uiTemplate, setUiTemplate] = useState<UiTemplateId>(DEFAULT_UI_TEMPLATE)
  const stored = useDocuments(state => state.stored)
  const field = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const extensionId = useId()
  const folderId = useId()
  const refusalId = useId()

  useEffect(() => {
    void (async () => {
      // ASKED, never composed: only the main process reads the folder markers, so only it knows
      // where a role went after a rename in the Finder — and asking is what lays it back down.
      // Only where the Explorer pointed at nothing: a round trip for an answer already held would
      // be one on every kind the person tries.
      const landing =
        picked ??
        (await orElse(
          getBridge()?.project.folderFor(roleForKind(kind)),
          DEFAULT_ROLE_PATHS[roleForKind(kind)],
        ))

      setFolder(landing)
      // Read from the store rather than from the subscription: a listing arriving later must not
      // re-run this and overwrite a name already being typed.
      const listed = useDocuments.getState().stored
      setDraft(
        untitledDocumentName(
          takenDocumentNames({ documents: {}, stored: [...listed, ...open] }, landing),
          kind,
        ),
      )
    })()
  }, [kind, picked, open])

  useEffect(() => {
    if (folder === null) return

    field.current?.focus()
    // And the whole name with it: the field opens on a name that is there to be replaced.
    field.current?.select()
  }, [folder])

  // The folder is still being asked for. Nothing is drawn rather than a field over a folder that
  // may not be the one it lands in — a name refused against the wrong folder is worse than a wait.
  if (folder === null) return null

  const refusal = checkDocumentName(
    draft,
    kind,
    takenDocumentNames({ documents: {}, stored: [...stored, ...open] }, folder),
  )

  /**
   * Enter makes the document from anywhere in the form, the name field alone being where it used
   * to work. What keeps the key says so itself: a folder row marks the event handled, and a plain
   * BUTTON has its own click — a template tile is neither, `aria-pressed` saying it is a choice.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key !== 'Enter' || isComposing(event) || event.defaultPrevented) return

    const target = event.target
    if (target instanceof HTMLButtonElement && !target.hasAttribute('aria-pressed')) return

    event.preventDefault()
    commit()
  }

  /** What this kind answers with, or nothing at all — never the other kind's id. */
  const templateOf = (): { template?: DocumentTemplateId } => {
    if (kind === 'scene') return { template }
    if (kind === 'gui') return { template: uiTemplate }
    return {}
  }

  /**
   * The template travels for the kind that DREW a section and for no other: one that showed none
   * would be answering with a choice nobody was offered.
   */
  const commit = (): void => {
    if (!refusal) onSubmit({ kind, title: draft.trim(), folder, ...templateOf() })
  }

  return (
    <form
      // The name at the top, the browser taking the slack, the buttons at the bottom edge
      // wherever that edge is.
      className="flex min-h-0 flex-1 flex-col gap-3"
      onKeyDown={onKeyDown}
      onSubmit={event => {
        event.preventDefault()
        commit()
      }}
    >
      {/* Labelled where it shows, not by an `aria-label`: two bare fields under one heading leave
          nothing to tell them apart, for a reader of either kind. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-muted text-xs">
          {t('documents.nameField')}
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={field}
            data-sc="field:newDocument.name"
            id={nameId}
            aria-describedby={refusal ? `${extensionId} ${refusalId}` : extensionId}
            value={draft}
            className={cn(FIELD_FILL, 'text-xs')}
            onChange={event => setDraft(event.target.value)}
          />
          {/* Read off the kind, and shown rather than offered: one format per kind is the whole
              of the open-format decision, so there is nothing here to pick between. */}
          <span id={extensionId} className={cn(FILE_EXTENSION, 'shrink-0 text-xs')}>
            {extensionOfKind(kind)}
          </span>
        </div>
      </div>

      {refusal && (
        <p id={refusalId} role="alert" className="text-warning m-0 text-xs">
          {t(DOCUMENT_NAME_REFUSALS[refusal])}
        </p>
      )}

      {/* Under the name and above the folder, which is the order the questions come in: what it
          is called, what it holds, where it goes. */}
      {(kind === 'scene' || kind === 'gui') && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted text-xs">{t('documents.templateField')}</span>
          {kind === 'scene' ? (
            <NewDocumentTemplates value={template} onChange={setTemplate} />
          ) : (
            <NewDocumentUiTemplates value={uiTemplate} onChange={setUiTemplate} />
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <span id={folderId} className="text-muted text-xs">
          {t('documents.folderField')}
        </span>
        <FolderPicker
          value={folder}
          onChange={setFolder}
          rootName={projectName}
          labels={{
            columns: t('documents.folderField'),
            empty: t('documents.folderEmpty'),
            newFolder: t('documents.newFolder'),
            newFolderName: t('documents.newFolderName'),
            newFolderLabel: t('documents.newFolderLabel'),
            create: t('documents.create'),
            cancel: t('documents.cancel'),
            folderTaken: t('documents.folderTaken'),
            folderFailed: t('documents.folderFailed'),
          }}
          // Handed to the picker rather than drawn under it: the three buttons belong on one line,
          // and only the picker knows when its own field has taken that line over.
          actions={
            <>
              <Button className="shrink-0" onClick={onCancel}>
                {t('documents.cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="shrink-0"
                disabled={refusal !== null}
              >
                {t('documents.create')}
              </Button>
            </>
          }
        />
      </div>
    </form>
  )
}
