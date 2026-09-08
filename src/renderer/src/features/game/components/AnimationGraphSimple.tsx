// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import { BUILT_IN_PARAMETERS, type AnimationGraph } from '@shared/domain/animationGraph'
import { FieldGrid } from '@/components/FieldGrid'
import { PropertySection } from '@/components/PropertySection'
import { Tag } from '@/components/Tag'
import { FIELD_HELP } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { clipSourceLabel, conditionLabel, layerOf } from './animationGraphPresentation'

type AnimationGraphSimpleProps = { graph: AnimationGraph }

/** What the graph DOES, read rather than set — the view someone opening the format lands on. */
export function AnimationGraphSimple({ graph }: AnimationGraphSimpleProps) {
  const { t } = useTranslation()
  const layer = layerOf(graph)

  return (
    <div className="flex flex-col gap-2 p-(--sc-gutter)">
      <PropertySection
        title={t('game.animationGraph.parameters')}
        description={t('game.animationGraph.parametersDescription')}
        scId="animationGraph.parameters"
        plate
      >
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(BUILT_IN_PARAMETERS).map(id => (
            <Tag key={id}>{id}</Tag>
          ))}
          {graph.parameters.map(parameter => (
            <Tag key={parameter.id}>
              {parameter.id} · {t(`game.animationGraph.parameterKinds.${parameter.kind}`)}
            </Tag>
          ))}
        </div>
        <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.builtInDescription')}</p>
      </PropertySection>

      <PropertySection
        title={t('game.animationGraph.states')}
        description={t('game.animationGraph.statesDescription')}
        scId="animationGraph.states"
        plate
      >
        <FieldGrid>
          {(layer?.states ?? []).map(state => (
            <article
              key={state.id}
              className="border-border bg-surface flex flex-col gap-1.5 rounded-(--radius-sc-md) border p-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <strong className="text-xs font-medium">{state.id}</strong>
                {state.id === layer?.initial && (
                  <span className="text-accent-ink text-tiny shrink-0">
                    {t('game.animationGraph.initialBadge')}
                  </span>
                )}
              </div>
              <p className={cn(FIELD_HELP, 'm-0')}>{clipSourceLabel(state.source)}</p>
              <div className="flex flex-wrap gap-1.5">
                <Tag>{t(`inspector.rootMotion_${state.rootMotion}`)}</Tag>
                {state.loop && <Tag>{t('inspector.clipLoop')}</Tag>}
              </div>
            </article>
          ))}
        </FieldGrid>
      </PropertySection>

      <PropertySection
        title={t('game.animationGraph.transitions')}
        description={t('game.animationGraph.transitionsDescription')}
        scId="animationGraph.transitions"
        plate
      >
        {(layer?.transitions ?? []).length === 0 ? (
          <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.noTransition')}</p>
        ) : (
          <FieldGrid>
            {(layer?.transitions ?? []).map((transition, index) => (
              <article
                key={`${transition.from}:${transition.to}:${index}`}
                className="border-border bg-surface flex flex-col gap-1.5 rounded-(--radius-sc-md) border p-2"
              >
                <strong className="text-xs font-medium">
                  {t('game.animationGraph.transitionSentence', {
                    from: transition.from || t('game.animationGraph.anyState'),
                    to: transition.to,
                  })}
                </strong>
                <div className="flex flex-wrap gap-1.5">
                  {transition.when.map(condition => (
                    <Tag key={conditionLabel(condition)}>{conditionLabel(condition)}</Tag>
                  ))}
                </div>
              </article>
            ))}
          </FieldGrid>
        )}
      </PropertySection>
    </div>
  )
}
