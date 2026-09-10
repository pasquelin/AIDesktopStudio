import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { orElse } from '@shared/promises'
import { roleForKind, type DocumentDescriptor, type DocumentKind } from '@shared/domain/document'
import { checkDocumentName } from '@shared/domain/documentName'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import type { WritableFormat } from '@shared/domain/formatCapability'
import type { DocumentTemplateId, NamedDocumentPlace } from '@shared/domain/newDocument'
import { DEFAULT_SCENE_TEMPLATE, type SceneTemplateId } from '@shared/domain/sceneTemplate'
import { DEFAULT_UI_TEMPLATE, type UiTemplateId } from '@shared/domain/uiTemplates'
import { Button } from '@/components/Button'
import { FolderPicker } from '@/components/FolderPicker/FolderPicker'
import { isComposing } from '@/helpers/composition'
import { getBridge } from '@/services/bridge'
import { useDocuments } from '@/stores/documents'
import { takenDocumentNames, untitledDocumentName } from '@/stores/documentNames'
import { DOCUMENT_NAME_REFUSALS } from '../../documentName'
import { NewDocumentNameField } from './NewDocumentNameField'
import { NewDocumentTemplateField } from './NewDocumentTemplateField'

export type NewDocumentFormProps = {
  kind: DocumentKind
  /** The folder the Explorer pointed at, or `null` to open on this kind's own. */
  picked: string | null
  projectName: string
  /** The documents a tab holds and no file does yet — nowhere on disk for the picker to find. */
  open: readonly DocumentDescriptor[]
  /**
   * A Save as…: the name the field opens on, and the formats to choose between. Absent for a new
   * document, which opens on a free name and has one format per kind to show rather than offer.
   */
  saveAs?: { title: string; formats: readonly WritableFormat[] }
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
  saveAs,
  onCancel,
  onSubmit,
}: NewDocumentFormProps) {
  const { t } = useTranslation()

  const [folder, setFolder] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [format, setFormat] = useState<WritableFormat | null>(saveAs?.formats[0] ?? null)
  const [template, setTemplate] = useState<SceneTemplateId>(DEFAULT_SCENE_TEMPLATE)
  const [uiTemplate, setUiTemplate] = useState<UiTemplateId>(DEFAULT_UI_TEMPLATE)
  const stored = useDocuments(state => state.stored)
  // Pulled out of the object so the effect below depends on the NAME rather than on a prop
  // rebuilt at every render of the window — which would re-seed the field on each keystroke.
  const saveAsName = saveAs?.title ?? null
  const field = useRef<HTMLInputElement>(null)
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
      // The document's OWN name for a Save as…: it is there to be changed, not to be stepped
      // over. Read from the store rather than from the subscription otherwise: a listing arriving
      // later must not re-run this and overwrite a name already being typed.
      const listed = useDocuments.getState().stored
      setDraft(
        saveAsName ??
          untitledDocumentName(
            takenDocumentNames({ documents: {}, stored: [...listed, ...open] }, landing),
            kind,
          ),
      )
    })()
  }, [kind, picked, open, saveAsName])

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
    if (refusal) return
    onSubmit({
      kind,
      title: draft.trim(),
      folder,
      ...templateOf(),
      ...(format ? { format } : {}),
    })
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
      <NewDocumentNameField
        ref={field}
        kind={kind}
        value={draft}
        onChange={setDraft}
        refusalId={refusal ? refusalId : null}
        formats={saveAs?.formats ?? []}
        format={format}
        onFormat={setFormat}
      />

      {refusal && (
        <p id={refusalId} role="alert" className="text-warning m-0 text-xs">
          {t(DOCUMENT_NAME_REFUSALS[refusal])}
        </p>
      )}

      {/* Under the name and above the folder, which is the order the questions come in: what it
          is called, what it holds, where it goes. */}
      <NewDocumentTemplateField
        kind={kind}
        scene={template}
        onScene={setTemplate}
        ui={uiTemplate}
        onUi={setUiTemplate}
      />

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
                {t(saveAs ? 'documents.save' : 'documents.create')}
              </Button>
            </>
          }
        />
      </div>
    </form>
  )
}
