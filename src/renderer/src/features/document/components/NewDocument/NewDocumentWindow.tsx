import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { creatablesFor } from '@shared/domain/creatable'
import type { DocumentKind } from '@shared/domain/document'
import type { NewDocumentAnswer, NewDocumentAsk } from '@shared/domain/newDocument'
import { WindowShell } from '@/components/WindowShell'
import { getBridge } from '@/services/bridge'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useConnections } from '@/hooks/useConnections'
import { useDocuments } from '@/stores/documents'
import { useFolderRoles } from '@/stores/folderRoles'
import { NewDocumentForm } from './NewDocumentForm'
import { NewDocumentKinds } from './NewDocumentKinds'
import { NewDocumentNoProject } from './NewDocumentNoProject'

/**
 * What to make, what to call it and where it goes. A window rather than a modal: the studio is
 * held on the other end until this answers, and a window that goes away answers `null`.
 *
 * None of the ways into a project acts here — the studio owns leaving one. See `NewDocumentAnswer`.
 */
export function NewDocumentWindow() {
  const { t } = useTranslation()
  useAppliedSettings()
  // For DRAWING alone: the folder picker inks a folder that serves a section the way the explorer
  // does, and this window is its own renderer — the studio's subscription does not reach it.
  useConnections([useFolderRoles(state => state.connect)])

  const [ask, setAsk] = useState<NewDocumentAsk | null>(null)
  const [kind, setKind] = useState<DocumentKind | null>(null)

  useEffect(() => {
    void (async () => {
      const asked = (await getBridge()?.newDocument.request()) ?? null
      if (!asked) return

      // The listing FIRST, and the form only then: what the folders hold is what a typed name is
      // refused against, and a field open over an empty listing accepts a name the disk already
      // holds — which the first save would silently suffix, the one outcome this window exists to
      // prevent. Read here rather than handed over: the picker walks the whole project.
      await useDocuments.getState().relist()

      setAsk(asked)
      // Landing on the likeliest row rather than on a prompt: the caller either named a kind, or
      // the surface it came from puts one first. An empty pane would be a click for everybody.
      setKind(asked.kind ?? creatablesFor(asked.surface)[0]?.kind ?? null)
    })()
  }, [])

  /**
   * The main process is what closes this window, so a refused answer leaves it standing — and
   * standing is the right fallback: closing it by hand says exactly what Cancel says.
   */
  const settle = (given: NewDocumentAnswer | null): void => {
    void getBridge()
      ?.newDocument.answer(given)
      .catch(() => {})
  }

  useEffect(() => {
    /** Escape closes the window the way its close button does: nothing is made. */
    const onKeyDown = (event: KeyboardEvent): void => {
      // On the window rather than on the form: the column takes focus too, and Escape pressed
      // there used to reach nothing at all. `isComposing` is an input method's own candidate.
      if (event.key === 'Escape' && !event.isComposing) settle(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Nothing was asked — a window restored by the system, or one whose question has been settled.
  if (!ask) return <WindowShell title={t('documents.new')}>{null}</WindowShell>

  const project = ask.projectName

  if (ask.purpose === 'externalFiles') {
    return (
      <WindowShell title={t('documents.importFiles')}>
        <NewDocumentNoProject
          recent={ask.recentProjects}
          title={t('documents.importProjectTitle')}
          body={t('documents.importProjectBody')}
          onNewProject={() => settle({ answer: 'newProject' })}
          onOpenProject={() => settle({ answer: 'openProject' })}
          onOpenRecent={path => settle({ answer: 'recentProject', path })}
        />
      </WindowShell>
    )
  }

  return (
    <WindowShell
      title={t('documents.new')}
      navLabel={t('documents.newKinds')}
      nav={
        <NewDocumentKinds
          creatables={creatablesFor(ask.surface)}
          selected={kind}
          hasProject={project !== null}
          onSelect={setKind}
          onNewProject={() => settle({ answer: 'newProject' })}
        />
      }
    >
      {project === null ? (
        <NewDocumentNoProject
          recent={ask.recentProjects}
          onNewProject={() => settle({ answer: 'newProject' })}
          onOpenProject={() => settle({ answer: 'openProject' })}
          onOpenRecent={path => settle({ answer: 'recentProject', path })}
        />
      ) : (
        kind && (
          <div className="flex h-full flex-col">
            <h2 className="mb-4 text-base font-semibold">{t(`documents.newByKind.${kind}`)}</h2>
            {/* Remounted per kind: the suggested name and the starting folder are read once, and
                reconciling them would leave a name typed for another kind in the field. */}
            <NewDocumentForm
              key={kind}
              kind={kind}
              picked={ask.picked}
              projectName={project}
              open={ask.open}
              onCancel={() => settle(null)}
              onSubmit={place => settle({ answer: 'made', place })}
            />
          </div>
        )
      )}
    </WindowShell>
  )
}
