import { create } from 'zustand'
import { sameOrder } from '@shared/collections'
import { assetRevisionOf, rememberAssetRevisions } from './assetRevisions'
import { livePreviewVersionOf } from './livePreviews'
import { persist } from 'zustand/middleware'
import {
  ASSET_SEARCH_LIMIT_MAX,
  type Asset,
  type AssetQuery,
  type AssetType,
} from '@shared/domain/asset'
import {
  COLLECTION_PERSIST_VERSION,
  DEFAULT_COLLECTION_STATE,
  withoutSearch,
  type CollectionState,
} from '@/helpers/collectionState'
import {
  ASSET_NAME_FAILURES,
  checkAssetName,
  type AssetNameFailure,
} from '@shared/domain/assetName'
import { nameFailureOf } from '@shared/domain/fileName'
import { isRecord } from '@shared/guards'
import { connectThroughBridge, getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'

type AssetsState = {
  collection: CollectionState
  setCollection: (collection: CollectionState) => void

  // Readonly so nothing can mutate it in place: `assetsById` keys off its identity, and a push
  // that kept the same array would leave the index short of an asset with nothing to say so.
  items: readonly Asset[]
  /**
   * The kinds the catalogue is asked for. Set by whichever space is in front, so the query is
   * narrowed in SQL rather than after the fact — which is also what keeps the count in the
   * header and the "no asset" message honest about what is being looked at.
   */
  scope: readonly AssetType[] | null
  setScope: (scope: readonly AssetType[] | null) => void
  /**
   * How many lines the browser is actually drawing, or nothing while none is mounted.
   *
   * The header's count used to read `items.length`, which is the project catalogue ALONE — the
   * shelf also draws the account's library and the generations in flight, then narrows all three
   * by the search and the facets. A project holding one picture beside seven library rows read
   * "1 asset" over a list of eight, and nothing on screen said which of the two numbers was
   * being answered.
   *
   * Published by the panel rather than derived here: the library page and the running jobs live
   * in other stores, and merging them a second time for the header would ask the same question
   * twice — with the filters, that is the whole of `AssetBrowser`.
   */
  shownCount: number | null
  setShownCount: (count: number | null) => void
  /**
   * Whether the catalogue holds rows past the ones read so far. The read was ALWAYS paged —
   * `catalog.search` answers 200 rows whatever it is asked — and nothing said so.
   */
  hasMore: boolean
  /**
   * Reads the next page and appends it, or does nothing at the end of the catalogue. Appended
   * rather than replacing: every other reader of `items` would otherwise lose rows to a scroll
   * happening in the shelf.
   */
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
  /**
   * Hears the writes the MAIN process makes on its own — the pictures a model sheds on import.
   * Every other write is answered where it was ordered, and invalidates the shelf there.
   */
  connect: () => Promise<() => void>
  /**
   * Says the catalogue changed and lets this store decide when to read it. `assets.searchProjectCatalogue` is
   * a synchronous SQLite query in the main process: forty rushes finishing their ingest would
   * otherwise freeze every window forty times over.
   */
  invalidate: () => void
  /**
   * Calls an asset something else, in this project's catalogue.
   *
   * Local on purpose: the name on the Scenario account is not touched. One asset is pulled into
   * several projects and named for what each one does with it, and a rename that travelled would
   * have a project rename someone else's library.
   *
   * Answers with the refusal, or `null` when it went through. The field has closed by then, so
   * the answer is for the caller to journal rather than to draw — see `helpers/rename.ts`.
   */
  rename: (assetId: string, name: string) => Promise<AssetNameFailure | null>
  /**
   * What the file IS, corrected by hand.
   *
   * The studio reads a domain off the extension, and an extension cannot always tell — a normal
   * map and an albedo are both PNGs. The row is what remembers the correction, which is why a
   * file the catalogue does not hold cannot be corrected at all.
   *
   * Nothing moves on disk: a row carries its own path, and what the studio calls a picture has
   * never been decided by the folder it sits in.
   */
  retype: (assetId: string, type: AssetType) => Promise<void>
  /**
   * Drops the coalesced read still waiting, if there is one.
   *
   * It exists for the test harness, and says so rather than pretending to a product need: the
   * timer `invalidate` arms lives at module scope, so a case that leaves one behind has it fire
   * inside a LATER case and refresh that one's catalogue under it. `testSetup` calls this after
   * every case — see the comment there for the failure it produces.
   *
   * The alternative was to leave production untouched and swap `globalThis.setTimeout` in the
   * harness for one that tracks every timer and clears them all after each case. It works — it
   * was tried. It is not what is here because it clears timers nobody knows about, so the next
   * leak of this kind is swallowed instead of named, and because a case that legitimately wants
   * a timer to outlive it would silently stop working. One named cancellation on the one store
   * that holds a module-scope timer says what it does.
   */
  cancelInvalidate: () => void
}

const COALESCE_MS = 200

/**
 * How many rows one SCROLL brings back — the ceiling `catalog.search` already applies when asked
 * for nothing. Left at 200 so no reader of `items` sees less than before this store learned to
 * page; a refresh reads whole multiples of it, up to `ASSET_SEARCH_LIMIT_MAX` at a time.
 */
const LOCAL_PAGE = 200

function pageOf(scope: readonly AssetType[] | null, offset: number, limit: number): AssetQuery {
  return { ...(scope ? { types: [...scope] } : {}), limit, offset }
}

function withoutHeld(held: readonly Asset[], page: readonly Asset[]): Asset[] {
  const known = new Set(held.map(asset => asset.id))
  return page.filter(asset => !known.has(asset.id))
}

/** Two scopes that ask for the same kinds, so a re-render does not re-read the catalogue. */
function sameScope(
  current: readonly AssetType[] | null,
  next: readonly AssetType[] | null,
): boolean {
  if (current === null || next === null) return current === next
  return sameOrder(current, next)
}

/**
 * The catalogue keyed by id, derived from `items` rather than stored beside it: a second field
 * would have to be kept in step by every writer, and one that forgot would hand back a stale
 * asset with nothing to say so.
 *
 * The result is cached on the identity of `items`, so it is a stable value for zustand — a
 * fresh Map per call would re-render every subscriber on every notification. Five panels were
 * scanning the whole list for one asset, per render and per catalogue event.
 *
 * **It keeps every asset it has been shown, not only the ones `items` currently holds.** `items`
 * is a SCOPE — the kinds the browser is asking for — and narrowing that facet to meshes used to
 * take the names, the posters and the media lengths off the clips of an open montage: the strip
 * fell back to raw ids, lost its stills, and a trim stopped clamping at the end of the source.
 * A way of browsing is not a statement about what a document holds.
 */
let indexed: { items: readonly Asset[]; byId: ReadonlyMap<string, Asset> } | null = null

export function assetsById(state: Pick<AssetsState, 'items'>): ReadonlyMap<string, Asset> {
  if (!indexed || indexed.items !== state.items) {
    // Over what it already held, not from `items` alone: that is the remembering. A fresh Map
    // each time is what hands zustand a changed identity, so the scope's own rows still win.
    const byId = new Map(indexed?.byId)
    for (const asset of state.items) byId.set(asset.id, asset)
    indexed = { items: state.items, byId }
  }
  return indexed.byId
}

export function rememberAssets(assets: readonly Asset[]): void {
  const byId = new Map(indexed?.byId)
  for (const asset of assets) byId.set(asset.id, asset)
  indexed = { items: useAssets.getState().items, byId }
}

/**
 * Drops what the index remembers — every asset of the project being left.
 *
 * Called by `followProject`, beside `forgetReportedFailures` and for the same reason: another
 * project's catalogue is another story, and this map has no other way to shrink. The test
 * harness calls it too, as it calls `cancelInvalidate`: the map lives at module scope, so an
 * asset one case puts in the catalogue would still answer a lookup in the next one.
 */
export function forgetRememberedAssets(): void {
  indexed = null
}

/**
 * When the file behind an asset was last written, or nothing when the catalogue does not hold it
 * — the shelf is scoped, so a slot can name a row this store is not carrying.
 *
 * Read at the moment a slot asks rather than subscribed to: this is the port the three 3D engines
 * take (`assetVersion`), and an engine knows no store. What it is FOR is the id not moving when
 * ⌘S rewrites a picture — see `versionedUrl`.
 */
export function assetVersionOf(assetId: string): string | undefined {
  // The registry FIRST: it is fed by the event that says a file was written, where the shelf is
  // one page of the newest rows — see `assetRevisions`.
  const written =
    assetRevisionOf(assetId) ?? assetsById(useAssets.getState()).get(assetId)?.localChangedAt
  const shown = livePreviewVersionOf(assetId)
  // The preview's count rides ON the file's stamp rather than replacing it: revoking one has to
  // leave a version the slot has not seen, or the file would come back under a key already held.
  return shown === 0 ? written : `${written ?? ''}+${shown}`
}

/** The shape the store persisted before it held a whole `CollectionState`. */
function readView(persisted: unknown): CollectionState['view'] | null {
  if (!isRecord(persisted) || !('view' in persisted)) return null
  const { view } = persisted
  return view === 'grid' || view === 'list' ? view : null
}

/**
 * How the browser is displayed lives in a store rather than in the component: its count is
 * rendered by the panel header, its grid by the content, and both must read the same list.
 *
 * Only the display is persisted. The catalogue belongs to the project, and a list restored
 * from the last session would show what a different project contained.
 */
let pending: ReturnType<typeof setTimeout> | null = null
let reading: Promise<void> | null = null
// Which scope the read in flight is answering for.
let readingScope: readonly AssetType[] | null = null
// The page in flight, so a scroll that fires twice asks once.
let growing: Promise<void> | null = null
/**
 * How many pages the shelf has been shown, so a refresh hands back as much as it took away:
 * a generation finishing while the reader sits at row 800 would otherwise cut the list to
 * 200 under them. Not derived from `items.length`, which still holds the scope being left.
 */
let pagesRead = 1

const assetsState: AssetsState = {
  collection: DEFAULT_COLLECTION_STATE,
  setCollection: collection => useAssets.setState({ collection }),

  items: [],
  scope: null,

  shownCount: null,
  setShownCount: shownCount => {
    if (useAssets.getState().shownCount !== shownCount) useAssets.setState({ shownCount })
  },

  hasMore: false,

  // A change of space changes what the catalogue is asked for, so the rows follow at once
  // rather than on the next invalidation — and back to one page with it, the pages read
  // belonging to the list being left. The rows stay until the new ones arrive: the panel
  // sets its scope as it mounts, so emptying here blanks the shelf on every open.
  setScope: scope => {
    if (sameScope(useAssets.getState().scope, scope)) return

    pagesRead = 1
    useAssets.setState({ scope })
    void useAssets.getState().refresh()
  },

  loadMore: async () => {
    if (growing) return growing
    // A refresh in flight is already reading every page this shelf has been shown.
    if (reading || !useAssets.getState().hasMore) return

    const scope = useAssets.getState().scope
    const offset = useAssets.getState().items.length

    growing = (async () => {
      const bridge = getBridge()
      if (!bridge) return

      try {
        const page = await bridge.assets.search(pageOf(scope, offset, LOCAL_PAGE))
        // The space may have changed while this was in flight, and its rows are another
        // list's: appended they would be two scopes shown as one.
        if (!sameScope(useAssets.getState().scope, scope)) return

        pagesRead += 1
        // Against what is held, because the offset is `items.length` and a row can leave
        // the list between two pages — `retype` drops one the scope no longer takes, and
        // the page then starts one row short of where it was meant to.
        useAssets.setState(state => ({
          items: [...state.items, ...withoutHeld(state.items, page)],
          hasMore: page.length === LOCAL_PAGE,
        }))
      } catch {
        // The catalogue failed — see `refresh` below, which answers the same way.
        useAssets.setState({ hasMore: false })
      }
    })().finally(() => {
      growing = null
    })

    return growing
  },

  // Callers that need the rows NOW share the read already in flight rather than opening a
  // second one: `assets.searchProjectCatalogue` is a synchronous SQLite query in the main process, and
  // three generations finishing together asked for the same answer three times over.
  refresh: async () => {
    // Shared only when it answers the same question. A read in flight for the previous
    // space would otherwise be handed back for the new one, leaving the shelf showing
    // what the space one had just left uses.
    if (reading && sameScope(readingScope, useAssets.getState().scope)) return reading

    const scope = useAssets.getState().scope
    readingScope = scope

    reading = (async () => {
      const bridge = getBridge()
      if (!bridge) return

      try {
        const found: Asset[] = []
        let more = false

        // As wide as the query is allowed to be, not one call per page shown: each is a
        // synchronous SQLite query on the process every window shares. The bound is re-read
        // each turn, so a `loadMore` landing mid-refresh is not handed back a shorter list.
        while (found.length < pagesRead * LOCAL_PAGE) {
          const limit = Math.min(ASSET_SEARCH_LIMIT_MAX, pagesRead * LOCAL_PAGE - found.length)
          const rows = await bridge.assets.search(pageOf(scope, found.length, limit))
          found.push(...rows)
          // Against what was ASKED for, not `LOCAL_PAGE`: a refresh reads wider than a page.
          more = rows.length === limit
          if (!more) break
        }

        // Rounded up so a part-filled page is asked for whole next time, and never zero:
        // an empty catalogue must still leave a page to read.
        pagesRead = Math.max(1, Math.ceil(found.length / LOCAL_PAGE))
        useAssets.setState({ items: found, hasMore: more })
      } catch {
        // The catalogue failed. No project open answers an empty page instead, so what
        // lands here is a database that stopped reading.
        pagesRead = 1
        useAssets.setState({ items: [], hasMore: false })
      }
    })().finally(() => {
      reading = null
    })

    return reading
  },

  // Through `invalidate` like every other site that says the catalogue moved, so the
  // coalescing holds: an extraction writing six pictures is one read, not six.
  connect: connectThroughBridge(async bridge =>
    bridge.assets.onChanged(changed => {
      // Before the invalidation: the shelf reads a page in a third of a second, and a
      // texture slot may ask for its version on the very next frame.
      rememberAssetRevisions(changed)
      useAssets.getState().invalidate()
    }),
  ),

  invalidate: () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      void useAssets.getState().refresh()
    }, COALESCE_MS)
  },

  rename: async (assetId, name) => {
    const refused = checkAssetName(name)
    if (refused) return refused

    const bridge = getBridge()
    if (!bridge) return 'invalid'

    let written
    try {
      written = await bridge.assets.update(assetId, { name: name.trim() })
    } catch (error) {
      // Read off the message, as a document's refusal is: the name reached the file, so
      // the folder can now refuse what no field could see — a name it already holds.
      // Journalled by the CALLER, on the code this hands back (`helpers/rename.ts`).
      return nameFailureOf(error, ASSET_NAME_FAILURES, 'invalid')
    }

    if (!written) return 'invalid'

    // Written into the shelf rather than waited for: `assets:update` broadcasts nothing —
    // it is answered where it was ordered, which is the doctrine every other write follows.
    // Straight into `items` and not through `invalidate`, so the tile shows the new name on
    // the next paint instead of a third of a second later.
    useAssets.setState(state => ({
      items: state.items.map(item => (item.id === assetId ? written : item)),
    }))
    return null
  },

  retype: async (assetId, type) => {
    const bridge = getBridge()
    if (!bridge) return

    let written
    try {
      written = await bridge.assets.update(assetId, { type })
    } catch (error) {
      reportFailure('assets.retype', assetId, error)
      return
    }

    if (!written) return

    // Into the shelf on the spot, as a rename is — `assets:update` broadcasts nothing, so
    // nothing else would tell it. Told apart from a rename by what a TYPE decides: the
    // shelf reads a scope, and a picture that has just become a texture is no longer a row
    // this one asked for. Written in place it stayed on screen, under its old shelf, with
    // its new name for what it is — until something unrelated happened to re-read.
    useAssets.setState(state => ({
      items: state.items.flatMap(item => {
        if (item.id !== assetId) return [item]
        return state.scope && !state.scope.includes(written.type) ? [] : [written]
      }),
    }))
  },

  cancelInvalidate: () => {
    if (pending) clearTimeout(pending)
    pending = null
  },
}

export const useAssets = create<AssetsState>()(
  persist(() => assetsState, {
    name: 'ai-desktop-studio:assets',
    version: COLLECTION_PERSIST_VERSION,
    /**
     * The store used to persist a bare `view`, before the state became a whole
     * `CollectionState`. Carried over rather than dropped: zustand would otherwise discard
     * the entry entirely, and with it the grid-or-list the user had chosen.
     */
    migrate: persisted => {
      const view = readView(persisted)
      return view ? { collection: { ...DEFAULT_COLLECTION_STATE, view } } : undefined
    },
    partialize: state => ({ collection: withoutSearch(state.collection) }),
  }),
)
