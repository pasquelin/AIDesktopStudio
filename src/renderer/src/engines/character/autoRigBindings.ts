import type { Mesh } from 'three'
import type { AutoRigResult, AutoRigSkinBinding } from '@shared/domain/autoRig'
import type { SkinBinding } from './skinVertices'

export type AutoRigMeshTarget = {
  mesh: number
  primitive: number
  object: Mesh
}

export function autoRigBindingsFor(
  result: AutoRigResult,
  targets: readonly AutoRigMeshTarget[],
): { mesh: Mesh; binding: SkinBinding }[] | null {
  const byTarget = new Map(targets.map(target => [keyOf(target), target.object]))
  if (byTarget.size !== targets.length) return null
  const bound: { mesh: Mesh; binding: SkinBinding }[] = []
  const matched = new Set<string>()
  for (const binding of result.bindings) {
    const key = keyOf(binding)
    const mesh = byTarget.get(key)
    if (!mesh || matched.has(key)) return null
    matched.add(key)
    bound.push({ mesh, binding })
  }
  return matched.size === targets.length ? bound : null
}

function keyOf(target: Pick<AutoRigSkinBinding, 'mesh' | 'primitive'>): string {
  return `${target.mesh}:${target.primitive}`
}
