import { mdiImageMultipleOutline } from '@mdi/js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ASSET_TYPES,
  isAssetType,
  isCloudAssetType,
  type AssetBadge,
  type AssetType,
} from '@shared/domain/asset'
import { typeOfWorkspace } from '@shared/domain/assetKind'
import { cloudPage } from '@/helpers/cloudPage'
import { filterLocally, isFiltered, setFacetValue } from '@/helpers/collectionState'
import { applySelection } from '@/helpers/selection'
import { HINT_LEFT } from '@/helpers/tooltip'
import { assetTypesOf, soleTypeOf } from '@/helpers/workspaces'
import { useAssetFacets } from '@/hooks/useAssetFacets'
import { useAutomaticPulls } from '@/hooks/useAutomaticPulls'
import { useBadgeLabels } from '@/hooks/useBadgeLabels'
import { useDebounced, SEARCH_DELAY_MS } from '@/hooks/useDebounced'
import { usePages } from '@/hooks/usePages'
import { useRemoteTwins } from '@/hooks/useRemoteTwins'
import { useTypeLabels } from '@/hooks/useTypeLabels'
import { getBridge } from '@/services/bridge'
import { openAsset } from '@/helpers/openAsset'
import { useAssets } from '@/stores/assets'
import { useCloud } from '@/stores/cloud'
import { useJobs } from '@/stores/jobs'
import { useLibraryPick } from '@/stores/libraryPick'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { activeOwnerId, useSettings } from '@/stores/settings'
import { MissingCredentials } from '@/features/shell/components/MissingCredentials'
import { AssetCard } from '../AssetCard'
import { AssetDetails } from '../AssetDetails'
import { AssetRow } from '../AssetRow'
import { OWN_SOURCE, PUBLISHED_SOURCE, SOURCE_FACET, TYPE_FACET } from './facets'
import { mergeFeed, type FeedSource, type FeedSourceName } from './feed'
import { markOf, mergeRows, runningRows, typeOfRow, type AssetRowModel } from '../rows'
import { AssetBrowserList } from './AssetBrowserList'

/** How much of a cloud listing one page asks for. The scroll asks for the next. */
const LIBRARY_PAGE = 60

/**
 * How many lines are worth pulling for before the scroll takes over. `image` cannot be asked OF
 * the API, so the space's kind is filtered here and a page of sixty can draw one line.
 * 🛑 `max` bounds the spend: a library sparser than that stops short, with no scroll left to ask.
 */
const SURFACE_ROWS = 24

/** What a line of the account's own library answers the Source facet with. */
const SOURCES_OF_OWN: readonly string[] = [OWN_SOURCE]

/**
 * The account's remote library, standing where an Unreal content browser would.
 *
 * 🛑 It lists what is NOT on this machine, and only that: the account's own library, what everyone
 * else published, and the generations still being made. What the project holds is the Explorer's.
 *
 * Both halves are asked OF the API — the index matches a prompt and a description this side never
 * sees, which is what makes them searchable at all.
 */
export function AssetBrowser() {
  const { t } = useTranslation()
  const collection = useAssets(state => state.collection)
  const setCollection = useAssets(state => state.setCollection)
  const project = useProject(state => state.project)
  const workspace = useLayouts(state => state.activeWorkspace)
  const ownerId = useSettings(activeOwnerId)
  const authenticated = useSettings(state => state.auth.authenticated)
  const authKnown = useSettings(state => state.authKnown)
  const typeLabels = useTypeLabels()
  const badgeLabels = useBadgeLabels()
  const facets = useAssetFacets(typeLabels)
  const setShownCount = useAssets(state => state.setShownCount)
  const jobs = useJobs(state => state.jobs)
  const busy = useCloud(state => state.busy)
  const moving = useCloud(state => state.moving)
  const ownType = workspaceType(workspace)
  useEffect(() => {
    if (ownType) setCollection(setFacetValue(useAssets.getState().collection, TYPE_FACET, ownType))
  }, [ownType, setCollection])

  const chosenTypes = collection.selections[TYPE_FACET]
  const scope = useMemo<readonly AssetType[]>(() => {
    const chosen = (chosenTypes ?? []).filter(isAssetType)
    return chosen.length > 0 ? chosen : assetTypesOf(workspace)
  }, [chosenTypes, workspace])

  const search = useDebounced(collection.search.trim(), SEARCH_DELAY_MS)

  const cloudScope = useMemo(() => scope.filter(isCloudAssetType), [scope])

  const { wantsPublished, wantsOwn } = wantedSources(collection.selections[SOURCE_FACET])

  const library = usePages(
    ['assets', 'library', ownerId, cloudScope, search],
    from =>
      getBridge()
        ?.cloud.browse({
          pageSize: LIBRARY_PAGE,
          types: cloudScope,
          ...(search ? { text: search } : {}),
          ...from,
        })
        .then(cloudPage),
    { enabled: authenticated && wantsOwn },
  )
  const remote = library.items

  const publishedType = wantsPublished ? (cloudScope[0] ?? null) : null
  const feed = usePages(
    ['assets', 'published', publishedType, search],
    from =>
      publishedType === null
        ? undefined
        : getBridge()
            ?.cloud.explore({
              type: publishedType,
              pageSize: LIBRARY_PAGE,
              ...(search ? { text: search } : {}),
              ...from,
            })
            .then(cloudPage),
    // Never read while nobody asks for it: the feed is unbounded, and reading it costs a search.
    // And never without a key, for the reason the library above states.
    { enabled: publishedType !== null && authenticated },
  )
  const published = feed.items

  const [expanded, setExpanded] = useState<string | null>(null)
  const picked = useLibraryPick(state => state.picked)
  const setPicked = useLibraryPick(state => state.setPicked)

  const hints = useMemo(
    () => ({
      fetch: HINT_LEFT(t('assets.fetchHint')),
      generating: HINT_LEFT(t('assets.generatingHint')),
    }),
    [t],
  )

  const settled = useMemo(() => mergeRows({ remote, published, scope }), [remote, published, scope])
  const rows = useMemo(() => [...runningRows(jobs), ...settled], [jobs, settled])

  const listed = useMemo(
    () => settled.flatMap(row => (row.from === 'remote' ? [row.asset.id] : [])),
    [settled],
  )
  const twins = useRemoteTwins(listed)

  const badges = useMemo(() => {
    const inFlight = new Set(moving)

    return new Map(rows.map(row => [row.id, markOf(row, { inFlight, twins })]))
  }, [rows, moving, twins])

  const badgeOf = (id: string): AssetBadge => badges.get(id) ?? 'remote-only'

  const filtered = useMemo(
    () =>
      filterLocally(rows, collection, {
        text: () => null,
        facets: {
          [TYPE_FACET]: row => {
            const type = typeOfRow(row)
            return type ? [type] : ASSET_TYPES
          },
          [SOURCE_FACET]: row =>
            row.from === 'remote' && row.published ? [PUBLISHED_SOURCE] : SOURCES_OF_OWN,
        },
      }),
    [rows, collection],
  )

  const libraryReadTo = remote.at(-1)?.createdAt
  const publishedReadTo = published.at(-1)?.createdAt

  const sources = useMemo<Partial<Record<FeedSourceName, FeedSource>>>(
    () => ({
      ...(library.pending
        ? {}
        : { library: { readTo: libraryReadTo, exhausted: library.exhausted } }),
      ...(publishedType !== null && !feed.pending
        ? { published: { readTo: publishedReadTo, exhausted: feed.exhausted } }
        : {}),
    }),
    [
      libraryReadTo,
      library.exhausted,
      library.pending,
      publishedReadTo,
      publishedType,
      feed.exhausted,
      feed.pending,
    ],
  )

  const { rows: shown, hungry } = useMemo(() => mergeFeed(filtered, sources), [filtered, sources])

  const wantsLibrary = hungry.includes('library')
  const wantsFeed = hungry.includes('published')
  // Named apart because `exhaustive-deps` reads `library.more` as a dependency on `library`,
  // which takes a fresh identity every render and would re-arm the effect below with it.
  const readMoreLibrary = library.more
  const readMoreFeed = feed.more
  const askForMore = useCallback(() => {
    if (wantsLibrary) readMoreLibrary()
    if (wantsFeed) readMoreFeed()
  }, [wantsLibrary, wantsFeed, readMoreLibrary, readMoreFeed])

  // `ownerId` in the key: another account is another library, read from nothing — with the count
  // left where the previous one stopped, the panel would sit empty with no scroll able to fill it.
  useAutomaticPulls({
    key: `${ownerId} ${search} ${scope.join()} ${publishedType}`,
    drawn: shown.length,
    wanted: SURFACE_ROWS,
    fetching: eitherFetching(library.fetching, feed.fetching),
    // A page either of them answers with nothing moves no row on screen, and the panel would
    // stop one pull in with pages still to come.
    answered: `${library.pagesRead} ${feed.pagesRead}`,
    // Nobody to ask is not a pull worth spending: no source is holding the list back.
    ask: hungry.length === 0 ? null : askForMore,
  })

  /**
   * The count in the title row says what this list holds — the header is another component and
   * sees neither the library page nor the filters. Cleared on the way out.
   */
  const shownLength = shown.length
  useEffect(() => {
    setShownCount(shownLength)
  }, [setShownCount, shownLength])
  // Its own effect, so the number is not dropped and re-published on every change of the list.
  useEffect(() => () => setShownCount(null), [setShownCount])
  // And the picked range with it: it addresses one library, and a panel that has closed must not
  // leave a range behind for whatever opens next.
  useEffect(() => () => setPicked([]), [setPicked])

  /** No key is asked FIRST: blaming a filter would send someone hunting for one to clear. */
  const narrowedByHand = narrowedByUser(collection, chosenTypes, ownType)
  // EITHER source still on its way, not both: a listing nobody asked for is not pending, so
  // reading the record alone said « no match » over a feed whose first page was in flight.
  const { reading, refused } = browserStatus(wantsOwn, library, publishedType, feed)

  if (authKnown && !authenticated) return <MissingCredentials icon={mdiImageMultipleOutline} />

  const emptyMessage = emptyAssetMessage({ reading, refused, narrowedByHand, t })
  return (
    <AssetBrowserList
      collection={collection}
      onCollectionChange={setCollection}
      facets={facets}
      items={shown}
      selectedIds={picked}
      onSelect={(_row, ids, mode) => setPicked(applySelection(picked, ids, mode))}
      onReachEnd={askForMore}
      onActivate={row => {
        if (row.from === 'remote' && project && !busy) void openFetched(row.asset.id)
      }}
      renderCard={row => (
        <AssetCard
          row={row}
          badge={badgeOf(row.id)}
          badgeLabels={badgeLabels}
          typeLabels={typeLabels}
          hints={hints}
        />
      )}
      expandedId={expanded}
      onToggleRow={row => setExpanded(current => (current === row.id ? null : row.id))}
      renderDetail={row => (
        <AssetDetails row={row} twin={row.from === 'remote' ? twins.get(row.asset.id) : null} />
      )}
      renderRow={row => (
        <AssetRow
          row={row}
          typeLabel={typeLabelOf(row, typeLabels)}
          badge={badgeOf(row.id)}
          badgeLabels={badgeLabels}
          hints={hints}
        />
      )}
      emptyMessage={emptyMessage}
      retry={
        refused
          ? () => {
              library.retry()
              feed.retry()
            }
          : undefined
      }
    />
  )
}

function workspaceType(workspace: Parameters<typeof typeOfWorkspace>[0]) {
  return typeOfWorkspace(workspace) ?? soleTypeOf(workspace)
}

function eitherFetching(library: boolean, feed: boolean): boolean {
  return library || feed
}

function wantedSources(chosen: readonly string[] | undefined) {
  const selections = chosen ?? []
  const wantsPublished = selections.includes(PUBLISHED_SOURCE)
  return { wantsPublished, wantsOwn: !wantsPublished || selections.length > 1 }
}

function narrowedByUser(
  collection: Parameters<typeof isFiltered>[0],
  chosen: readonly string[] | undefined,
  ownType: AssetType | null,
): boolean {
  if (chosen?.length === 1 && chosen[0] === ownType)
    return isFiltered(setFacetValue(collection, TYPE_FACET, null))
  return isFiltered(collection)
}

type PageState = { pending: boolean; refusal: unknown }

function browserStatus(
  wantsOwn: boolean,
  library: PageState,
  publishedType: AssetType | null,
  feed: PageState,
) {
  return {
    reading: (wantsOwn && library.pending) || (publishedType !== null && feed.pending),
    refused: library.refusal !== null || feed.refusal !== null,
  }
}

function emptyAssetMessage(input: {
  reading: boolean
  refused: boolean
  narrowedByHand: boolean
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (input.reading) return input.t('collection.loading')
  if (input.refused) return input.t('assets.libraryRefused')
  if (input.narrowedByHand) return input.t('collection.noMatch')
  return input.t('assets.noneRemote')
}

/**
 * Fetches a library asset, then opens what arrived. Opening nothing when the transfer failed is
 * deliberate: `cloud:pull` has already written why, and an editor on a row never created says less.
 */
async function openFetched(remoteAssetId: string): Promise<void> {
  const arrived = await useCloud.getState().fetchOne(remoteAssetId)
  if (arrived) await openAsset(arrived)
}

/** Blank for a job: it has no kind to name until it answers, and a guess would be one. */
function typeLabelOf(row: AssetRowModel, labels: Map<AssetType, string>): string {
  const type = typeOfRow(row)
  return type ? (labels.get(type) ?? type) : ''
}
