import {
  CUSTOM_DOLLIES,
  CUSTOM_ORBITS,
  CUSTOM_PANS,
  FLY_MODES,
  NAVIGATION_PRESETS,
} from '@shared/domain/navigationPreset'
import { currentModelFamily } from '@shared/domain/model'
import { LANDING_CHOICES } from '@shared/domain/settings'
import { isRecord, mapKeys } from '@shared/guards'
import { z } from 'zod'
import { isCloudProviderId } from '@shared/domain/aiCloud'
import { currentAiRoleKey, type RoleProvider } from '@shared/domain/aiRole'
import { ASSISTANT_MODELS } from '@shared/domain/assistant'
import { ASSISTANT_STEPS_DEFAULT, assistantStepsWithin } from '@shared/domain/assistantSteps'
import { LANGUAGE_PREFERENCES } from '@shared/i18n/languages'
import {
  DENSITIES,
  LOG_VERBOSITIES,
  SETTINGS_SECTION_IDS,
  STARTUP_BEHAVIOURS,
  THEMES,
  type PartialSettings,
  type SettingsSectionId,
} from '@shared/domain/settings'
import { boundsOf, SETTING_ACTION_IDS, type SettingActionId } from '@shared/domain/settingsRegistry'
import { DICTATION_MODES } from '@shared/domain/dictation'
import { isSignature } from '@shared/domain/shortcut'
import { HOME_SECTION_IDS } from '@shared/domain/home'
import { RECENT_DOCUMENTS_MAX, RECENT_PROJECTS_MAX } from '@shared/domain/project'
import { isDocumentKind, type DocumentKind } from '@shared/domain/document'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import {
  DISPLAY_UNITS,
  HELPER_VISIBILITIES,
  NORMAL_LENGTH,
  SHADOW_MAP_SIZES,
  SHADOW_QUALITIES,
  VIEWPORT_QUALITIES,
} from '@shared/domain/scene'
import { HEX_COLOR } from '@shared/domain/color'
import { localModelSchema } from '@main/ai/localModelSchema'
import { migratedRoleChoices } from './migratedRoleChoices'
export {
  parseAccountId,
  parseAccountName,
  parseCloudProviderId,
  parseCredentials,
  parseStoredAccounts,
  parseStoredCredentials,
} from './credentialsValidation'

// Built from the shared unions, never retyped — the same reason `provider/validation.ts` gives:
// a hand-copied list silently stops accepting what the panel offers.
const scale = boundsOf('appearance.fontScale')

// The shape itself is shared with the document readers — the reason it is six digits lives with
// it, and a setting must not accept what a a sky document refuses.
const hexColor = z.string().regex(HEX_COLOR)

const appearance = z.object({
  theme: z.enum(THEMES).optional(),
  density: z.enum(DENSITIES).optional(),
  accent: hexColor.optional(),
  // Not `.int()`, unlike the job counts: this one is a slider with a 0.05 step.
  fontScale: z.number().min(scale.min).max(scale.max).optional(),
  reduceMotion: z.boolean().optional(),
})

// Read from the registry, never restated: the bounds a screen offers and the ones this refuses
// are the same numbers, so a ceiling can no longer be lowered on one side alone. The shape,
// however, is still enumerated below — a leaf added to the registry and forgotten here is
// stripped on write rather than validated.
const jobs = boundsOf('generation.concurrentJobs')
const retries = boundsOf('generation.maxRetries')

const generation = z.object({
  concurrentJobs: z.number().int().min(jobs.min).max(jobs.max).optional(),
  maxRetries: z.number().int().min(retries.min).max(retries.max).optional(),
  // What the same branch held before employments carried the preference. Read only to be
  // MIGRATED below — never written again. Keys are families and values model ids, both free
  // strings: the API added models on its own schedule and an unknown one must not fail a read.
  defaultModels: z.record(z.string().min(1), z.string().min(1)).optional(),
  captionArrivals: z.boolean().optional(),
  landing: z.enum(LANDING_CHOICES).optional(),
})

const recentProject = z.object({
  path: z.string().min(1),
  /**
   * 🛑 No `name`, and required it emptied every setting: a project is named by its FOLDER, so
   * nothing writes one any more — and this schema refusing the entry made `salvagePartialSettings`
   * answer `{}` for the WHOLE file. Theme, keys, shortcuts and shelf, gone on the next write.
   */
  openedAt: z.string().min(1),
  // Optional, and it has to stay so: a file written before 13 August carries no such field, and
  // requiring it would fail validation for every entry a user already had.
  createdAt: z.string().min(1).optional(),
})

const recentDocument = z.object({
  project: z.string().min(1),
  path: z.string().min(1),
  // Through the domain's own guard rather than a re-listed enum: one list of the kinds.
  kind: z.custom<DocumentKind>(isDocumentKind),
  openedAt: z.string().min(1),
})

const storage = z.object({
  backend: z.enum(['local', 'cloud']).optional(),
  projectsFolder: z.string().min(1).optional(),
  lastProject: z.string().min(1).optional(),
  // Bounded here as well as where it is written: the list is session state a hand-edited file
  // could grow without limit, and the home draws every entry it is given.
  recentProjects: z.array(recentProject).max(RECENT_PROJECTS_MAX).optional(),
  // Same bound and same reason as above. A kind this build has never heard of drops the ENTRY
  // rather than the branch: an unknown glyph is worse than a row that is not offered.
  recentDocuments: z.array(recentDocument).max(RECENT_DOCUMENTS_MAX).optional(),
  // Declared here or dropped in silence: a zod object STRIPS what it does not name, and this
  // branch is reparsed on every settings write — which the project store does on every document
  // saved. The links would survive exactly until the next one.
  projectAccounts: z.record(z.string().min(1), z.string().min(1)).optional(),
})

// Not checked for existence here: a path typed while the binary is not plugged in yet must be
// storable, and `resolveFfmpeg` falls through to the PATH when it does not resolve.
const media = z.object({ ffmpegPath: z.string().min(1).optional() })

const git = z.object({
  binary: z.string().min(1).optional(),
  userName: z.string().min(1).optional(),
  userEmail: z.string().min(1).optional(),
})

const general = z.object({
  language: z.enum(LANGUAGE_PREFERENCES).optional(),
  startup: z.enum(STARTUP_BEHAVIOURS).optional(),
  autosave: z.boolean().optional(),
})

const input = z.object({ gamepadNavigation: z.boolean().optional() })

const homeSection = z.object({
  id: z.enum(HOME_SECTION_IDS),
  visible: z.boolean(),
})

/*
 * Caught at the branch as well as at the element, for the reason spelled out under `workspaces`:
 * a section this build no longer knows is dropped rather than made a reason to refuse the whole
 * write, and a `sections` that is not even an array must cost the arrangement and nothing else.
 * `visibleHomeSections` drops the unknown ones a second time, and is the one that has to —
 * nothing guarantees the file went through here.
 */
const home = z
  .object({
    enabled: z.boolean().optional(),
    news: z.boolean().optional(),
    sections: z
      .array(homeSection.nullable().catch(null))
      .transform(entries => entries.filter(entry => entry !== null))
      .catch([])
      .optional(),
  })
  .catch({})

/*
 * Caught at the branch, not only at the element: a malformed `order` must cost the arrangement
 * and nothing else. Before this branch existed the key was simply stripped, so making it able
 * to send the whole file back to its defaults would be a regression this list introduced.
 *
 * A written order is always a reconciled one, so it can never legitimately outgrow the registry.
 */
const workspaces = z
  .object({
    order: z
      .array(z.enum(WORKSPACE_IDS).nullable().catch(null))
      .max(WORKSPACE_IDS.length)
      .transform(ids => ids.filter(id => id !== null))
      .catch([])
      .optional(),
  })
  .catch({})

const grid = boundsOf('three.gridSize')
const fly = boundsOf('three.flySpeed')
const boost = boundsOf('three.boostFactor')
const lens = boundsOf('three.fieldOfView')
const moveStep = boundsOf('three.snapTranslate')
const turnStep = boundsOf('three.snapRotate')
const scaleStep = boundsOf('three.snapScale')
const surfaceOffset = boundsOf('three.snapSurfaceOffset')
const handles = boundsOf('three.gizmoSize')

const three = z.object({
  showGrid: z.boolean().optional(),
  gridSize: z.number().int().min(grid.min).max(grid.max).optional(),
  navigationPreset: z.enum(NAVIGATION_PRESETS).optional(),
  navigationCustomOrbit: z.enum(CUSTOM_ORBITS).optional(),
  navigationCustomPan: z.enum(CUSTOM_PANS).optional(),
  navigationCustomDolly: z.enum(CUSTOM_DOLLIES).optional(),
  navigationCustomFly: z.enum(FLY_MODES).optional(),
  orbitAroundSelection: z.boolean().optional(),
  orbitUnderCursor: z.boolean().optional(),
  flySpeed: z.number().min(fly.min).max(fly.max).optional(),
  boostFactor: z.number().min(boost.min).max(boost.max).optional(),
  fieldOfView: z.number().min(lens.min).max(lens.max).optional(),
  snapTranslate: z.number().min(moveStep.min).max(moveStep.max).optional(),
  snapRotate: z.number().min(turnStep.min).max(turnStep.max).optional(),
  snapScale: z.number().min(scaleStep.min).max(scaleStep.max).optional(),
  gizmoSize: z.number().min(handles.min).max(handles.max).optional(),
  snapSurfaceAlign: z.boolean().optional(),
  snapSurfaceOffset: z.number().min(surfaceOffset.min).max(surfaceOffset.max).optional(),
  shadows: z.boolean().optional(),
  shadowQuality: z.enum(SHADOW_QUALITIES).optional(),
  // Read from the shared list, never retyped: what the panel offers and what this refuses have
  // to be the same numbers.
  shadowMapSize: z
    .number()
    .refine(value => SHADOW_MAP_SIZES.includes(value))
    .optional(),
  quality: z.enum(VIEWPORT_QUALITIES).optional(),
  lightHelpers: z.enum(HELPER_VISIBILITIES).optional(),
  cameraHelpers: z.enum(HELPER_VISIBILITIES).optional(),
  boundingBoxes: z.enum(HELPER_VISIBILITIES).optional(),
  origins: z.boolean().optional(),
  normals: z.boolean().optional(),
  normalLength: z.number().min(NORMAL_LENGTH.min).max(NORMAL_LENGTH.max).optional(),
  stats: z.boolean().optional(),
  units: z.enum(DISPLAY_UNITS).optional(),
})

/**
 * Keys are command ids and values signatures. Checked in shape rather than merely non-empty:
 * `Signature` is a string, so `'P'` written where `'KeyP'` was meant arrives here typechecked,
 * and a code is a position while a letter is not — the binding would never fire, with nothing
 * anywhere saying why.
 *
 * One unreadable remap costs its own line and nothing else, as `home.sections` does above: a
 * build that no longer knows a command, or a key bound under an older version, must not take
 * the theme and the projects folder down with it. The whole draft goes through one `safeParse`.
 */
const shortcuts = z.object({
  overrides: z
    .record(z.string().min(1), z.string().refine(isSignature).nullable().catch(null))
    .transform(entries =>
      Object.fromEntries(Object.entries(entries).filter(([, bound]) => bound !== null)),
    )
    .optional(),
})

const advanced = z.object({ logLevel: z.enum(LOG_VERBOSITIES).optional() })

// Enumerated rather than left a string: a model the API does not serve is answered with a 400,
// and the panel that writes this offers a fixed list — so anything else came from a hand-edited
// file, and the defaults are a better answer than a failing assistant.
const assistant = z.object({
  model: z.enum(ASSISTANT_MODELS).optional(),
  /**
   * Free text where the model above is enumerated: each cloud names its own, and the field that
   * writes this offers no list. Unknown ids are DROPPED rather than refused — a cloud that left
   * the registry costs its line, where a `refine` on the key would reset the whole file.
   */
  cloudModels: z
    .record(z.string().min(1), z.string().max(200).catch(''))
    .transform(entries =>
      Object.fromEntries(
        Object.entries(entries).filter(([id, name]) => isCloudProviderId(id) && name.trim() !== ''),
      ),
    )
    .optional(),
  // Clamped rather than refused: a hand-edited zero is a chain that can never run one round, and
  // a hand-edited thousand is a bill. `boundsOf` reads the registry, so the field and the file
  // cannot disagree.
  steps: z.number().int().catch(ASSISTANT_STEPS_DEFAULT).transform(assistantStepsWithin).optional(),
})

const onboarding = z.object({
  version: z.number().int().min(0).optional(),
  completedAt: z.string().min(1).optional(),
})

const mcp = z.object({
  enabled: z.boolean().optional(),
  delegateFiles: z.boolean().optional(),
  delegateAsset: z.boolean().optional(),
  delegateRemote: z.boolean().optional(),
  // Bounded here as well as by the field: a budget arrived at through the file rather than through
  // the window is still a budget somebody has to be able to read back.
  delegateBudget: z.number().min(0).max(10_000).optional(),
})

const silence = boundsOf('dictation.silenceMs')
const preview = boundsOf('dictation.previewMs')
const threads = boundsOf('dictation.threads')
const idleUnload = boundsOf('dictation.idleUnloadMinutes')

const dictation = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(DICTATION_MODES).optional(),
  silenceMs: z.number().int().min(silence.min).max(silence.max).optional(),
  previewMs: z.number().int().min(preview.min).max(preview.max).optional(),
  threads: z.number().int().min(threads.min).max(threads.max).optional(),
  idleUnloadMinutes: z.number().int().min(idleUnload.min).max(idleUnload.max).optional(),
  modelFolder: z.string().min(1).optional(),
  // A device id from a machine whose microphones have since changed is stored all the same:
  // the capture falls back to the default rather than refusing to record.
  inputDeviceId: z.string().min(1).optional(),
})

/**
 * A provider, as narrow as the union it mirrors: a `kind` this does not name is dropped rather
 * than stored, so a hand-edited file cannot point a role at something nothing can serve.
 *
 * Exported because the IPC gate parses the very same shape (`main/ai/validation.ts`), and two
 * spellings of it would let a choice pass the door and be stripped by the store.
 */
export const roleProvider = z.union([
  z.object({ kind: z.literal('local'), modelId: z.string().min(1) }),
  // The id is checked against the REGISTRY, so a cloud added is stored without touching this and
  // a cloud removed stops being read back — a role then falls back rather than pointing nowhere.
  z.object({
    kind: z.literal('cloud'),
    providerId: z.string().refine(id => isCloudProviderId(id)),
  }),
])

/**
 * One unreadable choice costs its own line and nothing else, exactly as `shortcuts.overrides`
 * above: the whole file goes through ONE `safeParse`, so without the `.catch` a single role
 * pointing at a cloud that has since left the registry — the case this schema's own note
 * advertises — would reset the theme, the projects folder and every binding along with it.
 */
const roleChoices = z
  .record(z.string().min(1), roleProvider.nullable().catch(null))
  .transform(entries =>
    Object.fromEntries(
      // Predicated rather than plain: a bare filter leaves `null` in the value type, and the
      // stored shape has no room for one.
      Object.entries(entries).filter((entry): entry is [string, RoleProvider] => entry[1] !== null),
    ),
  )

// Declared here or dropped in silence, the same trap `storage.projectAccounts` carries: a zod
// object STRIPS what it does not name, and this branch is reparsed on every settings write.
const ai = z.object({
  roles: roleChoices.optional(),
  projectRoles: z.record(z.string().min(1), roleChoices).optional(),
  // `.catch([])` for the reason `roleChoices` carries its own: one hand-edited manifest must not
  // reset the theme, the projects folder and every binding along with it.
  ownModels: z.array(localModelSchema).catch([]).optional(),
})

const partialSettingsShape = z.object({
  ai: ai.optional(),
  general: general.optional(),
  home: home.optional(),
  workspaces: workspaces.optional(),
  appearance: appearance.optional(),
  generation: generation.optional(),
  input: input.optional(),
  storage: storage.optional(),
  three: three.optional(),
  shortcuts: shortcuts.optional(),
  media: media.optional(),
  git: git.optional(),
  advanced: advanced.optional(),
  assistant: assistant.optional(),
  mcp: mcp.optional(),
  onboarding: onboarding.optional(),
  dictation: dictation.optional(),
})

/**
 * A family renamed since this file was written, brought up to date BEFORE any shape above reads
 * it — a family name is half of four stored keys, and every one of them fails QUIETLY.
 *
 * `ownModels` carries `.catch([])`, so a single stale `family` blanks the whole list; a stale role
 * key reads as "no choice made"; a stale `defaultModels` entry never reaches `migratedRoleChoices`.
 * Idempotent, so it runs on what the renderer sends as readily as on what the disk holds.
 */
function withCurrentFamilies(value: unknown): unknown {
  if (!isRecord(value)) return value

  const brought: Record<string, unknown> = { ...value }
  if (isRecord(value.ai)) brought.ai = currentAi(value.ai)
  if (isRecord(value.generation) && isRecord(value.generation.defaultModels)) {
    brought.generation = {
      ...value.generation,
      defaultModels: mapKeys(value.generation.defaultModels, currentModelFamily),
    }
  }

  return brought
}

function currentAi(ai: Record<string, unknown>): Record<string, unknown> {
  const brought: Record<string, unknown> = { ...ai }
  if (isRecord(ai.roles)) brought.roles = mapKeys(ai.roles, currentAiRoleKey)
  if (isRecord(ai.projectRoles)) {
    brought.projectRoles = Object.fromEntries(
      Object.entries(ai.projectRoles).map(([project, roles]) => [
        project,
        isRecord(roles) ? mapKeys(roles, currentAiRoleKey) : roles,
      ]),
    )
  }
  if (Array.isArray(ai.ownModels)) brought.ownModels = ai.ownModels.map(currentOwnModel)

  return brought
}

function currentOwnModel(model: unknown): unknown {
  if (!isRecord(model)) return model

  const brought: Record<string, unknown> = { ...model }
  // 🛑 A motion used to be a `mesh` that a `fieldProfile` took back, and the schema no longer
  // names either field — so a model imported before the change came back off the disk as a plain
  // mesh: gated on the 682 MB diffusion group, written `.ply`, filed as a mesh, with no word.
  if (model.fieldProfile === 'motion') brought.modality = 'motion'
  if (typeof model.family === 'string') brought.family = currentModelFamily(model.family)
  if (Array.isArray(model.serves)) {
    brought.serves = model.serves.map(role =>
      typeof role === 'string' ? currentAiRoleKey(role) : role,
    )
  }

  return brought
}

/**
 * The one place `generation.defaultModels` is still read, and it leaves as `ai.roles` — ADR-23.
 *
 * On the whole object rather than on either branch: the migration needs both at once, and a
 * transform on `generation` alone could not reach the choices already made on the employment
 * side, which have to win.
 */
const partialSettings = z
  .preprocess(withCurrentFamilies, partialSettingsShape)
  .transform(parsed => {
    const { defaultModels, ...generation } = parsed.generation ?? {}
    if (defaultModels === undefined) return parsed

    return {
      ...parsed,
      generation,
      ai: { ...parsed.ai, roles: migratedRoleChoices(defaultModels, parsed.ai?.roles ?? {}) },
    }
  })

/** Validates what the renderer sends. Throws: an out-of-bounds write must not be persisted. */
export function parsePartialSettings(value: unknown): PartialSettings {
  return partialSettings.parse(value)
}

/**
 * Validates what the config file holds. A hand-edited or corrupted file falls back to the
 * defaults rather than propagating `theme: 'purple'` into the whole interface.
 */
export function salvagePartialSettings(value: unknown): PartialSettings {
  const parsed = partialSettings.safeParse(value)
  return parsed.success ? parsed.data : {}
}

// Throws rather than falling back to a default: the section ends up in the URL fragment the
// settings window loads, so anything but a known name is refused outright.
const settingsSection = z.enum(SETTINGS_SECTION_IDS)

export function parseSettingsSection(value: unknown): SettingsSectionId {
  return settingsSection.parse(value)
}

// Throws rather than falling back: the id decides which action runs, and a renderer sends it.
const settingAction = z.enum(SETTING_ACTION_IDS)

export function parseSettingAction(value: unknown): SettingActionId {
  return settingAction.parse(value)
}
