import { mdiLockOpenVariantOutline, mdiLockOutline } from '@mdi/js'
import { MenuButton } from '@/components/MenuButton'
import { Row } from '@/components/Row'
import { TIP_RIGHT } from '@/helpers/tooltip'
import type { WorldNode } from './worldNodes'
import { WorldRowLocks } from './WorldRowLocks'
import type { WorldRowProps } from './WorldRowLocks'

export function WorldRowTitle({
  documentId,
  node,
  labels,
  name,
}: WorldRowProps & { name: string }) {
  const locked = lockedOf(node)
  return (
    <Row
      title={name}
      muted={mutedOf(node)}
      actions={
        <MenuButton
          icon={locked ? mdiLockOutline : mdiLockOpenVariantOutline}
          label={labels.locks}
          description={labels.locksHint}
          tooltip={TIP_RIGHT}
          variant="row"
          active={locked}
          rowCount={node.edit || node.scatter ? 1 : 2}
          opensOnClick
          rows={() => <WorldRowLocks documentId={documentId} node={node} labels={labels} />}
        />
      }
    />
  )
}

function mutedOf(node: WorldNode): boolean {
  if (node.edit) return !node.edit.enabled
  return !(node.scatter?.enabled ?? node.terrain?.enabled ?? true)
}

function lockedOf(node: WorldNode): boolean {
  if (node.edit) return node.edit.locked
  if (node.scatter) return node.scatter.locked
  return Boolean(node.terrain?.locked.sculpt || node.terrain?.locked.placement)
}
