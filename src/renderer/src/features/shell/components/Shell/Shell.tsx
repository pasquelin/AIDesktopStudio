import { useEffect, useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Panel, Panels } from '@pasquelin/panels'
import '@pasquelin/panels/styles.css'
import { TooltipHost } from '@/components/TooltipHost'
import { useHomeVisible, useLayouts, useToolSurface } from '@/stores/layouts'
import { useSettings } from '@/stores/settings'
import { HomeView } from '@/features/home/components/HomeView/HomeView'
import { DocumentArea } from '../Document/DocumentArea'
import { AssetPicker } from '../AssetPicker/AssetPicker'
import { showWorkspace } from '../dockviewApi'
import { guardUnsavedWork } from '../../unsavedGuard'
import { useAutosave } from '@/hooks/useAutosave'
import { useGitWatch } from '@/hooks/useGitWatch'
import { holdConfirmer } from '@/features/assistant/holdConfirmer'
import { AssistantStatus } from '@/features/assistant/components/Assistant/AssistantStatus'
import { AssistantToast } from '@/features/assistant/components/Assistant/Toast/AssistantToast'
import { DictationStatus } from '@/features/dictation/components/Dictation/Status/DictationStatus'
import { Breadcrumb } from '../Breadcrumb'
import { Footer } from '../Footer'
import { ActivityStatus } from '../Activity/ActivityStatus'
import { ActivityToasts } from '../Activity/ActivityToasts'
import { TasksStatus } from '../TasksStatus'
import { JobsStatus } from '../JobsStatus'
import { UpdateStatus } from '../UpdateStatus'
import { RailNewButton } from '../RailNewButton'
import { AccountSelect } from '../AccountSelect'
import { ProjectSelect } from '../ProjectSelect'
import { TitleBar } from '../TitleBar/TitleBar'
import { UiIcon } from '@/components/UiIcon'
import { hasActions } from '../toolComponents'
import { toolIcon, toolTitleKey } from '@/helpers/toolRegistry'
import { panelSpecsOf } from '../../panelSpecs'
import { LAYOUT_KEY, layoutStorage } from '../../layoutStorage'
import { DEFAULT_OPEN } from '../../defaultOpen'
import { useToolState } from '@/hooks/useToolState'
import { familyOf, type ToolId } from '@shared/domain/tool'
import { panelsStore } from '@/stores/panels'
import { ShellPanelActions } from './ShellPanelActions'
import { ShellPanelBody } from './ShellPanelBody'
import {
  carriesExternalFiles,
  externalFileDropTone,
  offerExternalFiles,
  queueExternalFiles,
} from '@/services/externalFiles'
import { copiesDropTone } from '@/helpers/drag'
import { ShellPanelButton } from './ShellPanelButton'
import 'dockview-react/dist/styles/dockview.css'
import '../dockview-theme.css'

/** Read once by the chassis, so the buttons it draws never change identity. */
const COMPONENTS = { IconButton: ShellPanelButton }

/** Stable for the store's lifetime: a new identity here would re-render the whole centre. */
const dropFocus = (): void => panelsStore.getState().focus(null)

/**
 * One element per panel, held. 🛑 A glyph rebuilt in the render is a NEW element every time, and
 * the chassis compares the declaration field by field to know whether anything moved: written
 * inline, every render of the shell rewrote the whole registry — measured at 5 for 5.
 */
const ICONS = new Map<ToolId, ReactElement>()

function iconOf(id: ToolId): ReactElement {
  const held = ICONS.get(id)
  if (held) return held

  const made = <UiIcon path={toolIcon(id)} size={22} />
  ICONS.set(id, made)
  return made
}

/**
 * Assembles the studio: `@pasquelin/panels` draws the frame — icon rails on the edges, rounded
 * panels over the gutter, five resizable zones — and the studio says WHAT hangs where.
 *
 * The centre takes ONLY documents: an open file and its toolbar. Tool windows live on the edges
 * and never enter it.
 *
 * A panel the surface cannot offer is a panel NOT DECLARED: the half it held falls back to what
 * this surface does declare, and takes it back when the panel returns.
 */
export function Shell() {
  useEffect(() => {
    const allowFileDrop = (event: DragEvent): void => {
      if (!carriesExternalFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) {
        const tone = externalFileDropTone(event)
        event.dataTransfer.dropEffect = copiesDropTone(tone) ? 'copy' : 'none'
      }
    }
    const takeFileDrop = async (event: DragEvent): Promise<void> => {
      if (event.defaultPrevented && event.cancelBubble) return
      // Only a file drop is ours. Cancelled unconditionally, a text selection dragged into the
      // composer or a textarea was never inserted — the listener sits above the whole tree.
      if (!carriesExternalFiles(event)) return
      event.preventDefault()
      const offer = await offerExternalFiles(event.dataTransfer?.files)
      if (offer) queueExternalFiles([offer])
    }
    const handleFileDrop = (event: DragEvent): void => {
      void takeFileDrop(event)
    }

    window.addEventListener('dragover', allowFileDrop)
    window.addEventListener('drop', handleFileDrop)
    return () => {
      window.removeEventListener('dragover', allowFileDrop)
      window.removeEventListener('drop', handleFileDrop)
    }
  }, [])
  const { t } = useTranslation()
  const activeWorkspace = useLayouts(state => state.activeWorkspace)
  const setHome = useLayouts(state => state.setHome)

  // The window is the one that holds documents, so it is the one that must not go quietly.
  useEffect(() => guardUnsavedWork(window), [])

  // The window's confirmer: it outlives either host of the conversation, and brings one up.
  useEffect(holdConfirmer, [])
  useAutosave()

  // Here rather than in the two panels that draw it: whether git holds the folder decides whether
  // the band offers the history at all, so the answer has to exist while both are closed. The
  // WATCH and not `useGitStatus` — the root subscribed to the status redraws the whole window
  // every time a file the studio itself wrote changed it.
  useGitWatch()

  const homeEnabled = useSettings(state => state.settings.home.enabled)
  // The setting wins over the session: turning the home off must take it off the screen it is
  // currently on, not at the next launch.
  const home = useHomeVisible()

  const surface = useToolSurface()
  const state = useToolState()
  // The SAME mapping the bench declares from, so a headless run and the window can never
  // disagree about which panels a surface offers, nor about what they are called.
  const specs = useMemo(
    () => panelSpecsOf(surface, state, id => t(toolTitleKey(id))),
    [surface, state, t],
  )
  // Written inline, a new object every render invalidated every zone's memoisation.
  const labels = useMemo(
    () => ({
      closePanel: t('actions.removeTool'),
      resizeZone: t('actions.resizeZone'),
      resizeSplit: t('actions.resizeSplit'),
      resizeBand: t('actions.resizeBand'),
    }),
    [t],
  )

  return (
    <Panels
      store={panelsStore}
      // The FAMILY, not the surface: the six spaces share one arrangement — a shelf opened in
      // Image is still there in Video — and the home shares with none, its left column holding
      // the projects where a space holds generation.
      view={familyOf(surface)}
      // The SURFACE where the view is the family: the rails are arranged per SECTION. Left out,
      // placement follows `view`, and one panel dragged in Image reorders the rail of all six
      // spaces — what is OPEN stays shared, which is the whole point of the family above.
      placementScope={surface}
      draggablePanels
      components={COMPONENTS}
      // The studio's own key, read through the twenty versions `zustand/persist` wrote under it.
      storage={layoutStorage}
      storageKey={LAYOUT_KEY}
      // The halves the studio opens on, which are not "whatever is declared right now".
      defaultOpen={DEFAULT_OPEN[familyOf(surface)]}
      railHeader={<RailNewButton />}
      labels={labels}
      className="min-h-0 flex-1"
      header={
        <TitleBar
          activeWorkspace={activeWorkspace}
          // `showWorkspace` and not the store's setter: choosing a section also brings its last
          // tab forward, now that the centre holds every section's tabs at once.
          onWorkspace={showWorkspace}
          home={home}
          onHome={homeEnabled ? () => setHome(true) : undefined}
          // Local then remote: the folder everything is written into, then the key it is
          // generated on. The pair is the studio's "where am I" in one corner.
          actions={
            <>
              <ProjectSelect />
              <AccountSelect />
            </>
          }
        />
      }
      footer={
        <Footer
          left={<Breadcrumb />}
          right={
            <>
              {/* First of the indicators: a live microphone outranks a download. The assistant
                  follows it, because the two are read as one sentence — what is being heard,
                  then what became of it. */}
              <DictationStatus />
              <AssistantStatus />
              <UpdateStatus />
              <JobsStatus />
              {/* After the generations: both are work in flight, and what the studio is writing
                  out is nearer to being finished than what it is still asking the API for. */}
              <TasksStatus />
              <ActivityStatus />
            </>
          }
        />
      }
    >
      {specs.map(spec => (
        <Panel
          key={spec.id}
          {...spec}
          icon={iconOf(spec.id)}
          // 🛑 `undefined` for a panel that publishes none, never an element that renders null:
          // the chassis reads the PRESENCE of this prop to draw the header's separator and to
          // give the row's free width to the actions. Always passed, every panel wore a divider
          // in front of its close button, and every band panel took the width the montage asks
          // for.
          actions={hasActions(spec.id) ? <ShellPanelActions tool={spec.id} /> : undefined}
        >
          <ShellPanelBody tool={spec.id} />
        </Panel>
      ))}

      <Panels.Center>
        {/* The centre takes the accent OFF the rail: an icon left lit while the reader is back
            in the document says a column has the focus when the canvas does. */}
        <div className="size-full" onPointerDownCapture={dropFocus}>
          {home ? <HomeView /> : <DocumentArea />}
        </div>
      </Panels.Center>

      <ActivityToasts />
      <AssistantToast />
      {/* The window a slot browses the whole project from. Mounted here rather than by the
          inspector: a panel that happened to be closed would leave the browse button with
          nobody to ask. */}
      <AssetPicker />
      <TooltipHost />
    </Panels>
  )
}
