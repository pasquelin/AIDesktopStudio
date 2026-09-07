import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { currentAiRoleKey, primaryRoleOf, type AiRoleId } from '@shared/domain/aiRole'
import { currentModelFamily, MODEL_FAMILIES, type ModelFamily } from '@shared/domain/model'
import { isRecord, mapKeys } from '@shared/guards'
import type { FormValues } from '@/helpers/dynamicForm'
import {
  COLLECTION_PERSIST_VERSION,
  DEFAULT_COLLECTION_STATE,
  withoutSearch,
  type CollectionState,
} from '@/helpers/collectionState'

/**
 * Bumped past `COLLECTION_PERSIST_VERSION` because `selected` changed KEY, not shape: entries
 * filed per family have to be re-filed per employment or every space opens on no model at all.
 */
const ROLE_KEYS_VERSION = COLLECTION_PERSIST_VERSION + 1

/** Bumped again for the family RENAMED — `withCurrentFamilies` says which, and why it is silent. */
const MODELS_PERSIST_VERSION = ROLE_KEYS_VERSION + 1

type Collections = Partial<Record<ModelFamily, CollectionState>>

/**
 * Every family's state as it goes to storage. Walks the families rather than the map's own
 * keys, so a key a rehydrated blob invented — a family that has since been renamed away — is
 * dropped instead of being written back out forever.
 */
function searchless(collections: Collections): Collections {
  const stored: Collections = {}
  for (const family of MODEL_FAMILIES) {
    const held = collections[family]
    if (held) stored[family] = withoutSearch(held)
  }

  return stored
}

/**
 * What a family's choice becomes once choices are filed per employment: the choice of its FIRST
 * one, which is exactly what read it before — `resolveModelForFamily` only ever looked at
 * `primaryRoleOf(family)`.
 */
function withRoleKeys(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted
  const held = persisted as { selected?: Record<string, string> }
  if (!held.selected) return persisted

  const selected: Partial<Record<AiRoleId, string>> = {}
  for (const family of MODEL_FAMILIES) {
    const modelId = held.selected[family]
    const role = primaryRoleOf(family)
    if (modelId && role) selected[role] = modelId
  }

  return { ...held, selected }
}

/**
 * A family renamed since this blob was written, brought up to date — under either shape, since
 * `selected` was keyed per family before ADR-23 and per employment after it.
 *
 * Reached from `migrate`, so a blob already at the current version never sees it: the next family
 * added to `RENAMED_FAMILIES` needs `MODELS_PERSIST_VERSION` bumped with it.
 *
 * Without it the choice comes back as none made — a key nothing reads reddens nowhere, and
 * `searchless` quietly drops the browser's own state for that family at the first write.
 */
function withCurrentFamilies(persisted: unknown): unknown {
  if (!isRecord(persisted)) return persisted

  const brought: Record<string, unknown> = { ...persisted }
  if (isRecord(persisted.selected)) brought.selected = mapKeys(persisted.selected, currentAiRoleKey)
  if (isRecord(persisted.collections)) {
    brought.collections = mapKeys(persisted.collections, currentModelFamily)
  }

  return brought
}

type ModelsState = {
  /**
   * One choice per EMPLOYMENT, not per family — ADR-23 § C.
   *
   * Filed per family, choosing a model to retouch with replaced the one text-to-image was on:
   * the two are different pickings, and the same weights serve both. Keyed by `AiRoleId` so that
   * the cloud model a panel picked is remembered against the operation it was picked for.
   */
  selected: Partial<Record<AiRoleId, string>>
  /**
   * The browser's search, sort, thumbnail size and facets — one set per family, for the same
   * reason as the choice above and a sharper one.
   *
   * A SINGLE set was shared by all seven spaces, and `queryFrom` guarded only the facets a
   * family stops offering: Origin and Period are offered everywhere, so they crossed. Ticking
   * "Official" under Image emptied the Skyboxes space — none of its models were official under
   * the tag the origin was read from — and the state being persisted, it survived restarts. The
   * user filtered a space they never filtered.
   */
  collections: Collections
  /**
   * Parameters the generator should open on, per EMPLOYMENT — the values an edit prepared for a
   * retouch have no business reaching text-to-image, which the same weights also serve.
   *
   * Kept out of the persisted state: it belongs to one gesture and not to a preference.
   */
  preset: Partial<Record<AiRoleId, FormValues>>

  /**
   * Files the choice under the EMPLOYMENT it was made for. Global to that employment: picking a
   * model to retouch with in one document is picking it for every retouch, which is what a
   * preference means. What it no longer touches is the other operations of the same family.
   */
  select: (role: AiRoleId, modelId: string) => void
  /** Picks the model AND the values to open its form on, in one write. */
  prepare: (role: AiRoleId, modelId: string, params: FormValues) => void
  setCollection: (family: ModelFamily, collection: CollectionState) => void
}

/**
 * What the Models panel chose, held outside it so the generator can read it without the two
 * panels knowing about each other — they are separate tool windows and either may be closed.
 */
export const useModels = create<ModelsState>()(
  persist(
    set => ({
      selected: {},
      collections: {},
      preset: {},

      select: (role, modelId) =>
        set(state => ({ selected: { ...state.selected, [role]: modelId } })),

      prepare: (role, modelId, params) =>
        set(state => ({
          selected: { ...state.selected, [role]: modelId },
          preset: { ...state.preset, [role]: params },
        })),

      setCollection: (family, collection) =>
        set(state => ({ collections: { ...state.collections, [family]: collection } })),
    }),
    {
      name: 'ai-desktop-studio:models',
      // Bumped with the shape of `CollectionState`: an entry missing `thumbnailSize` lays the
      // grid out in zero-wide columns, which reads as a panel that lost its content.
      //
      // NOT bumped for the split into `collections`, and no migration either: the field was
      // renamed, so a state written before it restores `selected` and leaves `collections`
      // empty — every space opens unfiltered once, which is exactly what has to happen to the
      // shared filter this replaces. The orphan entry is gone at the first write.
      version: MODELS_PERSIST_VERSION,
      // Renamed FIRST: `withRoleKeys` walks `MODEL_FAMILIES` to find a choice filed per family,
      // and a family it no longer names is a choice it cannot see.
      migrate: (persisted, version) => {
        const brought = withCurrentFamilies(persisted)

        return version >= ROLE_KEYS_VERSION ? brought : withRoleKeys(brought)
      },
      // The search text is deliberately dropped: restoring it would open the studio on a
      // narrowed catalogue nobody typed, which reads as a catalogue gone missing.
      partialize: state => ({
        selected: state.selected,
        collections: searchless(state.collections),
      }),
    },
  ),
)

/**
 * The state of one family's browser, defaulted here rather than at each reader — the shape
 * `canvasViewOf` settled on. The shared constant is never rebuilt: a
 * selector returning a fresh object hands React a new snapshot on every render.
 */
export function modelCollectionOf(
  state: Pick<ModelsState, 'collections'>,
  family: ModelFamily,
): CollectionState {
  return state.collections[family] ?? DEFAULT_COLLECTION_STATE
}
