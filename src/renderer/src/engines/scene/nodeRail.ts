import type { PathDescriptor } from '@shared/domain/scene'
import { setGeometry, setPath, type NodeEdit } from './commands'
import type { SceneNode } from './sceneState'

/** One reading for both — a rail node and a band swept along one — or knobs and edits disagree. */
export function railOf(node: SceneNode | undefined): PathDescriptor | null {
  if (!node) return null
  if (node.type === 'path') return node.path
  return node.type === 'mesh' && node.geometry.kind === 'ribbon' ? node.geometry.path : null
}

/** Where a rewritten rail is POSED: its own field for a rail node, the shape for a band. */
export function railCommand(node: SceneNode, path: PathDescriptor): NodeEdit | null {
  if (node.type === 'path') return setPath(node.id, path)
  if (node.type !== 'mesh' || node.geometry.kind !== 'ribbon') return null
  return setGeometry(node.id, { ...node.geometry, path })
}
