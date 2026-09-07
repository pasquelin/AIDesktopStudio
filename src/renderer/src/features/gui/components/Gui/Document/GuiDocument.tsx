import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommandId } from '@shared/domain/command'
import { runGuiDocumentCommand } from './guiDocumentCommands'
import { UI_RESOLUTIONS, isUiResolutionId, uiResolutionOf } from '@shared/domain/uiResolution'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useDocumentIsInFront } from '@/stores/documents'
import { guiOf, isGuiDirty, useGuis } from '@/stores/gui'
import { GuiStage } from '../GuiStage'
import {
  addUiElementOfType,
  duplicateSelectedUi,
  groupSelectedUi,
  lockSelectedUi,
  removeSelectedUi,
} from './guiEdits'
import { GUI_ADD_TOOL, GUI_RESOLUTION_TOOL, GUI_TOOLS, type GuiActionId } from '../guiTools'
import { fitGuiToPanel, guiToActualSize, setGuiResolution, zoomGuiIn, zoomGuiOut } from '../guiView'

/**
 * What each button of the bar does. A `Record` over the closed list, so a tool added to
 * `GUI_TOOLS` does not compile until it says what pressing it means.
 */
const ACTS: Record<GuiActionId, (documentId: string) => void> = {
  'gui.duplicate': duplicateSelectedUi,
  'gui.group': groupSelectedUi,
  'gui.delete': removeSelectedUi,
  'gui.lock': lockSelectedUi,
  'gui.zoomIn': zoomGuiIn,
  'gui.zoomOut': zoomGuiOut,
  'gui.fit': fitGuiToPanel,
  'gui.actual': guiToActualSize,
}

/**
 * A game interface, open for editing.
 *
 * The scope is `gui` and not the space's: the 3D space opens two kinds now, so ⌘Z here must not
 * reach the scene's history — `scopeOfDocument` says which, and this is the other half of it.
 *
 * 🛑 It subscribes to `design` and to nothing else. The selection changes on every click of the
 * stage and of the outliner, and reading it here would re-render the whole bar on each one.
 */
export function GuiDocument({ documentId }: { documentId: string }) {
  const { t } = useTranslation()
  const active = useDocumentIsInFront(documentId)
  const design = useGuis(state => guiOf(state, documentId).document.design)

  useDocumentTitle(
    documentId,
    useGuis(state => isGuiDirty(state, documentId)),
  )

  useRestoredDocument(documentId)

  const onCommand = useCallback(
    (command: CommandId): boolean => runGuiDocumentCommand(documentId, command),
    [documentId],
  )

  useShortcuts({ scope: 'gui', enabled: active, documentId, onCommand })

  const onMode = (toolId: string, modeId: string): void => {
    if (toolId === GUI_ADD_TOOL) return addUiElementOfType(documentId, modeId)
    if (toolId !== GUI_RESOLUTION_TOOL || !isUiResolutionId(modeId)) return

    // `free` measures nothing: it is what a document already at an unnamed size IS, not a size
    // to go to, so choosing it leaves the canvas where it stands.
    const size = UI_RESOLUTIONS[modeId]
    if (size) setGuiResolution(documentId, size)
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <Toolbar
        // The canvas the document is composed for is a CHOICE among the presets, so the bar shows
        // which one is standing rather than opening on whatever comes first.
        tools={GUI_TOOLS.map(tool =>
          tool.id === GUI_RESOLUTION_TOOL ? { ...tool, activeMode: uiResolutionOf(design) } : tool,
        )}
        label={t('gui.tools')}
        onTool={id => actionOf(id)?.(documentId)}
        onMode={onMode}
      />
      <GuiStage documentId={documentId} />
    </div>
  )
}

/** The bar answers with a bare string; only the ids that ACT have something to run. */
const actionOf = (id: string): ((documentId: string) => void) | undefined =>
  Object.hasOwn(ACTS, id) ? ACTS[id as GuiActionId] : undefined
