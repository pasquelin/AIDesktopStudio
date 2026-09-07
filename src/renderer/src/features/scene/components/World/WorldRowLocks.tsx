import { mdiLockOpenVariantOutline, mdiLockOutline } from '@mdi/js'
import { MenuRow } from '@/components/MenuRow'
import { HINT_RIGHT } from '@/helpers/tooltip'
import { setTerrainEditLocked, setTerrainLocked } from '@/engines/scene/reliefCommands'
import { setScatterLocked } from '@/engines/scene/scatterCommands'
import { useScenes } from '@/stores/scenes'
import type { WorldNode } from './worldNodes'

export type WorldRowLabels = {
  rename: string
  locks: string
  locksHint: string
  lockSculpt: string
  lockSculptHint: string
  lockPlacement: string
  lockPlacementHint: string
  lockEdit: string
  lockEditHint: string
}

export type WorldRowProps = {
  documentId: string
  node: WorldNode
  labels: WorldRowLabels
  renaming: boolean
  onRename: () => void
  onRenamed: () => void
}

export function WorldRowLocks({
  documentId,
  node,
  labels,
}: {
  documentId: string
  node: WorldNode
  labels: WorldRowLabels
}) {
  const run = useScenes.getState().runCommand
  const scatter = node.scatter
  const terrain = node.terrain
  const edit = node.edit
  if (edit && terrain) {
    return (
      <MenuRow
        label={labels.lockEdit}
        icon={edit.locked ? mdiLockOutline : mdiLockOpenVariantOutline}
        checked={edit.locked}
        tick="on-off"
        tip={HINT_RIGHT(labels.lockEditHint)}
        onSelect={() => run(documentId, setTerrainEditLocked(terrain.id, edit.id, !edit.locked))}
      />
    )
  }
  if (scatter) {
    return (
      <MenuRow
        label={labels.lockEdit}
        icon={scatter.locked ? mdiLockOutline : mdiLockOpenVariantOutline}
        checked={scatter.locked}
        tick="on-off"
        tip={HINT_RIGHT(labels.lockEditHint)}
        onSelect={() => run(documentId, setScatterLocked(scatter.id, !scatter.locked))}
      />
    )
  }
  if (!terrain) return null
  return (
    <>
      <MenuRow
        label={labels.lockSculpt}
        icon={terrain.locked.sculpt ? mdiLockOutline : mdiLockOpenVariantOutline}
        checked={terrain.locked.sculpt}
        tick="on-off"
        tip={HINT_RIGHT(labels.lockSculptHint)}
        onSelect={() =>
          run(
            documentId,
            setTerrainLocked(terrain.id, { ...terrain.locked, sculpt: !terrain.locked.sculpt }),
          )
        }
      />
      <MenuRow
        label={labels.lockPlacement}
        icon={terrain.locked.placement ? mdiLockOutline : mdiLockOpenVariantOutline}
        checked={terrain.locked.placement}
        tick="on-off"
        tip={HINT_RIGHT(labels.lockPlacementHint)}
        onSelect={() =>
          run(
            documentId,
            setTerrainLocked(terrain.id, {
              ...terrain.locked,
              placement: !terrain.locked.placement,
            }),
          )
        }
      />
    </>
  )
}
