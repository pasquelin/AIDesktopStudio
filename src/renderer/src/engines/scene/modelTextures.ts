import {
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  Mesh,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  Texture,
  type Material,
  type MinificationTextureFilter,
  type Object3D,
  type Wrapping,
} from 'three'
import {
  TEXTURE_SLOTS,
  type ModelMaterial,
  type ModelDress,
  type TextureRef,
  type TextureSlot,
} from '@shared/domain/scene'
import { createSlotBindings, type SlotBindings } from './textureBinding'
import type { TextureCache } from './textureCache'
import { giveSecondUvSet } from './threeSync'
import { gltfMaterialIndexOf } from './gltfSource'

export type ModelTextures = {
  /**
   * How many materials this model carries — its slots, as Blender and Unreal name them. Zero for
   * a file nothing can be written into, which is what `onUndressable` is said about.
   */
  count: () => number
  /** Names in editable slot order, with an empty string where the file names none. */
  names: () => readonly string[]
  /** Source glTF material indices in editable slot order. */
  sourceIndices: () => readonly (number | null)[]
  /** Meshes below the model root, with the material slots each one wears. */
  parts: () => readonly ModelPart[]
  /** Whether the file still carries at least one texture. */
  hasFileTextures: () => boolean
  /** Keeps or removes every texture carried by the cloned file materials. */
  fileTextures: (enabled: boolean) => void
  /** Forgets file textures after extraction, so no later mode can restore stale GPU copies. */
  detachFileTextures: () => void
  /** The overrides one slot holds, or none. */
  apply: (slot: number, maps: ModelDress['textures']) => void
  /** The finish one slot wears over its file. Absent fields leave what the glTF put there. */
  dress: (slot: number, finish: ModelMaterial | undefined) => void
  /** Gives every reference back. The materials go with the instance that wore them. */
  dispose: () => void
}

export type ModelPart = { id: string; name: string; materialSlots: readonly number[] }

/**
 * One material of the instance, and the maps the file had put in it. The MESHES, plural: a glTF
 * material is routinely worn by several primitives, and one slot per pair made a file of one
 * material report five.
 */
type Dressed = {
  meshes: Mesh[]
  material: MeshStandardMaterial
  /** Read before anything is written over it: removing an override puts the file's map back. */
  fileMaps: Map<TextureSlot, Texture | null>
  /** The finish the file gave it, put back when a dress names none — see `wear`. */
  fileFinish: ModelMaterial
  /** The clones this material wears — ours to free, unlike anything the cache handed out. */
  worn: Map<TextureSlot, Texture>
  fileTextures: boolean
  sourceIndex: number | null
  refs: Map<TextureSlot, TextureRef>
}

type FileMaterial = { material: Material; maps: Map<string, Texture>; enabled: boolean }

/**
 * One material and the bindings that write into IT alone — one set per slot, never one shared.
 *
 * Composed rather than spread: the bindings close over `held`, so a second object describing the
 * same material would diverge from it the day anyone reassigns a field of either.
 */
type Slot = { held: Dressed; bindings: SlotBindings }

/**
 * The project's own maps over the ones a model's file carries, on every material of ONE instance.
 *
 * Its materials are cloned, and that is the whole reason this is not `createMaterialTextures` with
 * another argument: `instanceOf` copies a model's tree but SHARES its materials, so writing a map
 * into one would repaint every other node built from the same file — the ones the user never
 * touched included.
 *
 * **Cloned the moment the file lands, never later**, and this is not an optimisation left on the
 * table. A display mode swaps `mesh.material` for a stand-in shared by the whole scene
 * (`pane-dress`): a clone taken while one is on would copy the CLAY, record its empty slots as the
 * file's own, and hand `PaneMemory` a material it takes for the model's — losing the real one for
 * the rest of the session. Taking the copy at build time, before anything dresses the scene, is
 * what makes the slots hold their own material like `createMaterialTextures` does.
 */
export function createModelTextures(
  cache: TextureCache,
  root: Object3D,
  onChange: () => void,
  /** Said when a model carries nothing a map can be written into — see `dressed` below. */
  onUndressable: () => void = () => {},
): ModelTextures {
  const slots: Slot[] = []
  const fileMaterials: FileMaterial[] = []
  /** Keyed by the material the FILE holds, so meshes sharing one share its slot and its clone. */
  const bySource = new Map<Material, Slot>()
  const clones = new Map<Material, Material>()

  root.traverse(object => {
    if (!(object instanceof Mesh)) return

    const clone = (one: Material): Material => {
      const seen = bySource.get(one)
      if (seen) {
        seen.held.meshes.push(object)
        return seen.held.material
      }
      const seenClone = clones.get(one)
      if (seenClone) return seenClone

      const material = one.clone()
      clones.set(one, material)
      fileMaterials.push({
        material,
        maps: texturePropertiesOf(material, material instanceof MeshStandardMaterial),
        enabled: true,
      })
      if (!(material instanceof MeshStandardMaterial)) return material

      const held: Dressed = {
        meshes: [object],
        material,
        fileMaps: new Map<TextureSlot, Texture | null>(),
        fileFinish: finishOf(material),
        worn: new Map(),
        fileTextures: true,
        sourceIndex: gltfMaterialIndexOf(one),
        refs: new Map(),
      }
      for (const map of TEXTURE_SLOTS) held.fileMaps.set(map, held.material[map])
      // `from-image`, unlike every other holder of this cache: the glTF stores its UVs for an
      // unflipped picture, so the studio's own convention lands them upside down over the maps
      // it replaces.
      const slot: Slot = {
        held,
        bindings: createSlotBindings(cache, 'from-image', write(held, onChange)),
      }
      bySource.set(one, slot)
      slots.push(slot)
      return held.material
    }

    const worn = object.material
    object.material = Array.isArray(worn) ? worn.map(clone) : clone(worn)
  })
  // Its keys are the file's own materials, shared with the cached source: held past the build,
  // this map would keep them alive for as long as the instance wearing their clones.
  bySource.clear()
  const parts: ModelPart[] = []
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    parts.push({
      id: `mesh-${parts.length}`,
      name: object.name,
      materialSlots: materials.flatMap(material => {
        const slot = slots.findIndex(candidate => candidate.held.material === material)
        return slot < 0 ? [] : [slot]
      }),
    })
  })

  return {
    count: () => slots.length,
    names: () => slots.map(slot => slot.held.material.name),
    sourceIndices: () => slots.map(slot => slot.held.sourceIndex),
    parts: () => parts,
    hasFileTextures: () =>
      fileMaterials.some(held => held.maps.size > 0) ||
      slots.some(slot => [...slot.held.fileMaps.values()].some(Boolean)),
    fileTextures: enabled => {
      for (const held of fileMaterials) setFileTextures(held, enabled, onChange)
      for (const slot of slots) slot.held.fileTextures = enabled
    },
    detachFileTextures: () => {
      for (const held of fileMaterials) {
        setFileTextures(held, false, onChange)
        held.maps.clear()
      }
      for (const slot of slots) detachSlotFileTextures(slot.held, onChange)
    },
    apply: (slot, maps) => {
      const held = slots[slot]
      if (held) {
        held.held.refs.clear()
        for (const map of TEXTURE_SLOTS) {
          const ref = maps[map]
          if (ref) held.held.refs.set(map, ref)
        }
        held.bindings.apply(maps)
        for (const map of TEXTURE_SLOTS) {
          if (!maps[map]) writeMap(held.held, map, null, onChange)
        }
        return
      }

      // Said out loud rather than letting a map do nothing in silence — and only when one was
      // actually asked for: a model wearing nothing applies an empty set on every sync.
      if (slots.length === 0 && Object.keys(maps).length > 0) onUndressable()
    },
    dress: (slot, finish) => {
      const held = slots[slot]?.held
      if (!held) return

      // The FILE's own where the dress names none: covering a model with a picture is a mode of
      // its own, and it kept the red of the material it replaced.
      let moved = wear(held.material, finish ?? held.fileFinish)
      // The repeat rides on the TEXTURES, so it reaches the clones this file owns and the file's
      // own maps alike. It counts as a MOVE: a material whose only change is its tiling repaints
      // nothing otherwise — `apply` writes no map, and `wear` sees no dial move.
      for (const map of TEXTURE_SLOTS) {
        moved =
          tile(
            held.worn.get(map) ?? held.fileMaps.get(map),
            held.refs.get(map)?.transform ?? finish,
          ) || moved
      }
      // Only when something MOVED: a redraw marks the shadows stale, and this runs per slot of
      // every model each time any material document is touched — see `useMaterialRefresh`.
      if (moved) onChange()
    },
    dispose: () => {
      // Cloned copies only — SceneRenderer.release never sees them; file maps stay with the cache.
      for (const { bindings, held } of slots) {
        bindings.clear()
        for (const copy of held.worn.values()) copy.dispose()
      }
      for (const held of fileMaterials) held.material.dispose()
    },
  }
}

function detachSlotFileTextures(held: Dressed, onChange: () => void): void {
  held.fileTextures = false
  for (const map of TEXTURE_SLOTS) {
    held.fileMaps.set(map, null)
    if (!held.worn.has(map)) writeMap(held, map, null, onChange)
  }
}

/** Writes one map into ONE material of the instance, freeing the clone the slot wore before. */
function write(
  held: Dressed,
  onChange: () => void,
): (slot: TextureSlot, texture: Texture | null) => void {
  return (slot, texture) => writeMap(held, slot, texture, onChange)
}

function writeMap(
  held: Dressed,
  slot: TextureSlot,
  texture: Texture | null,
  onChange: () => void,
): void {
  const { meshes, material, fileMaps, worn } = held
  const file = fileMaps.get(slot) ?? null
  const next = textureFor(held, slot, texture, file)
  if (material[slot] === next) return

  // Same reason as a mesh's own maps: occlusion reads the second UV set, and a generated model
  // rarely carries one — left alone, an AO map would do nothing at all. Every mesh wearing this
  // material, since they share the clone.
  if (next && slot === 'aoMap') for (const mesh of meshes) giveSecondUvSet(mesh.geometry)

  // three counts its GPU textures per `Texture`, and a copy carrying its own wrapping is a
  // second allocation nothing else would ever free. Only a CLONE goes in: with no file map to
  // wear the sampler of, `sampledLike` hands back the cache's own instance, and disposing that
  // would free it under every other model holding the same picture.
  worn.get(slot)?.dispose()
  if (next && next !== texture && next !== file) worn.set(slot, next)
  else worn.delete(slot)

  material[slot] = next
  material.needsUpdate = true
  onChange()
}

function textureFor(
  held: Dressed,
  slot: TextureSlot,
  texture: Texture | null,
  file: Texture | null,
): Texture | null {
  if (texture) return sampledLike(texture, file, held.refs.get(slot))
  return held.fileTextures ? file : null
}

function texturePropertiesOf(material: Material, standardSlots: boolean): Map<string, Texture> {
  const maps = new Map<string, Texture>()
  for (const [name, value] of Object.entries(material)) {
    if (
      value instanceof Texture &&
      (!standardSlots || !TEXTURE_SLOTS.some(slot => slot === name))
    ) {
      maps.set(name, value)
    }
  }
  return maps
}

function setFileTextures(held: FileMaterial, enabled: boolean, onChange: () => void): void {
  if (held.enabled === enabled) return
  held.enabled = enabled
  if (held.maps.size === 0) return
  for (const [name, texture] of held.maps)
    Reflect.set(held.material, name, enabled ? texture : null)
  held.material.needsUpdate = true
  onChange()
}

/**
 * The override wearing the sampler of the map it replaces — repeat, offset, rotation and UV set.
 *
 * A CLONE, because the cache hands the same instance to every holder: written on it, one model's
 * tiling would reach every other slot pointing at that picture. It shares the `Source`, but NOT
 * the GPU texture — `getTextureCacheKey` reads the wrapping — so the caller frees what it wears.
 */
function sampledLike(
  texture: Texture,
  file: Texture | null | undefined,
  reference?: TextureRef,
): Texture {
  if (!file && !reference?.transform && !reference?.sampling) return texture

  const worn = texture.clone()
  if (file) {
    worn.wrapS = file.wrapS
    worn.wrapT = file.wrapT
    worn.repeat.copy(file.repeat)
    worn.offset.copy(file.offset)
    worn.center.copy(file.center)
    worn.rotation = file.rotation
    worn.channel = file.channel
  }
  if (reference?.sampling) {
    worn.channel = reference.sampling.channel
    worn.wrapS = wrappingOf(reference.sampling.wrapS)
    worn.wrapT = wrappingOf(reference.sampling.wrapT)
    worn.minFilter = minFilterOf(reference.sampling.minFilter)
    worn.magFilter = reference.sampling.magFilter === 9728 ? NearestFilter : LinearFilter
  }
  tile(worn, reference?.transform)
  return worn
}

function wrappingOf(value: number): Wrapping {
  if (value === 33071) return ClampToEdgeWrapping
  if (value === 33648) return MirroredRepeatWrapping
  return RepeatWrapping
}

function minFilterOf(value: number): MinificationTextureFilter {
  const filters: Record<number, MinificationTextureFilter> = {
    9728: NearestFilter,
    9729: LinearFilter,
    9984: NearestMipmapNearestFilter,
    9985: LinearMipmapNearestFilter,
    9986: NearestMipmapLinearFilter,
    9987: LinearMipmapLinearFilter,
  }
  return filters[value] ?? LinearMipmapLinearFilter
}

/** The dials the FILE gave a material, so a dress naming none can put them back. */
function finishOf(material: MeshStandardMaterial): ModelMaterial {
  return {
    color: `#${material.color.getHexString()}`,
    roughness: material.roughness,
    metalness: material.metalness,
    normalScale: material.normalScale.x,
    aoIntensity: material.aoMapIntensity,
    emissive: `#${material.emissive.getHexString()}`,
    emissiveIntensity: material.emissiveIntensity,
  }
}

/**
 * The dials a plain `MeshStandardMaterial` carries. The four it does not are named on
 * `ModelMaterial`.
 *
 * `needsUpdate` only where a value MOVED: it makes three.js re-derive the program's key, and this
 * runs per slot of every model on each catalogue refresh — a model wearing what it already wears
 * would pay for it several times a second during an ingest.
 */
function wear(material: MeshStandardMaterial, finish: ModelMaterial): boolean {
  let moved = false
  const set = <T>(held: T, wanted: T | undefined, put: (value: T) => void): void => {
    if (wanted === undefined || Object.is(held, wanted)) return
    put(wanted)
    moved = true
  }

  // As INTEGERS, never as `#rrggbb`: the hex string is two allocations a side, and this runs per
  // slot of every model on each pass.
  const tint = (held: Color, wanted: string | undefined): void => {
    if (wanted === undefined) return
    set(held.getHex(), TINT.set(wanted).getHex(), () => held.copy(TINT))
  }

  tint(material.color, finish.color)
  set(material.roughness, finish.roughness, value => (material.roughness = value))
  set(material.metalness, finish.metalness, value => (material.metalness = value))
  set(material.normalScale.x, finish.normalScale, value => material.normalScale.set(value, value))
  set(material.aoMapIntensity, finish.aoIntensity, value => (material.aoMapIntensity = value))
  tint(material.emissive, finish.emissive)
  set(material.emissiveIntensity, finish.emissiveIntensity, value => {
    material.emissiveIntensity = value
  })

  if (moved) material.needsUpdate = true
  return moved
}

/** Read and thrown away on every comparison — a `Color` allocated per call would be the point. */
const TINT = new Color()

/** The repeat, the shift and the turn of one map. Answers whether any of the three moved. */
function tile(texture: Texture | null | undefined, finish: ModelMaterial | undefined): boolean {
  if (!texture || !finish) return false

  let moved = false
  const put = (held: { x: number; y: number }, wanted: { x: number; y: number } | undefined) => {
    if (!wanted || (held.x === wanted.x && held.y === wanted.y)) return
    held.x = wanted.x
    held.y = wanted.y
    moved = true
  }

  put(texture.repeat, finish.tiling)
  put(texture.offset, finish.offset)
  if (finish.rotation !== undefined && texture.rotation !== finish.rotation) {
    texture.rotation = finish.rotation
    moved = true
  }
  return moved
}
