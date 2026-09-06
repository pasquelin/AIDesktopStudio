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

/** Writes every named weight on every mesh carrying the name, in one walk. Answers how many landed. */
export function setMorphInfluencesOn(
  root: Object3D,
  weights: Readonly<Record<string, number>>,
): number {
  let written = 0
  root.traverse(object => {
    if (!isMorphed(object)) return
    for (const [name, value] of Object.entries(weights)) {
      const index = object.morphTargetDictionary[name]
      if (index === undefined) continue
      object.morphTargetInfluences[index] = value
      written += 1
    }
  })
  return written
}
