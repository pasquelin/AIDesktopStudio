import { useCallback, useId, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { providerOfModel, type AiRoleId } from '@shared/domain/aiRole'
import { pixelArtFirst, suitsPixelArt, type ModelSummary } from '@shared/domain/model'
import type { PlanAccess } from '@shared/domain/plan'
import { ModelPicker } from '@/components/ModelPicker/ModelPicker'
import { ModelDownloadDialog } from '@/features/models/components/ModelDownloadDialog'
import { runtimeLabel } from '@/helpers/runtimeLabel'
import { FormField } from '@/components/FormField'
import { useLazyPreviews } from '@/hooks/useLazyPreviews'
import { usePixelArtGrid } from '@/hooks/usePixelArtGrid'
import { useModelsForCapability } from '@/hooks/useModelsForCapability'
import { useModelReach, type ModelRefusalWord } from '@/hooks/useModelReach'
import { useModels } from '@/stores/models'
import { useAiModels } from '@/stores/aiModels'

export type GeneratorModelProps = {
  capability: AiRoleId
  /** Read once by the panel above: `usePlanAccess` is a round trip, and two mount two. */
  plan: PlanAccess | null
  /** The model serving it right now, or `null` when nothing does yet. */
  modelId: string | null
  /**
   * What the model in use is called. The picker holds the head of the catalogue only, and a
   * control whose value matches no row draws blank — which reads as a panel that lost its model.
   */
  name?: string
}

/** Where it runs, and what stands between it and a generation — said before the click. */
function captionOf(
  model: ModelSummary,
  refusal: ModelRefusalWord | undefined,
  t: (key: string) => string,
): string {
  const where = runtimeLabel(model.runsOn, t)
  const state =
    refusal?.word ?? (model.installed === true ? t('generation.modelInstalled') : undefined)

  return state === undefined ? where : `${where} · ${state}`
}

/**
 * The model in use, visible while a prompt is written. Picking one writes the preference of THIS
 * employment and no other (ADR-23 § C): the same weights serve several.
 *
 * 🛑 It carries the sentence for having none, because it is the only one holding the catalogue:
 * the panel above said "no model available for this operation" over a picker listing a dozen —
 * two different states, "the catalogue is empty here" and "none is chosen yet", under one word.
 */
export function GeneratorModel({ capability, modelId, name, plan }: GeneratorModelProps) {
  const field = useId()
  const { t } = useTranslation()
  const listed = useModelsForCapability(capability)
  const onGrid = usePixelArtGrid() !== null

  /**
   * A TRI, never a filter: the ones that say they draw pixel art come first and the catalogue's
   * own order is kept inside each half, so nothing is hidden by not being recognised.
   *
   * ⚠️ It only lifts what is ALREADY loaded — `useModelPages` holds 60 of some 640, so a model
   * at offset 300 will not appear. Seeding the list with a search of its own would be a request
   * per opening, duplicates, and a list that moves while it is being read.
   */
  const models = useMemo(() => (onGrid ? pixelArtFirst(listed) : listed), [listed, onGrid])
  // Memoised for the caller's sake, not the rows': `ModelPickerRow` is handed the STRING and
  // compares it by value, so no row memo turns on this identity.
  const promotedOf = useCallback(
    (one: ModelSummary) =>
      onGrid && suitsPixelArt(one) ? t('generation.suitsPixelArt') : undefined,
    [onGrid, t],
  )

  const select = useModels(state => state.select)
  const chooseAiProvider = useAiModels(state => state.chooseAiProvider)
  const projectPath = useAiModels(state => state.overview?.projectPath ?? null)
  const reachOf = useModelReach(plan)

  // Memoised on the answer it narrows, which `useModelReach` already keeps stable: an inline
  // arrow here handed the picker a new function per render, and every row with it.
  const refusalOf = useCallback(
    (model: ModelSummary): ModelRefusalWord | undefined => reachOf(model).refusal,
    [reachOf],
  )

  const { pictureOf, resolveFor } = useLazyPreviews()
  const chosen = models.find(one => one.id === modelId)
  const [offered, setOffered] = useState<ModelSummary | null>(null)

  return (
    <div>
      {offered && <ModelDownloadDialog model={offered} onClose={() => setOffered(null)} />}

      {/* No `htmlFor`: the picker is a DISCLOSURE, and a label forwards its click — the panel
          opened on the forwarded one and closed on the original, which lands outside it. The
          button names itself by the model it shows. */}
      <FormField label={t('generation.model')}>
        <ModelPicker
          id={field}
          models={models}
          promotedOf={promotedOf}
          value={modelId}
          onChange={id => {
            const model = models.find(one => one.id === id)
            if (!model) return

            // 🛑 The one refusal the studio can lift itself: arming weights that are not on the
            // disk builds a generation that cannot run, where the offer to fetch them is right
            // here. ADR-23 § D — the panel downloads or sends to configure, without leaving.
            if (reachOf(model).fetchable) {
              setOffered(model)
              return
            }

            select(capability, id)
            void chooseAiProvider(
              capability,
              providerOfModel(model),
              projectPath === null ? 'app' : 'project',
            )
          }}
          refusalOf={refusalOf}
          pictureOf={pictureOf}
          onVisible={resolveFor}
          caption={chosen ? captionOf(chosen, refusalOf(chosen), t) : undefined}
          valueLabel={name}
          emptyLabel={t('generation.chooseModel')}
        />
      </FormField>

      {/* Under the field rather than in the middle of the panel: it is about the control right
          above it, and a picker that opens into the flow pushed a centred message off centre.

          🛑 ANGLE MORT: `useModelsForCapability` answers a bare list, so « being fetched » and
          « refused » both read as « no model serves this », stated as fact and with no retry.
          `usePages` publishes `pending` and `refusal` since 25 August — the hook swallows them,
          and taking them through is what closes this. */}
      {modelId === null && (
        <p className="text-muted text-tiny pt-1">
          {t(
            models.length === 0 ? 'generation.noModelForOperation' : 'generation.chooseModelFirst',
          )}
        </p>
      )}
    </div>
  )
}
