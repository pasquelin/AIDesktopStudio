import { DockviewReact, type DockviewReadyEvent } from 'dockview-react'
import { useCallback } from 'react'
import { ASSET_TYPES, type Asset } from '@shared/domain/asset'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { reportFailure } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import { homeIsVisible, useLayouts } from '@/stores/layouts'
import { DocumentOverflow } from './DocumentOverflow'
import { DocumentTab } from './Tab/DocumentTab'
import { DOCUMENT_COMPONENTS } from '../documents'
import { FILE_VIEW_COMPONENTS } from '../fileViewComponents'
import { DocumentsIdle } from '../Documents/DocumentsIdle'
import { setDockviewApi } from '../dockviewApi'

/**
 * Imported at the drop rather than at the top, and the guard in `eager-graph.test.ts` is what
 * says why: `openAsset` reaches `ASSET_INTENTS`, which names every editor's destination — so a
 * static import pulled four files out of `spaces/` into the chunk the first screen loads, for a
 * gesture that may never happen. A drop is a human action; the module arrives well before the
 * hand has let go.
 */
const openDropped = (asset: Asset): void => {
  void import('@/helpers/openAsset').then(module => module.openAsset(asset))
}

/**
 * What the tab in front makes true everywhere else: the tool windows read the document, and the
 * rail reads its section.
 *
 * The section is set only when a document is actually in front. An emptied centre keeps the
 * docks it had — there is no section a blank middle belongs to, and swapping the whole periphery
 * for having closed the last tab is a screen the user did not ask for.
 */
function followFront(id: string | null): void {
  const documents = useDocuments.getState()
  documents.activate(id)

  // Nothing said while the home is up, and it is not belt and braces: `setActiveWorkspace` also
  // LEAVES the home, so a tab announced while Dockview is being torn down — which is exactly
  // what raising the home does to it — would reopen the studio over the home the user just asked
  // for. The centre is only ever on screen when the home is not.
  if (homeIsVisible()) return

  const workspace = id === null ? undefined : documents.documents[id]?.workspace
  if (workspace) useLayouts.getState().setActiveWorkspace(workspace)
}

/**
 * ONE Dockview for the whole studio, keyed by the project alone.
 *
 * Every document is a tab here whatever section it belongs to, so a scene and an image can sit
 * side by side — and the SECTION follows the tab in front rather than deciding what the centre
 * holds. What the section still decides is the docks around it.
 *
 * Keyed by the project because Dockview holds its panels itself: dropping the stored layout of
 * the project being left would otherwise leave its tabs on screen — then persist them again,
 * under the project that never had them, on the first layout change.
 */
export function DocumentArea() {
  const projectPath = useLayouts(state => state.projectPath)

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const stored = useLayouts.getState().layout
      if (stored) {
        try {
          event.api.fromJSON(stored)
        } catch (error) {
          // Dockview rethrows a layout it refuses from inside its own mount effect, where an
          // uncaught throw would take the window down on every launch. Forgotten, not kept:
          // nothing reloads it afterwards, so a kept one would fail again at every launch.
          reportFailure('shell.layout', projectPath ?? '', error)
          useLayouts.getState().forget()
        }
      }

      // AFTER the stored layout is restored, never before: handing the api over drains the
      // documents that were waiting for a centre, and `fromJSON` clears the panels it did not
      // name — a document opened from the home would be added and then thrown away.
      setDockviewApi(event.api)

      event.api.onDidLayoutChange(() => {
        useLayouts.getState().remember(event.api.toJSON())
      })

      // Tool windows live outside Dockview: without this, a layer stack on the edge has no way
      // of knowing which tab it is looking at. And the section follows the same event — that is
      // what makes clicking a 3D tab put the 3D docks up.
      followFront(event.api.activePanel?.id ?? null)
      event.api.onDidActivePanelChange(change => followFront(change.panel?.id ?? null))
    },
    [projectPath],
  )

  /**
   * The one place a dropped asset is OPENED, and the last surface to see the drop.
   *
   * Every other target in the studio answers a different question — which channel of a material,
   * which track and at what time, where on the graph — and each needs the pointer in its own
   * frame. That is why the platform attaches a drop to an element rather than to the document,
   * and it is what cannot be centralised.
   *
   * What can, and is here, is the FALLBACK: a target that handles a drop consumes it, so
   * anything still reaching this one is a drop nobody wanted — the empty middle, the ruler of a
   * timeline, a document that refuses the kind. It opens the asset in its own space, which is
   * what an editor does with a file dropped on it.
   *
   * Mounted whether or not a tab is open, and that is the point: "only when nothing is open"
   * was a second rule for the same gesture, and it answered a drop beside an open document with
   * nothing at all.
   */
  return (
    <AssetDropTarget
      accepts={ASSET_TYPES}
      onDrop={openDropped}
      // No frame: this surface is the whole middle of the window, so outlining it says nothing
      // the user cannot already see. The pointer carries the answer instead — see `outlined`.
      outlined={false}
      className="size-full"
    >
      <DockviewReact
        key={projectPath ?? ''}
        components={PANEL_COMPONENTS}
        // Every tab, not a per-panel choice: closing a document has to ask about unsaved work
        // whichever space opened it.
        defaultTabComponent={DocumentTab}
        // Dockview's own overflow dropdown, off: it mounts outside `.dv-dockview`, where the
        // studio's tokens are scoped, so it drew in the library's default navy. `DocumentOverflow`
        // replaces it with the studio's own menu.
        disableTabsOverflowList
        rightHeaderActionsComponent={DocumentOverflow}
        // What Dockview shows while no group is visible, and takes down on the first one. The
        // middle of the window was a bare `dv-watermark` div until this — the largest surface of
        // the studio, saying nothing.
        watermarkComponent={DocumentsIdle}
        onReady={onReady}
      />
    </AssetDropTarget>
  )
}

const PANEL_COMPONENTS = { ...DOCUMENT_COMPONENTS, ...FILE_VIEW_COMPONENTS }
