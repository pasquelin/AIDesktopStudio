import { mdiCubeScan } from '@mdi/js'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { primaryRoleOf, providerOfModel } from '@shared/domain/aiRole'
import type { ModelFamily, ModelSummary } from '@shared/domain/model'
import { failureKeyOf } from '@/services/failureMessage'
import { Collection } from '@/components/Collection/Collection'
import { CollectionBar } from '@/components/CollectionBar/CollectionBar'
import { QuietNote } from '@/components/QuietNote'
import { isFiltered } from '@/helpers/collectionState'
import { useDebounced, SEARCH_DELAY_MS } from '@/hooks/useDebounced'
import { useLazyPreviews } from '@/hooks/useLazyPreviews'
import { usePages } from '@/hooks/usePages'
import { useModelForFamily } from '@/hooks/useModelForFamily'
import { usePlanAccess } from '@/hooks/usePlanAccess'
import { useModelReach } from '@/hooks/useModelReach'
import { ModelDownloadDialog } from '../ModelDownloadDialog'
import { getBridge } from '@/services/bridge'
import { modelCollectionOf, useModels } from '@/stores/models'
import { useAccounts } from '@/stores/accounts'
import { useAiModels } from '@/stores/aiModels'
import { useSettings } from '@/stores/settings'
import { EmptyState } from '@/components/EmptyState'
import { MissingCredentials } from '@/features/shell/components/MissingCredentials'
import { cloudsHeldFor, facetsFor, queryFrom, sortOptions } from '../../modelFilters'
import { ModelsCard } from './ModelsCard'
import { ModelsRow } from './Row/ModelsRow'
import { ModelsSelected } from './ModelsSelected'

const PAGE_LIMIT = 24

/**
 * How many pages the panel pulls on its own before it waits for the user. Not just the empty
 * ones: a filter that matches a handful never fills the viewport either, so the end stays in
 * sight and the list would keep asking until the catalogue ran dry — on open, untouched.
 */
const AUTOMATIC_PULLS = 6

export type ModelsProps = {
  /** The family whose catalogue is browsed. The settings screen it sits under names it. */
  family: ModelFamily
}

/**
 * The model browser — what the catalogue holds for one family, on this machine and in the cloud.
 *
 * It sat in a dock until ADR-23, sharing a half with the generation panel: picking a model and
 * using it took turns, so generating meant opening it, choosing, coming back, and starting again
 * for every attempt. It is now the MANAGER — discovering, installing, reading what a model
 * weighs — and it lives beside the employments it serves, in the settings. What a generation
 * picks is the panel's own picker.
 */
export function Models({ family }: ModelsProps) {
  const { t } = useTranslation()

  // Per family: the bar follows the workspace like the rest of this panel, and a filter set
  // under Image narrowing the Skyboxes space is a filter nobody can find to relax.
  const collection = useModels(state => modelCollectionOf(state, family))
  const setCollection = useModels(state => state.setCollection)
  // Through the same answer the rail and the generator read. Reading the session choice alone
  // left this panel saying "no model chosen" about the very model the generator was running.
  const selectedId = useModelForFamily(family)
  const select = useModels(state => state.select)
  const chooseAiProvider = useAiModels(state => state.chooseAiProvider)
  // 🛑 From the overview and not from `useProject`: this browser now also renders in the settings
  // window, which never connects the project store — so the scope read `app` with a project open.
  const projectPath = useAiModels(state => state.overview?.projectPath ?? null)
  const authenticated = useSettings(state => state.auth.authenticated)
  const accounts = useAccounts(state => state.accounts)
  const plan = usePlanAccess()

  const reachOf = useModelReach(plan)
  const [offered, setOffered] = useState<ModelSummary | null>(null)

  // Debounced WITH the family it was typed under, because the two now change independently: the
  // search text used to be shared, so leaving a space never altered it. It does now, and a word
  // left over from the space just left would spend its 250 ms sending the walk down the search
  // endpoint and flashing "no result" over a space nobody had searched.
  const typed = useMemo(() => ({ family, search: collection.search }), [family, collection.search])
  const settled = useDebounced(typed, SEARCH_DELAY_MS)
  const search = settled.family === family ? settled.search : ''
  // No memo, and only for this one: react-query hashes the key structurally, so a fresh object
  // costs nothing, and `queryFrom` translates nothing.
  // A cloud is offered only where a key is held — see `cloudsHeldFor`. The listing itself stays
  // on this machine until the person ticks one: an account is not a reason to show billed models.
  // Memoised BECAUSE the facets below depend on it: a fresh array per render defeated their memo
  // for anyone holding a key, which is the case that matters.
  const clouds = useMemo(
    () => cloudsHeldFor(family, authenticated, accounts),
    [accounts, authenticated, family],
  )
  const query = queryFrom(collection, family, search, clouds)

  // Memoised, unlike the query above: building the facets translates up to twenty-five labels
  // through i18next — measured at 376 µs, against 1 µs for the query — and this panel re-renders
  // on every keystroke in its search field.
  const facets = useMemo(() => facetsFor(family, t, clouds), [family, t, clouds])
  const sorts = useMemo(() => sortOptions(t), [t])

  // The walk covers private models then public ones, and a model listed in both would otherwise
  // appear twice — and collide as a React key. `usePages` holds a listing to one row per id.
  // The registry bounds how many pages one request walks, so a selective filter can answer
  // nothing — or too little to fill the panel — while the catalogue still has more.
  const catalogue = usePages(
    ['models', query],
    from => getBridge()?.provider.searchModels({ ...query, limit: PAGE_LIMIT, ...from }),
    {
      fill: { wanted: PAGE_LIMIT, max: AUTOMATIC_PULLS },
      // The walk lists the private models then the public ones, and one can be in both: a run of
      // pages this panel has already shown is ordinary here, and is not the end of the catalogue.
      endsOnRepeats: false,
    },
  )
  const items = catalogue.items

  const { pictureOf, resolveFor } = useLazyPreviews()

  const selected = selectedId ? (catalogue.byId.get(selectedId) ?? null) : null

  // Said only once there is nothing else to show: a machine holding local models has a panel to
  // draw, and telling it there is no key would hide the very models that need none.
  if (!authenticated && items.length === 0 && !catalogue.fetching) {
    return <MissingCredentials icon={mdiCubeScan} />
  }

  // Without this the panel sits on "loading" forever when the API refuses the request.
  if (catalogue.refusal !== null) {
    return <EmptyState icon={mdiCubeScan} message={t(failureKeyOf(catalogue.refusal))} />
  }

  function View() {
    return (
      <div className="flex h-full flex-col">
        <ModelsSelected model={selected} picture={selected ? pictureOf(selected) : undefined} />

        <CollectionBar
          scId="models"
          state={collection}
          onChange={next => setCollection(family, next)}
          facets={facets}
          sorts={sorts}
        />

        {offered && <ModelDownloadDialog model={offered} onClose={() => setOffered(null)} />}

        <div className="min-h-0 flex-1">
          <Collection
            label={t('panels.models')}
            items={items}
            state={collection}
            selectedIds={selectedId ? [selectedId] : []}
            // A tile whose weights are absent OFFERS the download rather than doing nothing: it is
            // the one refusal the studio can lift itself, and a dimmed tile with no way forward is
            // what sent people looking through the settings for a button.
            onSelect={model => {
              if (reachOf(model).fetchable) {
                setOffered(model)
                return
              }
              // ADR-23 § C: the employment the pick was made FOR, and no other. This panel knows
              // a family, so it arms that family's first one — where `familyChoiceWrites` armed
              // every employment the model could serve, silently taking over five more.
              const role = primaryRoleOf(model.family)
              if (!role) return

              select(role, model.id)
              void chooseAiProvider(
                role,
                providerOfModel(model),
                projectPath === null ? 'app' : 'project',
              )
            }}
            onReachEnd={catalogue.more}
            onVisible={resolveFor}
            // The same answer greys the cell and explains it, so a row cannot end up dimmed with
            // nothing to say why.
            // Greyed, but still reachable when the studio can fetch it — see `onSelect`.
            isDisabled={model => {
              const reach = reachOf(model)
              return reach.refusal !== undefined && !reach.fetchable
            }}
            rowHeight="media"
            renderCard={model => (
              <ModelsCard
                model={model}
                picture={pictureOf(model)}
                refusal={reachOf(model).refusal}
              />
            )}
            renderRow={model => (
              <ModelsRow
                model={model}
                picture={pictureOf(model)}
                refusal={reachOf(model).refusal}
              />
            )}
            empty={
              <EmptyState
                icon={mdiCubeScan}
                message={
                  catalogue.fetching
                    ? t('collection.loading')
                    : // The debounced search, not the typed one: for the 250 ms in between, the
                      // filter blamed for the empty panel has not been applied yet.
                      isFiltered(
                          { ...collection, search },
                          facets.map(facet => facet.key),
                        )
                      ? t('collection.noMatch')
                      : t('models.none')
                }
              />
            }
            footer={
              catalogue.fetchingMore ? (
                // Not `standalone`: its `py-6` is the room an empty list gives a sentence, and this
                // one sits under a full grid that is still paging.
                <div className="py-2 text-center">
                  <QuietNote>{t('collection.loading')}</QuietNote>
                </div>
              ) : null
            }
          />
        </div>
      </div>
    )
  }
  return View()
}
