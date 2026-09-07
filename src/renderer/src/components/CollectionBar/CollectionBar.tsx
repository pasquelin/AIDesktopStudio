import { mdiFormatListBulleted, mdiMinus, mdiPlus, mdiViewGridOutline } from '@mdi/js'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/helpers/cn'
import {
  resizeThumbnails,
  selectedValues,
  setFacetValue,
  THUMBNAIL_STEP,
  type CollectionState,
  type FacetDescriptor,
  type FacetOption,
} from '@/helpers/collectionState'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { FoldRule } from '../FoldRule'
import { PANEL_BAR, PANEL_HEAD } from '../styles'
import { ToolButton } from '../ToolButton'
import { SearchField } from '../SearchField'
import { SelectField } from '../SelectField'
const FACETS_BEFORE_FOLD = 2
export type CollectionLayout = 'stacked' | 'inline' | 'header'
export type CollectionBarProps = {
  scId: string
  state: CollectionState
  onChange: (next: CollectionState) => void
  facets?: readonly FacetDescriptor[]
  sorts?: readonly FacetOption[]
  layout?: CollectionLayout
  display?: boolean
  leading?: ReactNode
  growSearch?: boolean
  className?: string
}
type BarContext = Pick<CollectionBarProps, 'scId' | 'state' | 'onChange'> & {
  t: ReturnType<typeof useTranslation>['t']
}
function collectionSearch({
  scId,
  state,
  onChange,
  t,
  growSearch,
  layout = 'stacked',
}: BarContext & Pick<CollectionBarProps, 'growSearch' | 'layout'>) {
  const inline = layout !== 'stacked'
  const className = growSearch
    ? 'min-w-16 flex-1'
    : layout === 'header'
      ? 'w-56 min-w-16 shrink'
      : inline
        ? 'w-56 shrink-0'
        : 'w-full'
  return (
    <SearchField
      label={t('collection.search')}
      value={state.search}
      onChange={value => onChange({ ...state, search: value })}
      scId={`${scId}.search`}
      className={className}
      hint={TIP_BOTTOM(t('collection.search'), undefined, t('collection.searchHint'))}
    />
  )
}
function collectionMenus({
  shown,
  scId,
  state,
  onChange,
}: BarContext & { shown: readonly FacetDescriptor[] }) {
  return shown.map((facet, index) => (
    <SelectField
      key={facet.key}
      layout="bar"
      label={facet.label}
      scId={`${scId}.facet.${facet.key}`}
      hint={TIP_BOTTOM(facet.label)}
      options={[{ value: '', label: facet.label }, ...facet.options]}
      value={selectedValues(state, facet.key)[0] ?? ''}
      onChange={value => onChange(setFacetValue(state, facet.key, value || null))}
      className={index === shown.length - 1 && shown.length % 2 === 1 ? 'col-span-2' : undefined}
    />
  ))
}
function collectionSort({
  sorts,
  scId,
  state,
  onChange,
  t,
}: BarContext & Pick<CollectionBarProps, 'sorts'>) {
  if (!sorts?.length) return null
  return (
    <SelectField
      layout="bar"
      label={t('collection.sort')}
      scId={`${scId}.sort`}
      hint={TIP_BOTTOM(t('collection.sort'))}
      options={sorts}
      value={state.sort ?? sorts[0]?.value ?? ''}
      onChange={sort => onChange({ ...state, sort })}
    />
  )
}
function collectionViews({ state, onChange, t }: BarContext) {
  return (
    <div className="flex items-center gap-2">
      <ToolButton
        icon={mdiViewGridOutline}
        label={t('collection.gridView')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={state.view === 'grid'}
        accented={state.view === 'grid'}
        onClick={() => onChange({ ...state, view: 'grid' })}
      />
      <ToolButton
        icon={mdiFormatListBulleted}
        label={t('collection.listView')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={state.view === 'list'}
        accented={state.view === 'list'}
        onClick={() => onChange({ ...state, view: 'list' })}
      />
    </div>
  )
}
function collectionZoom({ state, onChange, t }: BarContext) {
  return (
    <div className="flex items-center gap-2">
      <ToolButton
        icon={mdiMinus}
        label={t('collection.smaller')}
        tooltip={TIP_BOTTOM}
        variant="header"
        disabled={state.view === 'list'}
        onClick={() => onChange(resizeThumbnails(state, -THUMBNAIL_STEP))}
      />
      <ToolButton
        icon={mdiPlus}
        label={t('collection.larger')}
        tooltip={TIP_BOTTOM}
        variant="header"
        disabled={state.view === 'list'}
        onClick={() => onChange(resizeThumbnails(state, THUMBNAIL_STEP))}
      />
    </div>
  )
}
type BarLayoutProps = Pick<CollectionBarProps, 'leading' | 'display' | 'className' | 'layout'> & {
  search: ReactNode
  menus: ReactNode
  sortMenu: ReactNode
  views: ReactNode
  zoom: ReactNode
}
function inlineCollectionBar({
  layout,
  leading,
  display,
  className,
  search,
  menus,
  sortMenu,
  views,
  zoom,
}: BarLayoutProps) {
  const skin =
    layout === 'header' ? 'flex min-w-0 flex-1 items-center gap-2' : cn(PANEL_BAR, 'px-2 py-1.5')
  return (
    <div className={cn(skin, className)}>
      {leading}
      {search}
      {menus}
      <div className="ml-auto flex items-center gap-2">
        {sortMenu}
        {display && views}
        {display && zoom}
      </div>
    </div>
  )
}
function stackedCollectionBar({
  leading,
  display,
  className,
  search,
  sortMenu,
  views,
  zoom,
  children,
}: BarLayoutProps & { children: ReactNode }) {
  return (
    <div className={cn(PANEL_HEAD, className)}>
      {leading ? (
        <div className="flex items-center gap-2">
          {leading}
          {search}
        </div>
      ) : (
        search
      )}
      {children}
      <div className="flex items-center justify-between">
        {display && views}
        <div className="flex items-center gap-2">
          {sortMenu}
          {display && zoom}
        </div>
      </div>
    </div>
  )
}
export function CollectionBar({
  scId,
  state,
  onChange,
  facets,
  sorts,
  layout = 'stacked',
  display = true,
  leading,
  growSearch = false,
  className,
}: CollectionBarProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const inline = layout !== 'stacked'
  const context = { scId, state, onChange, t }
  const search = collectionSearch({ ...context, growSearch, layout })
  const menus = collectionMenus({ ...context, shown: facets ?? [] })
  const sortMenu = collectionSort({ ...context, sorts })
  const views = collectionViews(context)
  const zoom = collectionZoom(context)
  if (inline) {
    return inlineCollectionBar({
      layout,
      leading,
      display,
      className,
      search,
      menus,
      sortMenu,
      views,
      zoom,
    })
  }
  const all = facets ?? []
  const folded = all.length > FACETS_BEFORE_FOLD
  const visible = expanded || !folded ? all : all.slice(0, FACETS_BEFORE_FOLD)
  return stackedCollectionBar({
    layout,
    leading,
    display,
    className,
    search,
    menus,
    sortMenu,
    views,
    zoom,
    children: (
      <>
        {visible.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {collectionMenus({ ...context, shown: visible })}
          </div>
        )}

        {folded && (
          <FoldRule
            open={expanded}
            onToggle={() => setExpanded(current => !current)}
            moreLabel={t('collection.more')}
            fewerLabel={t('collection.fewer')}
            moreHint={t('collection.moreHint')}
            fewerHint={t('collection.fewerHint')}
            scId="collection.facets"
          />
        )}
      </>
    ),
  })
}
