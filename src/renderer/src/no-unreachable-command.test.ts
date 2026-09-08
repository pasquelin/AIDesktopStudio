import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from './windowSources'

/**
 * What edits a document, against what an outside client may ask for.
 *
 * The registry is held to its handlers, and the handlers to the tool list, in both directions —
 * but nothing held either to the STUDIO. A command written for a panel and published nowhere is
 * invisible from outside, and every guard stays green: measured on 2026-08-20, the whole world of
 * a 3D scene, the padlocks of a layer and the typeface of a caption were in exactly that state.
 */

/** The modules whose exports ARE the edits of a document — one per workspace that keeps one. */
const COMMAND_MODULES = [
  'engines/canvas/commands.ts',
  'engines/canvas/commandsStructure.ts',
  'engines/scene/animationCommands.ts',
  'engines/scene/animationRecordingCommands.ts',
  'engines/scene/animationTrackCommands.ts',
  'engines/scene/cameraAnimationCommands.ts',
  'engines/scene/nodeBatchCommands.ts',
  'engines/scene/nodeBulkCommands.ts',
  'engines/scene/nodeDescriptorCommands.ts',
  'engines/scene/nodeEditCommands.ts',
  'engines/scene/nodeTreeCommands.ts',
  'engines/scene/postCommands.ts',
  'engines/scene/reliefCommands.ts',
  'engines/scene/scatterCommands.ts',
  'engines/scene/templateCommands.ts',
  'engines/scene/timelineCommands.ts',
  'engines/timeline/commands.ts',
]

/** The end of a parameter list, braces and nesting counted, so a multi-line signature is read. */
function afterParameters(source: string, from: number): number {
  let depth = 0

  for (let index = from; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1
    else if (source[index] === ')') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }

  return source.length
}

/**
 * Every command a module publishes — an exported function whose RETURN type is a `Command`, or an
 * alias one of the four modules declares for one. READ rather than listed, and read ACROSS the
 * four: an alias is exported, so the module that names it in a signature need not be the one that
 * declared it — and a name the regex misses drops a whole family of commands out of this guard.
 *
 * The return type and not the name: `copiesOf` and `keyableProperties` are read by commands and
 * are not ones, while `mergeDown` is one and says nothing of the sort in its name.
 */
function commandsOf(source: string, types: readonly string[]): string[] {
  const returns = new RegExp(`^: (${types.join('|')})\\b`)

  return [...source.matchAll(/export function (\w+)\(/g)]
    .filter(match =>
      returns.test(source.slice(afterParameters(source, match.index + match[0].length - 1))),
    )
    .map(match => match[1] ?? '')
}

/**
 * Everything the handlers are made of, as one text, WITH THE PROSE TAKEN OUT: `flatten` was read
 * as published because a comment used the English word, and it has no action at all.
 */
const HANDLERS = Object.entries(WINDOW_SOURCES)
  .filter(([path]) => path.includes('/assistant/') && path.endsWith('.ts'))
  .map(([, source]) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, ''))
  .join('\n')

/** Read once, like `HANDLERS`: both rules below walk the same four modules. */
const SOURCES: readonly (readonly [string, string])[] = COMMAND_MODULES.map(module => [
  module,
  Object.entries(WINDOW_SOURCES).find(([path]) => path.endsWith(module))?.[1] ?? '',
])

const COMMAND_TYPES: readonly string[] = [
  'Command',
  ...SOURCES.flatMap(([, source]) =>
    [...source.matchAll(/type (\w+) = Command</g)].map(match => match[1] ?? ''),
  ),
]

const COMMANDS: readonly (readonly [string, readonly string[]])[] = SOURCES.map(
  ([module, source]) => [module, commandsOf(source, COMMAND_TYPES)],
)

/**
 * A command a combinator builds FROM, rather than a gesture of its own. Publishing one would be
 * publishing the same edit twice, under a name nobody performs.
 */
const COMBINATORS: readonly string[] = [
  'multi',
  'restructure',
  'editClip',
  'railOnNewShot',
  // The single-node writer its spreading twin builds from. `setMaterialOn` is what decides
  // whether a mesh, a text or a solid is being painted, and `movesToCommand` whether a move
  // becomes a key — an action naming the half underneath would be a second law about what that
  // edit means.
  'setMeshMaterial',
  'setNodeMaterial',
  // The single-node writer `addNodes` builds from, and what every command composing an add uses.
  // The published gesture is the plural one: an Add puts down a whole module, never one node.
  'addNode',
  'setSprite',
  'setTransform',
  'moveNodes',
  'recordMove',
  // The band's own three. A channel is OPENED by keying a subject — `keyNode` mints it — and the
  // panel offers no other way either; a key is written and taken back by `keySubject` and
  // `unkeySubject`, which alone know what a channel's value is measured against.
  'addAnimationTrack',
  'setAnimationKey',
  'removeAnimationKey',
]

/**
 * The other half of the inspector's own bargain: ONE field, typed once, written onto every node
 * of the selection built the same way.
 *
 * Not published, and it is a decision rather than an omission. Each of these is built from the
 * descriptor as it stands when the COMMAND is made, so three of them chained would keep only the
 * last — an action names its node and writes the descriptor whole, through the very writer these
 * delegate to. A client spreads a value by calling the action once per node.
 */
const SPREAD_OVER_A_SELECTION: readonly string[] = ['setGeometryOn', 'setLightOn', 'setCameraOn']

/**
 * Reached through a GESTURE of the store, which does the edit and one thing more that a panel and
 * an action must not diverge on. Named one by one: reading the store whole would let every command
 * it mentions read as published.
 */
const THROUGH_A_GESTURE: Readonly<Record<string, string>> = {
  // Laying a block also CHOOSES it — `stores/scenes.ts`, and `animation.addBlock` performs it.
  addModelClip: 'laySceneClip',
  // Reopening a motion also selects its workbench — `characterMotion.ts`, and
  // `animation.reopenMotion` performs it through that one path.
  loadAnimation: 'reopenCharacterMotion',
  // Saving a ground stroke creates its picture asset before the document can point at it.
  setTerrainGroundWeights: 'saveGroundPaint',
}

/**
 * Reached through `command.runStudioCommand` rather than by an action of its own — the OTHER door, which this
 * rule cannot see: a client fires the registry command beside each one and the surface in front
 * builds the edit. Listed so they do not read as gestures nothing can reach.
 */
const THROUGH_A_COMMAND: Readonly<Record<string, string>> = {
  flatten: 'canvas.flatten',
  clearGuides: 'canvas.clearGuides',
  removeCameraShot: 'scene.delete',
  // The three gestures of the tree that act on WHAT IS SELECTED, exactly as ⌘G, ⌘D and Delete do
  // on screen: a client sets the selection with `node.select` and fires the command beside it.
  groupNodes: 'scene.group',
  addNodes: 'scene.duplicate',
  removeNodes: 'scene.delete',
  // The same bargain for who is ON the animation band: the selection, then the command beside it.
  putOnAnimationSheet: 'scene.addToSheet',
  takeOffAnimationSheet: 'scene.removeFromSheet',
  // The toggle half of the tool mark: `node.markAsCuttingTool` publishes `setNodesNegative`, which SAYS
  // which of the two it means, where a button has to read what is already marked.
  negateNodes: 'scene.negate',
  setNodesOptimization: 'scene.optimizeSelection',
}

/**
 * The gestures no action publishes yet, named one by one — a map of what is left rather than a
 * count to make fall. Two rules hold it: a command added without a door fails the first, and one
 * that gains a door and stays listed here fails the second, so the list cannot rot in either
 * direction.
 *
 * Grouped by what would open them. The scene's half is the larger, and it is the one a client
 * driving the 3D space runs into first.
 */
const NOT_PUBLISHED: readonly string[] = [
  'sweep',
  'reorderPostEffects',
  'sculptRelief',
  'addTerrain',
  'addTerrainEdit',
  'removeTerrain',
  'removeTerrainEdit',
  'renameTerrain',
  'renameTerrainEdit',
  'reorderTerrainEdits',
  'reorderTerrains',
  'setTerrainEditAlpha',
  'setTerrainEditMask',
  'paintTerrainEditMask',
  'addScatter',
  'removeScatter',
  'renameScatter',
  'reorderScatters',
  'setScatterEnabled',
  'setScatterLocked',
  'setScatterMask',
  'paintScatterMask',
  'setScatterRules',
  'setScatterSeed',
  'setScatterAssets',
  'setScatterCategory',
  'setScatterCollision',
  'setScatterFollowRelief',
  'setTerrainEditEnabled',
  'setTerrainEditLocked',
  'setTerrainEnabled',
  'setTerrainLocked',
  'setTerrainGroundMaterials',
  // The ENGINE reaches it, never a handler: `endPixels` calls `onPixels`, which the window has
  // wired to this command since the brush existed. An action that paints goes through the port's
  // `paintCells`, which knows nothing of it — a second door is the same entry pushed twice.
  // The drag's own half of `layer.transform`: an absolute x and y, so a gesture coalesced into
  // one entry keeps the last apply. An action names the transform whole and goes through
  // `setLayerTransform` — a second door onto the same edit is an edit published twice.
  'translateLayer',
  // The grip's half of the pair `layer.editTextLayer` and `layer.transform` already publish: it writes a
  // caption's box AND its corner in ONE entry, because a north or west grip pulls both at once.
  // A call names them one after the other and pays two undos, which no hand can do.
  'resizeCaption',
]

/**
 * A module that declares no command because it re-exports other modules' ones — legal, and the one
 * shape that may answer nothing. Told by its TEXT rather than by a list: a barrel named here would
 * go stale the day the next one is written.
 */
const reExportsOnly = (source: string): boolean =>
  !/export function \w+\(/.test(source) && /export \{[\s\S]*?\} from '/.test(source)

describe('what edits a document, and what an outside client may ask for', () => {
  /**
   * A regex that reads nothing prints the same green as one that works — so the floor is PER
   * MODULE. Over the total it is not a floor at all: measured 2026-09-04, `animationCommands.ts`
   * answered ZERO after becoming a re-export barrel while the sum of sixteen modules read ~149
   * against a floor of 40. A module rewritten to `export const name = (…): Command =>` would leave
   * the reachability audit the same silent way.
   *
   * A barrel is allowed its zero, and pays for it: what stands BEHIND it must itself be audited,
   * or it hides a module this suite never reads.
   */
  it('finds the commands of every module, and not merely of their total', () => {
    const sourceOf = new Map(SOURCES)

    for (const [module, names] of COMMANDS) {
      const source = sourceOf.get(module) ?? ''
      if (!reExportsOnly(source)) {
        // Not a higher floor: the size split left modules of THREE commands —
        // `animationRecordingCommands.ts`, measured 2026-09-04. Zero is what a regex reading
        // nothing answers, and zero is what a module declaring anything at all may never say.
        expect(names.length, module).toBeGreaterThan(0)
        continue
      }

      const folder = module.slice(0, module.lastIndexOf('/') + 1)
      const behind = [...source.matchAll(/\} from '\.\/(\w+)'/g)].map(
        match => `${folder}${match[1]}.ts`,
      )
      expect(behind.length, module).toBeGreaterThan(0)
      expect(
        behind.filter(path => !COMMAND_MODULES.includes(path)),
        module,
      ).toEqual([])
    }

    expect(HANDLERS.length).toBeGreaterThan(10_000)
  })

  it('leaves no command of a document that no action can reach', () => {
    const known = new Set([
      ...COMBINATORS,
      ...SPREAD_OVER_A_SELECTION,
      ...NOT_PUBLISHED,
      ...Object.keys(THROUGH_A_COMMAND),
      ...Object.keys(THROUGH_A_GESTURE),
    ])
    const orphans = COMMANDS.flatMap(([module, names]) =>
      names
        .filter(name => !known.has(name) && !new RegExp(`\\b${name}\\b`).test(HANDLERS))
        .map(name => `${module} — ${name}`),
    )

    expect(orphans.sort()).toEqual([])
  })

  /**
   * The four lists against the modules themselves. A name that no longer names a command — one
   * renamed, one that stopped being a `Command` — is an entry that guards nothing while reading
   * as an exemption: `collapseLayer` sat here for a day in exactly that state.
   */
  it('names nothing the modules do not declare', () => {
    const declared = new Set(COMMANDS.flatMap(([, names]) => names))
    const listed = [
      ...COMBINATORS,
      ...SPREAD_OVER_A_SELECTION,
      ...NOT_PUBLISHED,
      ...Object.keys(THROUGH_A_COMMAND),
      ...Object.keys(THROUGH_A_GESTURE),
    ]

    expect(listed.filter(name => !declared.has(name)).sort()).toEqual([])
  })

  /**
   * The other direction: a gesture that gained a door and stayed on a list of exemptions.
   *
   * `COMBINATORS` is deliberately out of this one — `multi` is a combinator a handler legitimately
   * composes with, and reading its name as a door would fail the day one did.
   */
  it('keeps no name on the list once an action reaches it', () => {
    const published = [...NOT_PUBLISHED, ...SPREAD_OVER_A_SELECTION].filter(name =>
      new RegExp(`\\b${name}\\b`).test(HANDLERS),
    )

    expect(published.sort()).toEqual([])
  })
})
