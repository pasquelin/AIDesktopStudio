import { MESH_IMPORT_LOSSES } from '@shared/domain/meshImport'
import { describe, expect, it } from 'vitest'
import { isRecord } from '@shared/guards'
import { LANGUAGES, TRANSLATIONS, type Language } from '@shared/i18n'
import { PBR_CHANNELS, type PbrChannel } from '@shared/domain/material'
import { PICTURE_TRAITS } from '@shared/domain/formatCapability'
import { FOLDER_ROLES } from '@shared/domain/folderRole'
import { roleLabelKey } from '@/helpers/workspaces'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import { BODY_PARTS, HUMANOID_ROLES } from '@shared/domain/humanoid'
import { GROUND_MATERIAL_CHANNELS, ROOT_MOTIONS, SCATTER_CATEGORIES } from '@shared/domain/scene'
import { EASINGS } from '@shared/domain/animation'
import { OPTIMIZATION_MODES } from '@shared/domain/scene'
import { OPTIMIZATION_WARNING_REASONS } from '@/engines/scene/worldAnalyzer'
import { UI_ELEMENT_TYPES } from '@shared/domain/ui'
import { UI_RESOLUTION_IDS } from '@shared/domain/uiResolution'
import { UI_TEMPLATE_IDS } from '@shared/domain/uiTemplates'
import { BLEND_MODES } from '@shared/domain/canvasBlend'
import {
  ADJUSTMENT_KINDS,
  COLOR_MODES,
  LAYER_KINDS,
  SHAPE_KINDS,
  type LayerKind,
} from '@/engines/canvas/canvasState'
import { TRACK_KINDS, type TrackKind } from '@/engines/timeline/timelineState'
import { LAYER_LOCKS } from '@/features/image/components/Layer/layerLocks'
import {
  LAYER_OPERATIONS,
  type LayerOperation,
} from '@/features/image/components/Layer/LayerStackActions'
import { ADD_ENTRIES } from '@/engines/scene/nodeKinds'
import { ENVIRONMENT_PRESETS } from '@/engines/scene/environmentPresets'
import { SHADOW_LEVELS } from '@/engines/scene/shadowLevels'
import { INPUT_ORIGINS, type InputOrigin } from '@/generation/generationInputs'
import { RIG_STATUSES, type RigStatus } from '@/engines/scene/rigState'
import { RIG_FIT_FAULTS, type RigFitFault } from '@/engines/scene/rigFit'
import {
  AUTO_RIG_PRODUCT_ERRORS,
  AUTO_RIG_PROGRESS_PHASES,
  type AutoRigProductError,
  type AutoRigProgressPhase,
} from '@shared/domain/autoRigInference'
import { NAVIGATION_HINT_GROUPS } from '@/features/scene/components/Scene/SceneNavigationHint'
import { CHARACTER_KINDS } from '@shared/domain/character'
import { ASSET_INTENTS } from '@/helpers/assetIntents'
import { FOLDER_SORTS } from '@/helpers/folderSort'
import { TRACK_FLAGS } from '@/features/timeline/components/trackFlags'
import { DOCUMENT_NAME_REFUSALS } from '@/features/document/documentName'
import { SAVE_REFUSALS } from '@/features/shell/documentIo'
import { DOCUMENT_KINDS, isMadeFromNothing } from '@shared/domain/document'
import { destinationFormatsFor } from '@shared/domain/encodableFormat'
import { SCENE_TEMPLATE_GROUPS, SCENE_TEMPLATE_IDS } from '@shared/domain/sceneTemplate'
import { DERIVED_STORES } from '@shared/domain/derivedCache'
import { COPY_STORES } from '@shared/domain/fileCopies'
import { GATHER_REFUSALS } from '@shared/domain/gather'
import { SHIPPED_FAMILIES } from '@shared/domain/shippedResources'
import { FILE_KINDS } from '@shared/domain/folder'
import { FILE_INFO_SECTIONS } from '@/features/document/components/FileInfoWindow/sections'
import { CHOICE_SCOPES } from '@shared/domain/aiOverview'
import { FIT_DETAIL_KEYS } from '@/hooks/useModelFit'
import { CLOUD_IDS } from '@shared/domain/aiCloud'
import { doorLabelKey } from '@/helpers/assistantDoor'
import { ASSISTANT_STARTERS, starterKey } from '@/features/assistant/starters'
import { SOURCES } from '@/features/assets/components/Asset/Browser/facets'
import { INPUT_PRESET_IDS } from '@shared/domain/inputPresets'
import { INPUT_MAP_VIEWS } from '@/features/input/components/InputMapDocument'
import { DESCRIBED_ACTION_IDS } from '@/features/input/components/inputMapPresentation'
import { ANIMATION_GRAPH_VIEWS } from '@/features/game/components/AnimationGraphDocument'
import { CLIP_SOURCES } from '@shared/domain/sceneModel'

function resolve(code: Language, key: string): unknown {
  // Widened, not cast: the bundle's inferred type has no index signature, and every key here is
  // composed from a registry rather than written down beside it.
  const bundle: unknown = TRANSLATIONS[code]
  return key
    .split('.')
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), bundle)
}

/** The label AND the sentence beside it — the shape `choicesOf` composes, missing in two ways. */
function explained(prefix: string, values: readonly string[]): string[] {
  return values.flatMap(value => [`${prefix}${value}`, `${prefix}${value}Hint`])
}

/**
 * The keys the interface builds at runtime, from the lists the renderer owns — the ones in
 * `shared/` are covered beside the bundles themselves.
 *
 * They are what a bundle loses quietly. `layerKind_text` was missing for as long as the text
 * tool has existed: drop a caption on a picture, select the layer, and the inspector read
 * `inspector.layerKind_text` where a word belongs.
 */
const COMPOSED_KEYS: readonly string[] = [
  // The three readings of a control map: the word on the segment, and what showing it gives.
  // One word per reading, shared by both script documents; the sentence beside it is each
  // format's own — « ce que la carte fait » is not « ce que le graphe joue ».
  ...INPUT_MAP_VIEWS.flatMap(view => [`game.scriptView.${view}`, `game.inputMap.viewHint.${view}`]),
  ...INPUT_PRESET_IDS.map(id => `game.inputMap.preset.${id}`),
  // The animation graph, whose editor speaks the same three views and reaches the inspector's
  // words for what a clip does — one vocabulary for one idea, checked on both sides.
  ...ANIMATION_GRAPH_VIEWS.map(view => `game.animationGraph.viewHint.${view}`),
  ...CLIP_SOURCES.map(kind => `game.animationGraph.clipKinds.${kind}`),
  'game.animationGraph.parameterKinds.number',
  'game.animationGraph.parameterKinds.boolean',
  // What each action of the built-in contexts DOES, plus the answer for a name of the project's
  // own — the question the editor used to leave unanswered on screen.
  ...DESCRIBED_ACTION_IDS.map(id => `game.inputMap.action.${id}`),
  'game.inputMap.action.custom',
  // What a model's conversion to glb could not carry — one sentence per loss, composed from the
  // row's own list.
  ...MESH_IMPORT_LOSSES.map(loss => `activity.importLoss.${loss}`),
  ...SCATTER_CATEGORIES.map(category => `world.scatterCategory_${category}`),
  ...GROUND_MATERIAL_CHANNELS.map(channel => `world.groundChannel_${channel}`),
  // Every optimization mode a person can choose, and every reason a node is left out of one.
  // Both are template literals, which `known-keys.i18n.test.ts` writes off as a blind spot.
  ...OPTIMIZATION_MODES.map(mode => `optimization.modes.${mode}`),
  ...OPTIMIZATION_WARNING_REASONS.map(reason => `optimization.warningReasons.${reason}`),
  // How a chain ended when it did not end by itself — composed from the turn's own field. Lost
  // from a bundle, the raw key lands where the one sentence saying a job was cut short belongs.
  'assistant.ending.halted',
  'assistant.ending.stopped',
  // The three sentences an empty centre offers, per space. They are the button AND the draft it
  // writes, so one gone missing puts a raw key on the largest surface of the window.
  ...Object.values(ASSISTANT_STARTERS).flat().map(starterKey),
  // One button per kind in the timeline's bar, and the label composed from the kind. The union
  // lives in the renderer, so its check does too — beside the list it derives from.
  ...TRACK_KINDS.map(kind => `timeline.addTrack.${kind}`),
  ...TRACK_KINDS.map(kind => `timeline.addTrackHint.${kind}`),
  // What answered a turn, in the journal — a cloud's name, or this machine. Missing, the line
  // reads « Envoyé à deepseek » where every other surface says « DeepSeek ».
  ...CLOUD_IDS.map(doorLabelKey),
  doorLabelKey('local'),
  // Every format a Save as… may offer, named in words rather than by extension — composed from
  // the same table the window draws its list from.
  ...DOCUMENT_KINDS.flatMap(kind => destinationFormatsFor(kind)).map(
    format => `documents.formats.${format}`,
  ),
  ...ADJUSTMENT_KINDS.map(kind => `adjustment.${kind}`),
  // Every humanoid role, group and side the transfer window names from a template literal: a
  // role lost from a bundle would put its raw key on every row of the bone mapping.
  ...HUMANOID_ROLES.map(role => `character.retarget.roles.${role}`),
  ...['torso', 'arms', 'legs', 'fingers'].map(group => `character.retarget.groups.${group}`),
  ...['source', 'target'].map(side => `character.retarget.${side}`),
  ...['source', 'target'].map(side => `character.retarget.${side}Alignment`),
  // What a format could not carry, named in the flatten dialogue. The PICTURE traits alone: the
  // image is the one kind with a `traitsOf`, so no other family can reach that sentence — the day
  // a second kind gains one, its traits belong here too.
  ...PICTURE_TRAITS.map(trait => `traits.${trait}`),
  // The sentence beside each of them. A menu row explains what it does, and the explanation is
  // composed the same way the label is — so it goes missing the same way, and is caught here.
  ...ADJUSTMENT_KINDS.map(kind => `adjustment.${kind}Hint`),
  // The label as well as the sentence, since the padlocks compose their key from `LOCK_KEYS`:
  // written out, the three labels were literals that `known-keys` read, and it no longer can.
  ...LAYER_LOCKS.map(padlock => padlock.labelKey),
  ...LAYER_LOCKS.map(padlock => `${padlock.labelKey}Hint`),
  ...LAYER_OPERATIONS.map(operation => `layers.${operation}Hint`),
  ...BLEND_MODES.map(mode => `blend.${mode}`),
  // What each group of flight keys is FOR, composed from the table the hint walks. A group with
  // no sentence would put a raw key over the viewport at the very moment the mode opens.
  ...NAVIGATION_HINT_GROUPS.map(group => `sceneNavigation.${group.key}`),
  ...LAYER_KINDS.map(kind => `inspector.layerKind_${kind}`),
  // Composed by the inspector's document face from the canvas's closed list.
  ...COLOR_MODES.map(mode => `inspector.colorMode_${mode}`),
  // One row per element type in the bar's flyout, and the same word again as the outliner's
  // fallback title for an element its author has not named — the commonest state of a new one.
  ...UI_ELEMENT_TYPES.map(type => `guiTools.types.${type}`),
  ...UI_ELEMENT_TYPES.map(type => `guiTools.typeHints.${type}`),
  // One row per canvas an interface can be composed for.
  ...UI_RESOLUTION_IDS.map(id => `guiTools.resolutions.${id}`),
  ...UI_RESOLUTION_IDS.map(id => `guiTools.resolutionHints.${id}`),
  // The four an interface opens on, in the window that names a new document.
  ...UI_TEMPLATE_IDS.map(id => `documents.uiTemplates.${id}`),
  ...UI_TEMPLATE_IDS.map(id => `documents.uiTemplateHints.${id}`),
  // Why a save wrote nothing — the two protections of the save path, composed from the refusal
  // itself. Missing, the one sentence explaining why ⌘S did nothing reads as its own key.
  ...SAVE_REFUSALS.map(refusal => `documents.${refusal}`),

  // Where a generation's source was taken from, written under its thumbnail. An origin with no
  // sentence would put a raw key on the one line saying what the studio is about to send.
  ...INPUT_ORIGINS.map(origin => `generation.sourceFrom_${origin}`),
  // What a shape layer is CALLED when the hand finishes drawing it. A kind with no name would
  // put a raw key in the stack, on the one row the user has to find the shape back by.
  ...SHAPE_KINDS.map(kind => `layers.shapeName_${kind}`),
  // What the inspector says an imported model IS. A state with no sentence would read as the
  // raw key on the one surface that tells a user their model cannot be animated yet.
  ...RIG_STATUSES.map(status => `inspector.rigStatus_${status}`),
  // Why a mesh cannot take a skeleton. Composed the same way, and it stands in for the button
  // itself: a fault with no sentence would leave the user a raw key where the offer used to be.
  ...RIG_FIT_FAULTS.map(fault => `inspector.rigFault_${fault}`),
  // Why an automatic rig gave up, composed from the code the engine answers. The inspector paints
  // it with NO fallback, so a key missing from a bundle shows the code itself to the person.
  ...AUTO_RIG_PRODUCT_ERRORS.map(code => `inspector.autoRigErrors.${code}`),
  // What that rig is busy with, on the status line's row.
  ...AUTO_RIG_PROGRESS_PHASES.map(phase => `tasks.phases.${phase}`),
  // The four answers to « what is this », in the dialogue that lays a skeleton.
  ...CHARACTER_KINDS.map(kind => `inspector.characterKinds.${kind}`),
  // Which half of a body a block drives. A part with no sentence would read as a raw key inside
  // the one control that makes two animations stack rather than average.
  ...BODY_PARTS.map(part => `inspector.clipPart_${part}`),
  // Whether a block moves the character or plays on the spot. Same control, same trap.
  ...ROOT_MOTIONS.map(motion => `inspector.rootMotion_${motion}`),
  // How a camera picks up speed along its rail. The only control of the shot section whose rows
  // are composed, so a fifth curve would read as a raw key inside a camera move.
  ...EASINGS.map(easing => `inspector.easing_${easing}`),
  ...TRACK_KINDS.map(kind => `inspector.kind_${kind}`),
  ...TRACK_FLAGS.map(flag => `inspector.${flag.key}`),
  ...LAYER_OPERATIONS.map(operation => `layers.${operation}`),
  ...PBR_CHANNELS.map(channel => `material.channel.${channel}`),
  // Every row of the menu that says where an asset may go.
  ...ASSET_INTENTS.map(intent => `${intent.labelKey}Hint`),
  // Which library a line of the remote browser came from. A source with no word would put a raw
  // key inside the one facet that decides what the panel READS rather than what it draws.
  ...SOURCES.map(source => `assets.sourceName.${source}`),
  // Everything a scene can gain: the panels' add menus draw the mesh and light families, and
  // the 3D bar's own add menu draws all three — `objects` included, which is why it is here.
  ...ADD_ENTRIES.flatMap(({ labelKey }) => [labelKey, `${labelKey}Hint`]),
  // The orders the explorer's bar offers, composed from the union rather than written beside it.
  ...FOLDER_SORTS.map(sort => `explorer.sort.${sort}`),
  ...WORKSPACE_IDS.map(workspace => `home.tools.${workspace}`),
  // The heading of each run of the file information window, composed from the section it draws.
  ...FILE_INFO_SECTIONS.map(id => `fileInfo.sections.${id}`),
  // What the disk answers an entry IS — composed from the fact, not written beside it.
  ...FILE_KINDS.map(kind => `fileInfo.kind.${kind}`),
  // Which of the three stores a copy sits in, and which rebuildable store a line measures —
  // composed from the unions rather than written beside them.
  ...COPY_STORES.map(store => `copies.store.${store}`),
  ...DERIVED_STORES.map(store => `copies.stores.${store}`),
  // The heading and the sentence of each shipped family, composed from the list itself.
  ...SHIPPED_FAMILIES.flatMap(family => [`shipped.${family}`, `shipped.${family}Note`]),
  // Why a gathering did nothing, composed from the reason the main process answers with.
  ...GATHER_REFUSALS.map(reason => `explorer.gatherRefused.${reason}`),
  // The rail label, built by `workspaceLabelKey` — the most visible string in the window, and
  // the one thing the workspace table does NOT make the compiler demand of a new space.
  ...WORKSPACE_IDS.map(workspace => `workspaces.${workspace}`),
  ...FOLDER_ROLES.map(roleLabelKey),
  // Why a typed name was refused, read off the failure the shared check answers with. The
  // compiler holds the other half — the record has one entry per failure or it does not build.
  ...Object.values(DOCUMENT_NAME_REFUSALS),
  // The two unions the 3D environment panel owns itself — the rest of its rows come from
  // `domain/scene` and are held next door. A sixth look or a fifth shadow level without its line
  // reads as its own key inside the panel that settles how a scene is lit.
  ...explained('environment.preset_', ENVIRONMENT_PRESETS),
  ...explained('environment.shadows_', SHADOW_LEVELS),
  // What a document of this kind is CALLED — the word a blank one is named after, « Scène 1 ».
  // A kind with no word would name every new document of that space `documents.kinds.x 1`.
  ...DOCUMENT_KINDS.map(kind => `documents.kinds.${kind}`),
  // The heading of the field that names it, one per kind for the article French puts in front —
  // and only for a kind one can MAKE: a character is opened on a model, never named into being.
  ...DOCUMENT_KINDS.filter(isMadeFromNothing).map(kind => `documents.newByKind.${kind}`),
  // What a new scene may open on: the tile's name, and the sentence that says what it holds. A
  // template with neither would read as its own id inside the window that offers it.
  ...SCENE_TEMPLATE_IDS.flatMap(id => [
    `documents.templates.${id}`,
    `documents.templateHints.${id}`,
  ]),
  ...SCENE_TEMPLATE_GROUPS.map(group => `documents.templateGroups.${group}`),
  // What stands between a model and this machine, said with the figures. Read off the table the
  // compiler holds one entry per obstacle in, so an obstacle added cannot arrive without a line.
  ...Object.values(FIT_DETAIL_KEYS),
  // What the manager's choices apply to. A third scope without its word would put a raw key in the
  // select that decides where every choice of that screen lands.
  ...CHOICE_SCOPES.map(scope => `aiModels.scope_${scope}`),
]

describe('the keys the renderer composes', () => {
  it.each(LANGUAGES.map(language => language.code))('are all named in %s', code => {
    for (const key of COMPOSED_KEYS) {
      const text = resolve(code, key)
      expect(typeof text === 'string' && text.trim() !== '', `${key} is missing`).toBe(true)
    }
  })
})

/**
 * A list that stands for a union has to cover it, or the walk above skips what it never reaches.
 * `LAYER_KINDS` is the one that matters here: it was written to close this very gap.
 */
describe('the lists behind those keys', () => {
  it('holds every kind a layer can be', () => {
    const all: Record<LayerKind, true> = {
      pixel: true,
      group: true,
      adjustment: true,
      text: true,
      shape: true,
    }

    expect([...LAYER_KINDS].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every operation the stack menu offers', () => {
    const all: Record<LayerOperation, true> = { group: true, ungroup: true, duplicate: true }

    expect([...LAYER_OPERATIONS].sort()).toEqual(Object.keys(all).sort())
  })

  // The only surface that says what the studio is about to SEND: an origin with no line here
  // stands under the raw key.
  it('holds every place a generation source can come from', () => {
    const all: Record<InputOrigin, true> = { explorer: true, scene: true, result: true }

    expect([...INPUT_ORIGINS].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every kind a track can be', () => {
    const all: Record<TrackKind, true> = { video: true, audio: true }

    expect([...TRACK_KINDS].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every reason a mesh cannot take a skeleton', () => {
    const all: Record<RigFitFault, true> = { noGeometry: true, lyingDown: true }

    expect([...RIG_FIT_FAULTS].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every reason an automatic rig gives up', () => {
    const all: Record<AutoRigProductError, true> = {
      MODEL_NOT_INSTALLED: true,
      MODEL_INVALID: true,
      ENGINE_UNAVAILABLE: true,
      UNSUPPORTED_PLATFORM: true,
      INVALID_MESH: true,
      NOT_HUMANOID: true,
      INFERENCE_FAILED: true,
      OUT_OF_MEMORY: true,
      CANCELLED: true,
    }

    expect([...AUTO_RIG_PRODUCT_ERRORS].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every phase an automatic rig passes through', () => {
    const all: Record<AutoRigProgressPhase, true> = {
      prepare: true,
      load: true,
      analyse: true,
      skeleton: true,
      pose: true,
      skinning: true,
      apply: true,
    }

    expect([...AUTO_RIG_PROGRESS_PHASES].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every state an imported model can be in', () => {
    const all: Record<RigStatus, true> = {
      staticMesh: true,
      skinnedMesh: true,
      riggedCharacter: true,
      animatedCharacter: true,
      skeletonOnly: true,
    }

    expect([...RIG_STATUSES].sort()).toEqual(Object.keys(all).sort())
  })

  it('holds every channel a material carries', () => {
    const all: Record<PbrChannel, true> = {
      baseColor: true,
      normal: true,
      roughness: true,
      metalness: true,
      ao: true,
      height: true,
      emissive: true,
      edge: true,
    }

    expect([...PBR_CHANNELS].sort()).toEqual(Object.keys(all).sort())
  })
})
