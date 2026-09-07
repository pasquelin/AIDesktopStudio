import { memo } from 'react'
import { InlineRename } from '@/components/InlineRename'
import { ROW_WRAPPER } from '@/components/styles'
import { renameTerrain, renameTerrainEdit } from '@/engines/scene/reliefCommands'
import { renameScatter } from '@/engines/scene/scatterCommands'
import { useScenes } from '@/stores/scenes'
import type { WorldNode } from './worldNodes'
import { type WorldRowLabels, type WorldRowProps } from './WorldRowLocks'
import { WorldRowTitle } from './WorldRowTitle'

export type { WorldRowLabels, WorldRowProps }

export const WorldRow = memo(function WorldRow(props: WorldRowProps) {
  const name = nameOf(props.node)
  return (
    <div className={ROW_WRAPPER} onDoubleClick={props.onRename}>
      {props.renaming ? (
        <InlineRename
          value={name}
          label={props.labels.rename}
          onCommit={next => renameNode(props, name, next)}
        />
      ) : (
        <WorldRowTitle name={name} {...props} />
      )}
    </div>
  )
})

function nameOf(node: WorldNode): string {
  return node.edit?.name ?? node.scatter?.name ?? node.terrain?.name ?? ''
}

function renameNode(props: WorldRowProps, name: string, next: string): void {
  props.onRenamed()
  if (next === name) return
  const run = useScenes.getState().runCommand
  const { documentId, node } = props
  if (node.edit && node.terrain) {
    run(documentId, renameTerrainEdit(node.terrain.id, node.edit.id, next))
    return
  }
  if (node.scatter) run(documentId, renameScatter(node.scatter.id, next))
  else if (node.terrain) run(documentId, renameTerrain(node.terrain.id, next))
}
