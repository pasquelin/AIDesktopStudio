import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCAL_RUNTIME, type ModelSummary } from '@shared/domain/model'
import { runtimeLabel } from '@/helpers/runtimeLabel'
import type { ModelRefusalWord } from '@/hooks/useModelReach'
import { useDismiss } from '@/hooks/useDismiss'
import { useMenuKeys } from '@/hooks/useMenuKeys'
import { cn } from '@/helpers/cn'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { fieldHandle } from '../scHandle'
import { Chip } from '../Chip'
import { SearchField } from '../SearchField'
import { Thumbnail } from '../Thumbnail'
import { FIELD, MENU_SURFACE, FIELD_THUMBNAIL } from '../styles'
import { ModelPickerRow } from './ModelPickerRow'

/** What the list may be narrowed to. `all` is the state it opens in. */
type Scope = 'all' | 'local' | 'cloud' | 'installed'

const SCOPES: readonly Scope[] = ['all', 'local', 'cloud', 'installed']

export type ModelPickerProps = {
  /** Names the control, so a `<label>` above it may bind: a `<button>` is labelable. */
  id?: string
  models: readonly ModelSummary[]
  /**
   * A word for the models worth looking at first, and the ORDER is the host's — this list is
   * shown as it arrives. Nothing is ever hidden by it.
   */
  promotedOf?: (model: ModelSummary) => string | undefined
  /** The model in use, or `null` when the employment is served by nothing yet. */
  value: string | null
  onChange: (modelId: string) => void
  /** Why a model cannot be picked, per model, in the host's words. */
  refusalOf?: (model: ModelSummary) => ModelRefusalWord | undefined
  /** Its picture, resolved by the host: most cloud models carry a signed example, not a thumbnail. */
  pictureOf?: (model: ModelSummary) => string | undefined
  /**
   * Told what the picker will DRAW — its whole list, at mount, closed or not. Wider than
   * `Collection`'s prop of the same name, which reports only the virtualised window.
   */
  onVisible?: (models: readonly ModelSummary[]) => void
  /** What the closed control says under the name — where it runs, whether it is installed. */
  caption?: string
  /**
   * What the model in use is called when it is not in the page the picker holds. A control whose
   * value matches no row draws blank, which reads as a panel that lost its model.
   */
  valueLabel?: string
  /** Shown in place of a name when nothing serves the employment yet. */
  emptyLabel: string
}

function within(model: ModelSummary, scope: Scope): boolean {
  if (scope === 'local') return model.runsOn === LOCAL_RUNTIME
  if (scope === 'cloud') return model.runsOn !== LOCAL_RUNTIME
  // `installed` is ABSENT for a cloud model — nothing to install there — so `!== false` let the
  // whole catalogue through this facet. It answers one question: are the weights on this disk.
  if (scope === 'installed') return model.runsOn === LOCAL_RUNTIME && model.installed === true
  return true
}

/**
 * The model in use, changed without leaving the panel. A flyout rather than a surface of its own:
 * choosing a model is a step of a generation, not a destination — managing them is the settings'.
 */
export function ModelPicker({
  id,
  models,
  value,
  onChange,
  refusalOf,
  promotedOf,
  pictureOf,
  onVisible,
  caption,
  valueLabel,
  emptyLabel,
}: ModelPickerProps) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<Scope>('all')

  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase()
    return models.filter(
      model => within(model, scope) && (!wanted || model.name.toLowerCase().includes(wanted)),
    )
  }, [models, scope, search])

  /**
   * Where each runtime is called, resolved once for the whole list: a row that translated its
   * own ran i18next per row and per render — a hundred of them, on every keystroke of the
   * search below. Keyed by runtime rather than by model, there being a handful of the first.
   */
  const runtimeLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const model of models) {
      if (!labels.has(model.runsOn)) labels.set(model.runsOn, runtimeLabel(model.runsOn, t))
    }
    return labels
  }, [models, t])

  // Stable, so a memoised row is not handed a new callback on every render of this panel.
  const pick = useCallback(
    (modelId: string) => {
      onChange(modelId)
      setOpen(false)
    },
    [onChange],
  )

  const chosen = models.find(model => model.id === value)

  // 🛑 Asked for BEFORE the flyout opens, never when. Measured on screen: the round trip is
  // ~830ms, over which the list drew 54 empty plates out of 61 — the whole of what a person
  // sees of it. `chosen` is one of these, so the closed plate is covered by the same breath.
  useEffect(() => {
    onVisible?.(models)
  }, [models, onVisible])

  const close = open ? () => setOpen(false) : undefined
  useDismiss(close, panel, anchor)
  useMenuKeys(panel, close)

  return (
    <>
      <button
        type="button"
        id={id}
        ref={setAnchor}
        data-sc={fieldHandle('generation.model')}
        aria-haspopup="menu"
        aria-expanded={open}
        // A name over a caption: one control's worth of height clipped the name away.
        // `FIELD`, not `CONTROL`: this one stands in a form, beside its bordered fields, not on a bar.
        className={cn(
          FIELD,
          'flex h-auto min-h-(--sc-control) w-full cursor-pointer items-center gap-2 px-2 py-1 text-left',
        )}
        onClick={() => setOpen(held => !held)}
      >
        <Thumbnail url={chosen ? pictureOf?.(chosen) : undefined} className={FIELD_THUMBNAIL} />

        <span className="flex min-w-0 flex-col">
          <span className="text-text truncate text-xs">
            {chosen?.name ?? valueLabel ?? emptyLabel}
          </span>
          {caption && <span className="text-muted text-tiny truncate">{caption}</span>}
        </span>
      </button>

      {open && (
        /* 🛑 IN FLOW, under the control, never floating: a `fixed` panel does not follow the
           form it belongs to, and scrolling left the list hanging over the wrong field. */
        <div
          ref={panel}
          role="menu"
          // The field corner over the menu one: in flow under the control, it reads as a field.
          className={cn(MENU_SURFACE, 'mt-1 max-h-80 w-full rounded-(--radius-sc-sm) p-2')}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <SearchField
              label={t('generation.searchModel')}
              value={search}
              onChange={setSearch}
              scId="generation.modelSearch"
            />

            <div className="flex gap-2" role="group" aria-label={t('generation.modelScope')}>
              {SCOPES.map(one => (
                <Chip
                  key={one}
                  label={t(`generation.modelScope_${one}`)}
                  hint={t('generation.modelScopeHint')}
                  tip={HINT_BOTTOM}
                  selected={scope === one}
                  data-sc={fieldHandle(`generation.modelScope.${one}`)}
                  onClick={() => setScope(one)}
                />
              ))}
            </div>

            <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {shown.map(model => (
                <li key={model.id}>
                  <ModelPickerRow
                    model={model}
                    selected={model.id === value}
                    where={runtimeLabels.get(model.runsOn) ?? model.runsOn}
                    promoted={promotedOf?.(model)}
                    picture={pictureOf?.(model)}
                    refusal={refusalOf?.(model)}
                    onPick={pick}
                  />
                </li>
              ))}
            </ul>

            {shown.length === 0 && (
              <p className="text-muted text-tiny px-2 py-1">{t('collection.noMatch')}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
