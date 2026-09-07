import type { ReliefLayer, ScatterLayer, TerrainEditLayer, WorldLayer } from '@shared/domain/scene'
import type { TreeNode } from '@/components/Tree'

export type WorldNode = TreeNode & {
  kind: 'terrain' | 'edit' | 'scatter'
  terrain: ReliefLayer | null
  scatter: ScatterLayer | null
  edit: TerrainEditLayer | null
}

export function worldNodeId(layerId: string, editId: string | null): string {
  return editId === null ? layerId : `${layerId}/${editId}`
}

export function worldNodes(layers: readonly WorldLayer[]): WorldNode[] {
  const nodes: WorldNode[] = []
  for (const layer of layers) {
    if (layer.kind === 'scatter') {
      nodes.push({
        id: layer.id,
        parentId: null,
        kind: 'scatter',
        terrain: null,
        scatter: layer,
        edit: null,
      })
      continue
    }
    nodes.push({
      id: worldNodeId(layer.id, null),
      parentId: null,
      kind: 'terrain',
      terrain: layer,
      scatter: null,
      edit: null,
    })
    for (const edit of layer.edits) {
      nodes.push({
        id: worldNodeId(layer.id, edit.id),
        parentId: layer.id,
        kind: 'edit',
        terrain: layer,
        scatter: null,
        edit,
      })
    }
  }
  return nodes
}
