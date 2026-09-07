import type { AssetType } from '@shared/domain/asset'

/**
 * What the workspace offers a generation — ADR-23. Handed the state rather than reading a store,
 * so it tests without React and `import-cycles.test.ts` stays at zero.
 */

/**
 * Where an input came from. It names what the panel writes under the thumbnail AND what taking
 * the input off has to undo — a source nobody can trace to a gesture is one nobody can withdraw.
 */
export type InputOrigin =
  /** Files the project explorer has picked. */
  | 'explorer'
  /** Placements the scene in front has picked. */
  | 'scene'
  /** What the last generation produced, so a chain starts from it. */
  | 'result'

/** Walked by `dynamic-keys.i18n.test.ts`: the sentence under each thumbnail is composed. */
export const INPUT_ORIGINS: readonly InputOrigin[] = ['explorer', 'scene', 'result']

/**
 * One input the panel draws and ATTACHES to a field. Narrower than `AvailableInput`: a script is
 * at hand without being a row of the shelf — see `useGenerationContext`.
 */
export type GenerationInput = {
  role: 'source' | 'mask'
  kind: AssetType
  /**
   * 🛑 The catalogue row it names, and never optional: an input the panel cannot ATTACH is one it
   * would draw and never send. A canvas annotation is offered to capability resolution without
   * becoming one of these rows, then flattened only when the generation is submitted.
   */
  assetId: string
  /** What the panel draws beside the thumbnail. Document data, never a word of the interface. */
  label: string
} & (
  | { origin: 'result' }
  /**
   * 🛑 The placement it was picked as, REQUIRED by the union: a scene selects nodes, two of them
   * can reference one model, and withdrawing by asset id would take both off. Optional, the
   * panel drew a cross that silently did nothing.
   */
  | { origin: 'scene'; nodeId: string }
  /** The PATH it was picked by, for the same reason: the explorer deselects by path. */
  | { origin: 'explorer'; path: string }
)

/** An input a gesture put there, so taking it off has something to undo. */
export type WithdrawableInput = Extract<GenerationInput, { origin: 'explorer' | 'scene' }>

/** 🛑 An ALLOW-list, owned with the union: a fourth origin must not get a cross by default. */
export function isWithdrawable(input: GenerationInput): input is WithdrawableInput {
  return input.origin === 'explorer' || input.origin === 'scene'
}

/** What the panel is handed to work out its inputs, gathered by `useGenerationContext`. */
export type WorkspaceContent = {
  /**
   * Files the explorer has picked, each already resolved to the catalogue row it names. A file
   * the catalogue does not hold has no id to send and never reaches here.
   */
  selectedFiles: readonly { assetId: string; name: string; path: string; type: AssetType }[]
  /** The models a scene has selected: the placement, and the catalogue row it references. */
  selectedMeshes: readonly { assetId: string; name: string; nodeId: string }[]
  /** What the last generation produced, kept so a chain can start from it. */
  results: readonly { id: string; name: string; type: AssetType }[]
}

/**
 * Everything the workspace can hand a model, most explicit first. The ORDER is the priority: the
 * panel fills each slot of the contract from the first input that fits it — 🛑 the SCENE opens the
 * list and the explorer follows, or a file picked an hour ago outranks the model just clicked.
 */
export function availableInputsOf(content: WorkspaceContent): readonly GenerationInput[] {
  const inputs: GenerationInput[] = []
  // 🛑 Keyed by what withdrawing UNDOES — a node id, then a row id: two placements of one model
  // are two sources, and keyed by the row that pair collapsed into one whose cross did nothing.
  const seen = new Set<string>()

  for (const mesh of content.selectedMeshes) {
    if (seen.has(mesh.nodeId)) continue
    seen.add(mesh.nodeId)
    inputs.push({
      role: 'source',
      kind: 'mesh',
      assetId: mesh.assetId,
      label: mesh.name,
      origin: 'scene',
      nodeId: mesh.nodeId,
    })
  }

  for (const file of content.selectedFiles) {
    if (seen.has(file.assetId)) continue
    seen.add(file.assetId)
    inputs.push({
      role: 'source',
      kind: file.type,
      assetId: file.assetId,
      label: file.name,
      origin: 'explorer',
      path: file.path,
    })
  }

  for (const result of content.results) {
    if (seen.has(result.id)) continue
    seen.add(result.id)
    inputs.push({
      role: 'source',
      kind: result.type,
      assetId: result.id,
      label: result.name,
      origin: 'result',
    })
  }

  return inputs
}
