import { memo } from 'react'
import { nameOf } from '@shared/domain/folder'
import { Row } from '@/components/Row'
import type { Command } from '@/engines/core/history'
import { renameNode, setNodeVisible } from '@/engines/scene/commands'
import { iconOf } from '@/engines/scene/nodeFactory'
import type { SceneNode, SceneState } from '@/engines/scene/sceneState'
import { scriptPathOf } from '@/stores/code'
import { useScenes } from '@/stores/scenes'
import { InlineRename } from '@/components/InlineRename'
import { ROW_WRAPPER } from '@/components/styles'
import { VisibilityToggle } from '../VisibilityToggle'

export type SceneNodeRowProps = {
  documentId: string
  node: SceneNode
  /**
   * Accessible name of the eye, which differs per panel. **Absent leaves the row without one** —
   * what the outliner asks for, having pinned its eyes to a column of their own outside the
   * indentation, the way a stack panel is read. `NodeList` has no indentation to be outside of,
   * so its eye stays here on the line.
   */
  visibleLabel?: string
  /** Accessible name of the field the rename opens. Absent leaves the row unrenamable. */
  renameLabel?: string
  /** The name is being typed over. Held by the list: the menu that opens a rename sits there. */
  renaming?: boolean
  /**
   * Both take the node's id, which the row already holds. It costs an argument and buys a
   * callback the list can keep stable across renders — bound per row, they would defeat the memo
   * below on every render of the list, which is the whole of what it is for.
   */
  onRename?: (id: string) => void
  onRenamed?: (id: string) => void
}

/**
 * A scene node as a line, shared by the outliner and the two panels — the three places that
 * must not disagree about what a node looks like or how its eye behaves.
 *
 * Memoized: node identity survives every command that does not touch it, so a selection or an
 * edit elsewhere re-renders one row instead of the whole list.
 */
export const SceneNodeRow = memo(function SceneNodeRow({
  documentId,
  node,
  visibleLabel,
  renameLabel,
  renaming,
  onRename,
  onRenamed,
}: SceneNodeRowProps) {
  const run = (command: Command<SceneState>): void =>
    useScenes.getState().runCommand(documentId, command)
  const script = scriptOn(node)

  if (renaming && renameLabel) {
    return (
      <InlineRename
        value={node.name}
        label={renameLabel}
        onCommit={name => {
          onRenamed?.(node.id)
          if (name !== node.name) run(renameNode(node.id, name))
        }}
      />
    )
  }

  return (
    // On the name alone, as the layer stack does: a double click meant for the chevron or the
    // eye is not a rename.
    <div className={ROW_WRAPPER} onDoubleClick={() => onRename?.(node.id)}>
      <Row
        icon={iconOf(node)}
        title={node.name}
        // What DRIVES it, said on the line, so a reader answers « which script » rather than
        // « one of them ». `ROW_SUFFIX` never shrinks, so the whole line goes in the tooltip:
        // an indented row plus a long file name leaves little of the node's own name.
        suffix={script}
        hint={script && `${node.name} · ${script}`}
        muted={!node.visible}
        leading={
          visibleLabel && (
            <VisibilityToggle
              visible={node.visible}
              label={visibleLabel}
              onToggle={() => run(setNodeVisible(node.id, !node.visible))}
            />
          )
        }
      />
    </div>
  )
})

/**
 * The file a `Script` component names, folders left out — nothing when the node carries none.
 *
 * 🛑 Through `scriptPathOf`: the value is a `script:` REFERENCE, and slicing it on the last `/`
 * showed `script:Walk.ts` whole for anything filed at the root of the project.
 */
function scriptOn(node: SceneNode): string | undefined {
  const held = node.components?.find(one => one.type === 'Script')
  const named = typeof held?.script === 'string' ? held.script : ''
  return named === '' ? undefined : nameOf(scriptPathOf(named))
}
