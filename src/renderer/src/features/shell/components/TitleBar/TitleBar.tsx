import { mdiArrowLeft, mdiArrowRight, mdiHomeOutline } from '@mdi/js'
import { useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CLICKABLE, DRAGGABLE } from '@/helpers/appRegion'
import { cn } from '@/helpers/cn'
import { showContextMenu } from '@/helpers/contextMenu'
import { useWindowState } from '@/hooks/useWindowState'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import {
  canMoveWorkspace,
  isWorkspaceId,
  movedWorkspace,
  type WorkspaceId,
  type WorkspaceMove,
} from '@shared/domain/workspace'
import { applyWorkspaceMove } from '@/helpers/applyWorkspaceMove'
import { workspaceLabelKey } from '@/helpers/workspaces'
import { useSettings } from '@/stores/settings'
import { SPACES } from './spaces'
import { TitleBarButton } from './TitleBarButton'

export type TitleBarProps = {
  activeWorkspace: WorkspaceId
  onWorkspace: (workspace: WorkspaceId) => void
  /** Whether the home is the surface in front. Absent when the setting turned it off. */
  home?: boolean
  /** Absent hides the home button altogether — the setting is off, so it leads nowhere. */
  onHome?: () => void
  /** Global actions aligned right: search, run, account. */
  actions?: ReactNode
}

/**
 * Custom chrome: traffic lights stay native (`titleBarStyle: 'hiddenInset'`) and the bar
 * carries the workspaces. We reclaim a title bar's worth of height, and the application does
 * not look like a web page in a frame.
 */
export function TitleBar({
  activeWorkspace,
  onWorkspace,
  home = false,
  onHome,
  actions,
}: TitleBarProps) {
  const { t } = useTranslation()
  const { fullScreen } = useWindowState()
  const workspaces = useWorkspaces()

  // The dragged id rides on the drag itself, which is what lets a target ask `carries` first.
  // It is kept here as well for one thing only: the platform forbids reading it before the drop,
  // and without it the pill being dragged would light itself up as somewhere it could land.
  const [drag, setDrag] = useState<{ from: WorkspaceId; over: WorkspaceId | null } | null>(null)

  const [announcement, setAnnouncement] = useState('')

  const order = workspaces.map(workspace => workspace.id)

  const announce = (next: readonly WorkspaceId[], moved: WorkspaceId): void =>
    setAnnouncement(
      t('workspaces.moved', {
        label: t(workspaceLabelKey(moved)),
        position: next.indexOf(moved) + 1,
        total: next.length,
      }),
    )

  const apply = (next: readonly WorkspaceId[], moved: WorkspaceId): void => {
    void useSettings.getState().write({ workspaces: { order: [...next] } })
    announce(next, moved)
  }

  // What the same reordering looks like without a drag: the keyboard's, the menu's, and a
  // command's — which is why the refusal and the write live in `applyWorkspaceMove` rather than
  // here. Only the sentence a screen reader hears belongs to this bar.
  const step = (id: WorkspaceId, move: WorkspaceMove): void => {
    const next = applyWorkspaceMove(id, move)
    if (next) announce(next, id)
  }

  // The two moves as a menu, which is the third way to reorder: the drag, the keyboard, this.
  const openMenu = (id: WorkspaceId): void => {
    void showContextMenu([
      {
        label: t('workspaces.moveLeft'),
        icon: mdiArrowLeft,
        tooltip: t('workspaces.moveLeftHint'),
        disabled: !canMoveWorkspace(order, id, 'left'),
        onSelect: () => step(id, 'left'),
      },
      {
        label: t('workspaces.moveRight'),
        icon: mdiArrowRight,
        tooltip: t('workspaces.moveRightHint'),
        disabled: !canMoveWorkspace(order, id, 'right'),
        onSelect: () => step(id, 'right'),
      },
    ])
  }

  const drop = (event: DragEvent, onto: WorkspaceId): void => {
    setDrag(null)
    const dragged = SPACES.idFrom(event)
    if (!dragged || !isWorkspaceId(dragged) || dragged === onto) return

    apply(movedWorkspace(order, dragged, onto), dragged)
  }

  return (
    <header
      style={DRAGGABLE}
      className={cn(
        // The gauge and no padding of its own: `pt-2 pb-1` around the pills put them 2px under
        // the traffic lights, and every other window's title 2px above — measured.
        'text-body flex h-(--sc-title-bar) shrink-0 items-center gap-2 pr-6',
        // The left inset only exists to clear the native traffic lights. macOS removes them
        // in full screen: without this switch, a 96 px gap would remain.
        fullScreen ? 'pl-1.5' : 'pl-24',
      )}
    >
      <nav
        aria-label={t('workspaces.navigation')}
        style={CLICKABLE}
        // The row that gives ground. The actions at the other end are the only way to switch key
        // or project from the chrome, and nothing here scrolls: at the window's minimum width,
        // with the text scale raised, the pills would otherwise push them off the edge.
        className="flex min-w-0 items-center gap-2 overflow-hidden"
      >
        {onHome && (
          <TitleBarButton
            icon={mdiHomeOutline}
            label={t('home.title')}
            current={home}
            onClick={onHome}
          />
        )}

        {workspaces.map(workspace => (
          <TitleBarButton
            key={workspace.id}
            icon={workspace.icon}
            label={t(workspaceLabelKey(workspace.id))}
            // The home covers the spaces rather than being one of them: while it is up, none
            // of them is the page being read.
            current={!home && workspace.id === activeWorkspace}
            onClick={() => onWorkspace(workspace.id)}
            reorder={{
              over: drag?.over === workspace.id && drag.from !== workspace.id,
              onStart: event => {
                SPACES.start(event, workspace.id)
                setDrag({ from: workspace.id, over: null })
              },
              onOver: () => setDrag(current => current && { ...current, over: workspace.id }),
              onLeave: () =>
                setDrag(current =>
                  current?.over === workspace.id ? { ...current, over: null } : current,
                ),
              onDrop: event => drop(event, workspace.id),
              onEnd: () => setDrag(null),
              onStep: move => step(workspace.id, move),
              onMenu: () => openMenu(workspace.id),
            }}
          />
        ))}
      </nav>

      {/* The order changes under a focus that does not move and a label that does not change:
          without this the gesture succeeds in silence for anyone reading rather than looking. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {actions !== undefined && (
        <div style={CLICKABLE} className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  )
}
