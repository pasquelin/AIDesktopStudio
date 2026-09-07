import type { BakedInstance, MeshNode, SceneNode } from './sceneState'

export function bakedRuntimeNodes(nodes: readonly SceneNode[]): SceneNode[] {
  return nodes.flatMap(node =>
    node.type === 'mesh' && node.instances
      ? [node, ...node.instances.map(instance => sourceNodeOf(node, instance))]
      : [node],
  )
}

function sourceNodeOf(node: MeshNode, instance: BakedInstance): MeshNode {
  return {
    ...node,
    id: instance.sourceId,
    parentId: node.id,
    name: instance.name,
    transform: instance.transform,
    instances: undefined,
    optimization: undefined,
  }
}
