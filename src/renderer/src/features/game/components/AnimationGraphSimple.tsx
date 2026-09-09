// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import type { AnimationGraph } from '@shared/domain/animationGraph'
import { READING_BLOCK } from '@/components/panelStyles'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { Tag } from '@/components/Tag'
import { FIELD_HELP, PANEL_GROUP_LABEL } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { AnimationGraphParameterTags } from './AnimationGraphParameterTags'
import { conditionLabel, conditionsLabel, entriesOf, layerOf } from './animationGraphPresentation'

type AnimationGraphSimpleProps = { graph: AnimationGraph }

/** What the graph DOES, read rather than set — the view someone opening the format lands on. */
export function AnimationGraphSimple({ graph }: AnimationGraphSimpleProps) {
  const { t } = useTranslation()
  const layer = layerOf(graph)
  // The reader refuses a graph without one, so a file that opened at all has its layer.
  if (!layer) return null

  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertySection
        title={t('game.animationGraph.parameters')}
        description={t('game.animationGraph.parametersDescription')}
        scId="animationGraph.parameters"
        plate
      >
        <AnimationGraphParameterTags parameters={graph.parameters} />
        <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.builtInDescription')}</p>
      </PropertySection>

      <PropertySection
        title={t('game.animationGraph.states')}
        description={t('game.animationGraph.statesDescription')}
        scId="animationGraph.states"
        plate
      >
        <div className="flex flex-col gap-2">
          {layer.states.map(state => {
            const entries = entriesOf(layer, state.id)
            return (
              <article key={state.id} className={READING_BLOCK}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-xs font-medium">{state.id}</strong>
                  {state.id === layer.initial && (
                    <span className="text-accent-ink text-tiny shrink-0">
                      {t('game.animationGraph.initialBadge')}
                    </span>
                  )}
                </div>
                <PropertyRow label={t('inspector.clip')}>{state.source.name}</PropertyRow>
                <PropertyRow label={t('inspector.clipRootMotion')}>
                  {t(`inspector.rootMotion_${state.rootMotion}`)}
                </PropertyRow>
                <PropertyRow label={t('inspector.animation')}>
                  {state.loop ? t('inspector.clipLoop') : t('game.animationGraph.stateOnce')}
                </PropertyRow>

                {/* The half a list of states never showed: WHEN it is played. A name and a clip say
                    what the thing is called; only the ways in say what makes it happen. */}
                <span className={PANEL_GROUP_LABEL}>{t('game.animationGraph.stateEntries')}</span>
                {entries.length === 0 ? (
                  <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.stateNoEntry')}</p>
                ) : (
                  entries.map((entry, at) => (
                    <p key={`${entry.from}:${at}`} className={cn(FIELD_HELP, 'm-0')}>
                      {entry.when.length === 0
                        ? t('game.animationGraph.stateEntryAlways', {
                            from: entry.from || t('game.animationGraph.anyState'),
                          })
                        : t('game.animationGraph.stateEntryWhen', {
                            from: entry.from || t('game.animationGraph.anyState'),
                            when: conditionsLabel(entry),
                          })}
                    </p>
                  ))
                )}
              </article>
            )
          })}
        </div>
      </PropertySection>

      <PropertySection
        title={t('game.animationGraph.transitions')}
        description={t('game.animationGraph.transitionsDescription')}
        scId="animationGraph.transitions"
        plate
      >
        {layer.transitions.length === 0 ? (
          <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.noTransition')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {layer.transitions.map((transition, index) => (
              <article
                key={`${transition.from}:${transition.to}:${index}`}
                className={READING_BLOCK}
              >
                <strong className="text-xs font-medium">
                  {t('game.animationGraph.transitionSentence', {
                    from: transition.from || t('game.animationGraph.anyState'),
                    to: transition.to,
                  })}
                </strong>
                <div className="flex flex-wrap gap-1.5">
                  {transition.when.map(condition => {
                    const label = conditionLabel(condition)
                    return <Tag key={label}>{label}</Tag>
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </PropertySection>
    </div>
  )
}
