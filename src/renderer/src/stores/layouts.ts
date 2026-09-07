import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_WORKSPACE, type WorkspaceId } from '@shared/domain/workspace'
import { HOME_SURFACE, type ToolSurface } from '@shared/domain/tool'
import { withoutPanels } from './layoutPrune'
import type { SerializedLayout } from './serializedLayout'
import { useSettings } from './settings'

type LayoutsState = {
  activeWorkspace: WorkspaceId
  /**
   * Whether the home covers the studio. Session state, never persisted — the home is where a
   * launch starts, and remembering that it was closed two days ago would make the entry point
   * something a user has to find again.
   *
   * Not a `WorkspaceId` of its own: that union drives the tool placements, the document kinds and
   * the native menu, and a workspace that opens no document would be a fiction all three have
   * to guard against.
   */
  home: boolean
  /** `null` before the centre has ever reported an arrangement, and after one is dropped. */
  layout: SerializedLayout | null
  /** The project this layout arranges. A layout is a set of open documents, so it follows one. */
  projectPath: string | null
  setActiveWorkspace: (workspace: WorkspaceId) => void
  setHome: (home: boolean) => void
  remember: (layout: SerializedLayout) => void
  forget: () => void
  /**
   * Takes those panels out of the layout — the tabs of documents the window can no longer open.
   * A layout left with none is forgotten rather than kept as an empty one.
   */
  prune: (panels: ReadonlySet<string>) => void
  /** Keeps the arrangement when the same project comes back, drops it for another one. */
  adopt: (projectPath: string | null) => void
}

/**
 * ONE layout for the whole studio, and it belongs to ONE project: a panel is a document open,
 * and the documents live in the project folder. Kept across a change of project, the tabs of
 * the previous one came back over a folder that has none of them.
 *
 * One rather than one per workspace, and that is the whole point of the centre: a scene and an
 * image share a tab strip, so they share the arrangement that holds them. The section a document
 * belongs to still drives the DOCKS around it — that is `activeWorkspace`, which the tab in
 * front now sets.
 */
export const useLayouts = create<LayoutsState>()(
  persist(
    (set, get) => ({
      activeWorkspace: DEFAULT_WORKSPACE,
      home: true,
      layout: null,
      projectPath: null,
      // The native menu follows this through `useNativeMenu`, which subscribes: what it may
      // offer depends on more than the space, so the space alone is not what gets published.
      // Choosing a space leaves the home: that is what a click on one of them asks for.
      // Guarded, and by an early return rather than by an empty `set`: zustand notifies on every
      // call whatever the updater answers, and the centre now announces the tab in front on every
      // click — most of which stay inside one section.
      setActiveWorkspace: workspace => {
        const state = get()
        if (state.activeWorkspace === workspace && !state.home) return
        set({ activeWorkspace: workspace, home: false })
      },
      setHome: home => set({ home }),
      remember: layout => set({ layout }),
      forget: () => set({ layout: null }),

      prune: panels =>
        set(state => {
          const layout = state.layout
          // Asked before rewriting: `withoutPanels` always answers with a new object, and a
          // layout replaced by an equal one is a write to `localStorage` per launch.
          if (!layout || !Object.keys(layout.panels).some(id => panels.has(id))) return {}

          return { layout: withoutPanels(layout, panels) }
        }),

      adopt: projectPath =>
        set(state => (state.projectPath === projectPath ? {} : { projectPath, layout: null })),
    }),
    {
      name: 'ai-desktop-studio:layouts',
      // `home` stays out: see the field. Everything else is arrangement, which is the point.
      partialize: ({ activeWorkspace, layout, projectPath }) => ({
        activeWorkspace,
        layout,
        projectPath,
      }),
      // Bumped whenever a stored layout stops being one this build can restore: a major
      // Dockview release, or a `DocumentKind` renamed or dropped — Dockview throws on a layout
      // naming a component it cannot find. Dropped rather than migrated, per the type above.
      //
      // 2: the graph space went, and `activeWorkspace` is persisted. Restored verbatim, a
      // session last left in it hands `'graph'` to `workspaceById`, which throws on an id no
      // build declares — during render, in the shell, the generator and the models panel alike.
      //
      // 3: the six layouts became one. A stored `layouts` map is not a layout, and handing it to
      // `fromJSON` throws — so the session that upgrades reopens its documents from the folder.
      version: 3,
      migrate: () => undefined,
    },
  ),
)

/**
 * Whether the home is the surface in front: the session flag AND the setting that allows it.
 *
 * One answer, in one place, because three readers ask — the shell, the title bar and the native
 * menu — and they were each combining the two halves themselves. The menu had stopped: `home`
 * starts `true` on every launch, so a studio whose home is turned off published its menu as if
 * the home were up, while the docks were on screen.
 */
export function homeIsVisible(): boolean {
  return useLayouts.getState().home && useSettings.getState().settings.home.enabled
}

/** The same answer, subscribed. */
export function useHomeVisible(): boolean {
  const home = useLayouts(state => state.home)
  const enabled = useSettings(state => state.settings.home.enabled)
  return home && enabled
}

/**
 * Which surface the panels answer to. Every question about what may be open — the rails, the
 * zones, the native menu — asks this rather than the workspace: the home carries panels of its
 * own, and reading `activeWorkspace` there would offer the ones of the space behind it.
 */
export function toolSurface(): ToolSurface {
  return homeIsVisible() ? HOME_SURFACE : useLayouts.getState().activeWorkspace
}

/** The same answer, subscribed. */
export function useToolSurface(): ToolSurface {
  const home = useHomeVisible()
  const workspace = useLayouts(state => state.activeWorkspace)
  return home ? HOME_SURFACE : workspace
}
