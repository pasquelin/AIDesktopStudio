// SPDX-License-Identifier: MIT
import { mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type {
  AnimationGraph,
  AnimationParameter,
  AnimationParameterKind,
  AnimationState,
} from '@shared/domain/animationGraph'
import { BODY_PARTS, type BodyPart } from '@shared/domain/humanoid'
import { Button } from '@/components/Button'
import { FieldGrid } from '@/components/FieldGrid'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ToolButton } from '@/components/ToolButton'
import { FIELD_HELP } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { TIP_LEFT } from '@/helpers/tooltip'
import { AnimationGraphStateForm } from './AnimationGraphStateForm'
import { AnimationGraphTransitionForm } from './AnimationGraphTransitionForm'
import { layerOf, withLayer } from './animationGraphPresentation'

type AnimationGraphExpertProps = {
  graph: AnimationGraph
  onChange: (graph: AnimationGraph) => void
}

const PARAMETER_KINDS: readonly AnimationParameterKind[] = ['number', 'boolean']

/** A state born here plays nothing yet: the clip is named next, and the reader takes an empty one. */
function newState(count: number): AnimationState {
  return {
    id: `state${count + 1}`,
    source: { kind: 'bundled', name: 'Idle' },
    loop: true,
    speed: 1,
    rootMotion: 'inPlace',
  }
}

export function AnimationGraphExpert({ graph, onChange }: AnimationGraphExpertProps) {
  const { t } = useTranslation()
  const layer = layerOf(graph)
  if (!layer) return null

  const changedParameter = (at: number, parameter: AnimationParameter | null): void => {
    const parameters = parameter
      ? graph.parameters.map((one, index) => (index === at ? parameter : one))
      : graph.parameters.filter((_, index) => index !== at)
    onChange({ ...graph, parameters })
  }

  return (
    <div className="flex flex-col gap-2 p-(--sc-gutter)">
      <PropertySection
        title={t('game.animationGraph.context')}
        description={t('game.animationGraph.contextDescription')}
        scId="animationGraph.context"
        plate
      >
        <FieldGrid>
          <TextField
            scId="animationGraph.context.id"
            label={t('game.animationGraph.id')}
            hint={TIP_LEFT(t('game.animationGraph.id'), false, t('game.animationGraph.idHelp'))}
            value={graph.id}
            onChange={id => onChange({ ...graph, id })}
          />
          <SelectField
            scId="animationGraph.context.part"
            label={t('inspector.clipPart')}
            value={layer.part}
            options={BODY_PARTS.map((part: BodyPart) => ({
              value: part,
              label: t(`inspector.clipPart_${part}`),
            }))}
            onChange={part => onChange(withLayer(graph, { ...layer, part }))}
          />
          <SelectField
            scId="animationGraph.context.initial"
            label={t('game.animationGraph.initial')}
            hint={TIP_LEFT(
              t('game.animationGraph.initial'),
              false,
              t('game.animationGraph.initialHelp'),
            )}
            value={layer.initial}
            options={layer.states.map(state => ({ value: state.id, label: state.id }))}
            onChange={initial => onChange(withLayer(graph, { ...layer, initial }))}
          />
        </FieldGrid>
      </PropertySection>

      <PropertySection
        title={t('game.animationGraph.parameters')}
        description={t('game.animationGraph.parametersDescription')}
        scId="animationGraph.parameters"
        plate
      >
        <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.builtInDescription')}</p>
        {graph.parameters.length === 0 && (
          <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.noParameter')}</p>
        )}
        {graph.parameters.map((parameter, at) => (
          <FieldGrid key={`${parameter.id}:${at}`}>
            <TextField
              scId={`animationGraph.parameter.${at}.id`}
              label={t('inspector.name')}
              value={parameter.id}
              onChange={id => changedParameter(at, { ...parameter, id })}
            />
            <SelectField
              scId={`animationGraph.parameter.${at}.kind`}
              label={t('game.animationGraph.parameterKind')}
              value={parameter.kind}
              options={PARAMETER_KINDS.map(kind => ({
                value: kind,
                label: t(`game.animationGraph.parameterKinds.${kind}`),
              }))}
              onChange={kind => changedParameter(at, { ...parameter, kind })}
            />
            <div className="flex items-center justify-end">
              <ToolButton
                icon={mdiTrashCanOutline}
                label={t('game.animationGraph.removeParameter')}
                tooltip={TIP_LEFT}
                variant="row"
                onClick={() => changedParameter(at, null)}
              />
            </div>
          </FieldGrid>
        ))}
        <div className="flex">
          <Button
            onClick={() =>
              onChange({
                ...graph,
                parameters: [
                  ...graph.parameters,
                  { id: `parameter${graph.parameters.length + 1}`, kind: 'number' },
                ],
              })
            }
          >
            {t('game.animationGraph.addParameter')}
          </Button>
        </div>
      </PropertySection>

      {layer.states.map((state, at) => (
        <AnimationGraphStateForm
          key={`${state.id}:${at}`}
          graph={graph}
          state={state}
          onChange={next =>
            onChange(
              withLayer(graph, {
                ...layer,
                states: next
                  ? layer.states.map((one, index) => (index === at ? next : one))
                  : layer.states.filter((_, index) => index !== at),
              }),
            )
          }
        />
      ))}

      <PropertySection
        title={t('game.animationGraph.transitions')}
        description={t('game.animationGraph.transitionsDescription')}
        scId="animationGraph.transitions"
        plate
      >
        {layer.transitions.length === 0 && (
          <p className={cn(FIELD_HELP, 'm-0')}>{t('game.animationGraph.noTransition')}</p>
        )}
        {layer.transitions.map((transition, at) => (
          <AnimationGraphTransitionForm
            key={`${transition.from}:${transition.to}:${at}`}
            graph={graph}
            layer={layer}
            transition={transition}
            rank={at + 1}
            onChange={next =>
              onChange(
                withLayer(graph, {
                  ...layer,
                  transitions: next
                    ? layer.transitions.map((one, index) => (index === at ? next : one))
                    : layer.transitions.filter((_, index) => index !== at),
                }),
              )
            }
          />
        ))}
        <div className="flex">
          <Button
            onClick={() =>
              onChange(
                withLayer(graph, {
                  ...layer,
                  transitions: [
                    ...layer.transitions,
                    {
                      from: layer.initial,
                      to: layer.states[0]?.id ?? layer.initial,
                      fade: 0,
                      when: [{ param: 'speed', op: '>', value: 0 }],
                      priority: 0,
                    },
                  ],
                }),
              )
            }
          >
            {t('game.animationGraph.addTransition')}
          </Button>
        </div>
      </PropertySection>

      <div className="flex">
        <Button
          variant="primary"
          onClick={() =>
            onChange(
              withLayer(graph, {
                ...layer,
                states: [...layer.states, newState(layer.states.length)],
              }),
            )
          }
        >
          {t('game.animationGraph.addState')}
        </Button>
      </div>
    </div>
  )
}
