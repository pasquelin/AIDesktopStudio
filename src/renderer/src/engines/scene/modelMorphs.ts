import { Mesh, type Object3D } from 'three'

type Morphed = Mesh & {
  morphTargetDictionary: Record<string, number>
  morphTargetInfluences: number[]
}

function isMorphed(object: Object3D): object is Morphed {
  return (
    object instanceof Mesh &&
    object.morphTargetDictionary !== undefined &&
    object.morphTargetInfluences !== undefined
  )
}

/** Every morph target a loaded model carries, by name, each once — a smile spans several meshes. */
export function morphNamesOf(root: Object3D): readonly string[] {
  const names = new Set<string>()
  root.traverse(object => {
    if (isMorphed(object))
      for (const name of Object.keys(object.morphTargetDictionary)) names.add(name)
  })
  return [...names]
}

/** Writes one target's weight on every mesh that carries it. Answers whether any did. */
export function setMorphInfluenceOn(root: Object3D, name: string, value: number): boolean {
  let written = false
  root.traverse(object => {
    if (!isMorphed(object)) return
    const index = object.morphTargetDictionary[name]
    if (index === undefined) return
    object.morphTargetInfluences[index] = value
    written = true
  })
  return written
}
