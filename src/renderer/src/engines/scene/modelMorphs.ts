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

export class MorphPreviews {
  private readonly weights = new WeakMap<Object3D, Readonly<Record<string, number>>>()

  set(root: Object3D, weights: Readonly<Record<string, number>>): number {
    this.weights.set(root, weights)
    return setMorphInfluencesOn(root, weights)
  }

  apply(root: Object3D): void {
    const weights = this.weights.get(root)
    if (weights) setMorphInfluencesOn(root, weights)
  }

  transfer(from: Object3D | undefined, to: Object3D | undefined): void {
    const weights = from && this.weights.get(from)
    if (weights && to) this.weights.set(to, weights)
  }
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
  const entries = Object.entries(weights)
  root.traverse(object => {
    if (!isMorphed(object)) return
    for (const [name, value] of entries) {
      const index = object.morphTargetDictionary[name]
      if (index === undefined) continue
      object.morphTargetInfluences[index] = value
      written += 1
    }
  })
  return written
}
