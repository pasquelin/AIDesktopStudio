import { describe, expect, it } from 'vitest'
import { ACTIVITY_LEVELS, ACTIVITY_MESSAGES, ACTIVITY_TOPICS } from '../domain/activity'
import { CLOUD_GROUPS, CLOUD_IDS } from '../domain/aiCloud'
import { COMPATIBILITIES } from '../domain/aiMemory'
import { STANDALONE_ROLES } from '../domain/aiRole'
import { TRACK_PROPERTIES } from '../domain/animation'
import { ASSET_BADGES } from '../domain/asset'
import { ASSISTANT_MODELS } from '../domain/assistant'
import { COMMAND_SCOPES } from '../domain/command'
import { COMPONENTS } from '../domain/componentRegistry'
import { STT_ERROR_CODES } from '../domain/dictation'
import { FILE_DOMAINS } from '../domain/fileRole'
import { SAFE_EXPORT_STEPS } from '../domain/gameExport'
import { GIT_CHANGES, GIT_FAILURE_KEYS, GIT_REF_KINDS, GIT_STAGES } from '../domain/git'
import { HOME_SECTION_IDS } from '../domain/home'
import { JOB_STATUSES } from '../domain/job'
import { localFieldKeys } from '../domain/localFields'
import { PBR_CHANNELS } from '../domain/material'
import { INGEST_STAGES } from '../domain/media'
import {
  CAPABILITIES_BY_FAMILY,
  MODEL_FAMILIES,
  MODEL_PERIODS,
  MODEL_SORTS,
  TAG_LABEL_KEY_LIST,
} from '../domain/model'
import { POST_PRESET_IDS } from '../domain/postPresets'
import {
  CAMERA_POST_MODES,
  POST_CATEGORIES,
  POST_COSTS,
  POST_EFFECT_IDS,
  POST_EFFECTS,
} from '../domain/postProcessing'
import { CONTEXT_TEMPLATES } from '../domain/projectContext'
import {
  BACKGROUND_KINDS,
  DISPLAY_MODES,
  DISPLAY_UNITS,
  ENVIRONMENT_KINDS,
  FOG_KINDS,
  HELPER_VISIBILITIES,
  TONE_MAPPINGS,
  VIEW_DIRECTIONS,
  VIEWPORT_QUALITIES,
} from '../domain/scene'
import { CAPTURE_QUALITIES } from '../domain/sceneCapture'
import { NAMED_KEYS } from '../domain/shortcut'
import { TOOL_PLACEMENTS } from '../domain/tool'
import { tripoFieldKeys } from '../domain/tripo'
import { USAGE_ACTIONS, USAGE_ASSET_KINDS, USAGE_EVENT_ACTIONS } from '../domain/usage'
import { isRecord } from '../guards'
import { LOG_SCOPES } from '../ipc'
import { LANGUAGES, TRANSLATIONS, type Language } from './index'

const flatten = (bundle: unknown, prefix = '', into = new Map<string, string>()) => {
  if (!isRecord(bundle)) return into
  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (isRecord(value)) flatten(value, key, into)
    else into.set(key, String(value))
  }
  return into
}

const holes = (value: string): readonly string[] =>
  [...value.matchAll(/\{\{[^}]+\}\}/g)].map(match => match[0]).sort()

const orderOf = (bundle: unknown, prefix = '', into: string[] = []): string[] => {
  if (!isRecord(bundle)) return into
  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    into.push(key)
    if (isRecord(value)) orderOf(value, key, into)
  }
  return into
}

const CODES = LANGUAGES.map(language => language.code)
const BUNDLES: Record<Language, Map<string, string>> = {
  fr: flatten(TRANSLATIONS.fr),
  en: flatten(TRANSLATIONS.en),
}

/** Every key, nested ones included, in the order the file writes them. */
describe('what the guards would catch', () => {
  it('sees a hole renamed from one language to the other', () => {
    expect(holes('{{count}} assets')).not.toEqual(holes('{{n}} assets'))
  })

  // The format belongs to the hole: one language grouping its thousands and the other not.
  it('sees a number formatter dropped on one side', () => {
    expect(holes('{{units, number}} CU')).not.toEqual(holes('{{units}} CU'))
  })

  it('reads the holes of a sentence in a stable order, whatever the sentence does with them', () => {
    expect(holes('{{a}} then {{b}}')).toEqual(holes('{{b}}, and {{a}} before it'))
  })

  it('sees two bundles that stopped lining up', () => {
    expect(orderOf({ a: 1, b: 2 })).not.toEqual(orderOf({ b: 2, a: 1 }))
  })

  it('walks into the nested keys rather than stopping at the first level', () => {
    expect([...flatten({ panel: { title: 'Assets' } }).keys()]).toEqual(['panel.title'])
  })
})

/**
 * The label AND the sentence beside it, which is the shape `choicesOf` composes: a union whose
 * values each explain themselves goes missing in two ways, never one.
 */
function explained(prefix: string, values: readonly string[]): string[] {
  return values.flatMap(value => [`${prefix}${value}`, `${prefix}${value}Hint`])
}

/**
 * Keys the interface builds at runtime — `t(`assetTypes.${type}`)` and its like. A value added
 * to one of these unions and forgotten in the bundles shows the user the key itself, and no
 * amount of typechecking sees it: the key exists only once the template has run.
 */
const DYNAMIC_KEYS: readonly string[] = [
  // Every SAFE step the export dialogue lists, read off the exporter's own list rather than
  // written out as seven literals beside it. A step gained without its line reads as its key.
  ...SAFE_EXPORT_STEPS.map(step => `game.export.${step}`),
  // The three sentences `tripoRigCheckNote` composes for a job's row. Nothing reads them as a
  // literal any more — the runner names one, and the window translates whatever it is handed.
  'tripoRigCheck.riggable',
  'tripoRigCheck.riggableAs',
  'tripoRigCheck.notRiggable',
  // `FILE_DOMAINS` and not `ASSET_TYPES`: the same six, plus the one a file has when the studio
  // has no domain to file it under — an explorer shows those too, and « other » is an answer
  // rather than a failure to classify.
  ...FILE_DOMAINS.map(domain => `assetTypes.${domain}`),
  ...ASSET_BADGES.map(badge => `assets.badge.${badge}`),
  ...MODEL_FAMILIES.map(family => `families.${family}`),
  ...MODEL_FAMILIES.flatMap(family =>
    CAPABILITIES_BY_FAMILY[family].map(capability => `capabilities.${capability}`),
  ),
  // The facet menu reads these through a table rather than through a template, so a key here is
  // already a literal. It is listed all the same: the check beside the table only proves every
  // tag HAS a key, and a key naming nothing would still read as itself on screen.
  ...TAG_LABEL_KEY_LIST,
  // Three unions the interface composed without a net. Every value is translated today; what
  // was missing is the check that says so the day a fourth is added — a value without its line
  // shows the user the key itself.
  ...TRACK_PROPERTIES.map(property => `animation.${property}`),
  ...HOME_SECTION_IDS.map(id => `home.sections.${id}`),
  ...[...new Set(TOOL_PLACEMENTS.map(placement => placement.id))].map(id => `panels.${id}`),
  // Every word the component registry names, read off the registry itself. A third component,
  // or a fourth value of a choice, arrives with its lines or this goes red — the descriptor is
  // read through `t(<variable>)` from the add menu, the section heading and every field label,
  // so nothing else would see it.
  ...Object.values(COMPONENTS).flatMap(descriptor => [
    descriptor.titleKey,
    descriptor.descriptionKey,
    ...descriptor.fields.map(field => field.labelKey),
    ...descriptor.fields.flatMap(field => (field.options ?? []).map(one => `game.values.${one}`)),
  ]),
  // The ways into a first context card, read off the list rather than off a literal: a model
  // added without its two lines would offer the reader its own key as a menu row.
  ...CONTEXT_TEMPLATES.flatMap(template => [template.titleKey, template.bodyKey]),
  // The six sides and the seven ways of drawing them. Composed on BOTH sides now — the 3D bar
  // offers them as modes, and the native View menu offers a row each — which is exactly why the
  // lists moved here: a menu is built in the main process, out of reach of the renderer's guard.
  ...VIEW_DIRECTIONS.flatMap(direction => [
    `sceneViews.${direction}`,
    `sceneViews.${direction}Hint`,
  ]),
  ...explained('sceneDisplay.', DISPLAY_MODES),
  // The definitions the capture row offers. Composed in the MAIN process, out of reach of the
  // renderer's guard — a fifth one without its line would read as its own key inside a menu.
  ...CAPTURE_QUALITIES.map(quality => `sceneCaptureQualities.${quality}`),
  // The unions of `domain/scene` the 3D inspector composes a label AND a sentence from, none of
  // them listed until now: a value without its line reads as its own key, on the very rows a
  // select explains itself with.
  ...explained('environment.source_', ENVIRONMENT_KINDS),
  ...explained('environment.background_', BACKGROUND_KINDS),
  ...explained('environment.fog_', FOG_KINDS),
  ...explained('environment.tone_', TONE_MAPPINGS),
  ...explained('environment.visibility_', HELPER_VISIBILITIES),
  ...explained('environment.quality_', VIEWPORT_QUALITIES),
  ...explained('environment.unit_', DISPLAY_UNITS),
  // The composition catalogue, composed on three sides at once — the stack rows, the library and
  // the inspector's generated controls. An effect added without its two lines would offer the
  // reader its own identifier as a row of the Add menu.
  ...explained('postfx.effect_', POST_EFFECT_IDS),
  ...POST_CATEGORIES.map(category => `postfx.category_${category}`),
  ...POST_COSTS.map(cost => `postfx.cost_${cost}`),
  ...explained('postfx.mode_', CAMERA_POST_MODES),
  ...POST_PRESET_IDS.map(preset => `postfx.preset_${preset}`),
  // Every parameter of every effect, and every value of every closed list one offers. The panel
  // is GENERATED from the catalogue, so a knob without a line is a knob labelled by its own key.
  ...POST_EFFECT_IDS.flatMap(effect =>
    Object.keys(POST_EFFECTS[effect].params).map(param => `postfx.param_${param}`),
  ),
  ...POST_EFFECT_IDS.flatMap(effect =>
    Object.values(POST_EFFECTS[effect].params).flatMap(spec =>
      spec.control === 'choice' ? spec.options.map(option => `${spec.labelPrefix}${option}`) : [],
    ),
  ),
  ...MODEL_PERIODS.map(period => `periods.${period}`),
  ...MODEL_SORTS.map(sort => `sorts.${sort}`),
  ...ACTIVITY_LEVELS.map(level => `activity.levels.${level}`),
  ...ACTIVITY_TOPICS.map(topic => `activity.topics.${topic}`),
  // The lines the main process writes. The window draws them with `t(entry.messageKey)`, a call
  // whose key is a variable: no AST guard resolves it, and the renderer's stops at its own glob.
  ...ACTIVITY_MESSAGES.map(name => `activity.${name}`),
  // Written by the main process into the journal, so the miss surfaces long after the failure
  // that caused it — `font.face` shipped untranslated and read as its own key on screen.
  ...LOG_SCOPES.map(scope => `activity.scope.${scope}`),
  // Shown inside a tooltip and in the shortcuts screen, where a missing one reads as the
  // English key name rather than as an obviously broken key.
  ...NAMED_KEYS.map(key => `keys.${key}`),
  // The heading over each group of the shortcuts screen. A ninth surface added to the union
  // would title its group with the key itself, and nothing else looks at this family.
  ...COMMAND_SCOPES.map(scope => `settings.scope.${scope}`),
  // The two pipelines the user watches run: a stage or a status added without its line
  // turns the progress row into a raw code at the exact moment something is happening.
  ...JOB_STATUSES.map(status => `jobs.status.${status}`),
  ...INGEST_STAGES.map(stage => `ingest.${stage}`),
  // The version panel groups by stage and names the change in each row's hint, both composed
  // from the union. A value without its line puts the raw word — `untracked` — where a heading
  // belongs. The BADGE is not here: its letter is git's own, and it lives in `GIT_CHANGE_BADGES`.
  ...GIT_STAGES.map(stage => `git.stage.${stage}`),
  ...GIT_CHANGES.map(change => `git.change.${change}`),
  // The three kinds of name a commit can carry, each drawn as its own badge.
  ...GIT_REF_KINDS.map(kind => `git.ref.${kind}`),
  // Why git did not answer. The compiler holds the other half — see `GIT_FAILURE_KEYS`.
  ...Object.values(GIT_FAILURE_KEYS),
  /**
   * The models the assistant may think with, named in the picker of its own modal.
   *
   * Here rather than trusted to `exhaustive.test.ts`, which proves the LIST covers the union and
   * says nothing about the bundles: a fifth model added there and forgotten here would read as
   * `gemini-4-flash` in an otherwise French list — the family of defect the usage report already
   * shipped once, with `images-generation` sitting in a French table.
   */
  ...ASSISTANT_MODELS.map(model => `assistant.models.${model}`),
  // Composed from the shared PBR union to name a link row of the material inspector. This family
  // has no compiler guard, so a ninth channel — and the domain warns the API adds types without
  // notice — would label its row with its own key.
  ...PBR_CHANNELS.map(channel => `material.channel.${channel}`),
  // The usage report showed what the API called things — `images-generation` sat in a French
  // table, and `video` beside a `Vidéo` the bundle already knew.
  ...USAGE_ACTIONS.map(action => `usage.actionNames.${action}`),
  // The journal's own union, wider: what happened, not only what was billed.
  ...USAGE_EVENT_ACTIONS.map(action => `usage.actionNames.${action}`),
  ...USAGE_ASSET_KINDS.map(kind => `usage.assetKinds.${kind}`),
  // What the microphone answered, said in the language of whoever is reading. The detail of a
  // failure never reaches the screen — it names a file path — so the code is all there is.
  ...STT_ERROR_CODES.map(code => `dictation.errors.${code}`),
  // The employments no space holds. The generation ones are named by `families` and
  // `capabilities` above, which the manager reuses rather than opening a second vocabulary.
  ...STANDALONE_ROLES.map(role => `aiRoles.${role}`),
  // The verdict the machine returns on a model. A value without its word would put a raw key on
  // the one line that says whether an AI can run here at all.
  ...COMPATIBILITIES.map(fit => `aiModels.fit.${fit}`),
  // A cloud is named by its REGISTRY entry, so the second one to arrive needs no code change —
  // and no line here either. Without its two keys it would offer itself as `aiClouds.x`.
  ...CLOUD_IDS.flatMap(id => [`aiClouds.${id}`, `aiClouds.${id}Hint`]),
  // Composed by the add form, which groups the picker rather than listing nine services flat.
  ...CLOUD_GROUPS.map(group => `aiCloudGroups.${group}`),
  /**
   * Every label of a form the studio DERIVES rather than fetches — the knobs of a local model,
   * and those of the cloud whose catalogue is data. Both are read through `translate(<variable>)`
   * in the main process, out of reach of the renderer's guard, so a knob without its line reaches
   * the panel as `tripoFields.pbr`.
   */
  ...localFieldKeys(),
  ...tripoFieldKeys(),
]

/**
 * i18next appends a plural category to the key it looks up, so a caller writing `pushed` reads a
 * bundle holding `pushed_one` and `pushed_other`. Until the journal's keys were listed here, every
 * dynamic key happened to be singular and the exact lookup was enough.
 *
 * `_other` and nothing else: CLDR gives it to every language, so a key carrying only `_one` is
 * one a plural draws as itself — which is the defect this file exists to catch, not to excuse.
 */
function named(code: Language, key: string): boolean {
  const written = (form: string): boolean =>
    (BUNDLES[code].get(`${key}${form}`)?.trim() ?? '') !== ''
  return written('') || written('_other')
}

describe('the keys the interface composes', () => {
  it.each(CODES)('names every value of every listed union in %s', code => {
    for (const key of DYNAMIC_KEYS) {
      expect(named(code, key), `${key} is missing`).toBe(true)
    }
  })

  it('takes a key the bundle only holds in plural form', () => {
    expect(named('fr', 'activity.pushed')).toBe(true)
    expect(named('fr', 'activity.thereIsNoSuchKey')).toBe(false)
  })
})

/**
 * Every `activity.scope.*` line is written at `level: 'error'` — `reportFailure` hard-codes it and
 * is the only caller — and it reaches the reader as a toast before it is a journal row. So the
 * sentence has one job: say that something failed.
 *
 * `scene.render` said `Rendu vidéo` / `Video render` for a year. A neutral noun phrase, the only
 * one of the twenty-nine, announcing nothing at the exact moment a render had just died. The
 * guard above it saw nothing: `DYNAMIC_KEYS` asks that the key EXISTS and is not blank, never
 * what it says.
 *
 * The wordings are listed rather than pattern-matched, because no cheap test tells a failure
 * sentence from a title. Two alternatives were measured and dropped: a value colliding with an
 * action label catches nothing (`animation.render` reads `Rendre en vidéo`, no collision at all),
 * and a minimum word count is arbitrary. Listing them costs one line the day a new phrasing is
 * written — the same upkeep `DYNAMIC_KEYS` already asks for, and an added line is a line a
 * reviewer reads.
 *
 * What this does NOT catch, and it is the important half: whether the sentence is TRUE.
 * `assets.open` used to say `Cet asset n'a nulle part où aller` and passed here, while covering
 * one of the six causes that raised it — two of which were not failures to open at all. It took
 * splitting the scope to fix, and this guard was green throughout. Announcing a failure and
 * describing the right one are two different jobs; only the first is machine work.
 *
 * Nor does the second test catch a wording made too WIDE — `/./` would pass both tests and empty
 * the guard in one line. It rules out dead entries, not dilution: "can only shrink" is about the
 * list growing into a catalogue, and says nothing about a regex that stopped being specific.
 *
 * And the list is a GRAMMAR, which is the price paid here: `Impossible de…`, `Échec de…` and
 * `Failed to…` are all correct French and English, and none of them can be pre-authorised —
 * the second test drops any wording no line uses yet. A new phrasing is a line added under a
 * reviewer's eyes, deliberately, rather than a sentence that quietly announces nothing.
 */
const FAILURE_WORDINGS: Record<Language, readonly RegExp[]> = {
  fr: [/a échoué/, /n’a pas pu/, /n’ont pas pu/, /a perdu/, /était illisible/],
  // Not `/ failed\b/`: the leading space and the case made `Failed to open…` a false red, which
  // is how English states a failure most often. Same eight lines matched either way.
  en: [/\bfailed\b/i, /could not/, /lost one of/],
}

describe('the failures the journal reports', () => {
  it.each(CODES)('says that something failed, in every scope line, in %s', code => {
    const silent = LOG_SCOPES.filter(scope => {
      const text = BUNDLES[code].get(`activity.scope.${scope}`) ?? ''
      return !FAILURE_WORDINGS[code].some(wording => wording.test(text))
    })

    expect(silent).toEqual([])
  })

  // A wording that stopped matching any line is one nobody would think to delete, and the list
  // would drift into a catalogue of everything ever written. It can only shrink on its own.
  it.each(CODES)('drops a wording once no scope line uses it in %s', code => {
    const idle = FAILURE_WORDINGS[code]
      .filter(
        wording =>
          !LOG_SCOPES.some(scope =>
            wording.test(BUNDLES[code].get(`activity.scope.${scope}`) ?? ''),
          ),
      )
      .map(wording => wording.source)

    expect(idle).toEqual([])
  })
})

/**
 * The one gesture that silenced the whole arrangement, found by review: setting a translatable
 * tag to `null` left sixty-one tests green and abandoned its `modelTags.*` line in both bundles,
 * read by nobody. The table's guard only asks that every tag HAS an answer — `null` is one.
 *
 * So the orphan is what gets forbidden. A tag turned silent now fails here, at the line it left
 * behind, which is also the check that catches a key renamed on one side only.
 */
