import { Suspense, type ComponentProps, type Dispatch, type SetStateAction } from 'react'
import { mdiCreationOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { AiRoleId } from '@shared/domain/aiRole'
import type { Job } from '@shared/domain/job'
import type { LandingTarget } from '@shared/domain/landingTarget'
import type { FormValues } from '@/helpers/dynamicForm'
import type { DynamicForm } from '@/components/dynamicFormLazy'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PANEL_SCROLL } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { dictationAccessory } from '@/features/dictation/components/Dictation/DictationField'
import { failureKeyOf } from '@/services/failureMessage'
import { GeneratorContext } from './GeneratorContext'
import { GeneratorLanding } from './Landing/GeneratorLanding'
import { GeneratorLandingDialog } from './Landing/GeneratorLandingDialog'
import { GeneratorModel } from './GeneratorModel'
import { GeneratorOperation } from './GeneratorOperation'
import { GeneratorPixelArt } from './GeneratorPixelArt'
import { GeneratorRun } from './GeneratorRun'
import { GeneratorSources } from './GeneratorSources'
import { GeneratorComments } from './GeneratorComments'

type FormProps = ComponentProps<typeof DynamicForm>
type OperationProps = ComponentProps<typeof GeneratorOperation>
type ModelProps = ComponentProps<typeof GeneratorModel>
type SourceProps = ComponentProps<typeof GeneratorSources>
type ContextProps = ComponentProps<typeof GeneratorContext>
type PixelProps = ComponentProps<typeof GeneratorPixelArt>
type LandingProps = ComponentProps<typeof GeneratorLanding>

type GeneratorFormProps = {
  Form: typeof DynamicForm
  asking: FormValues | null
  setAsking: Dispatch<SetStateAction<FormValues | null>>
  answerLanding: (target: LandingTarget, remember: boolean) => void
  capability: OperationProps['capability']
  onForce: OperationProps['onForce']
  model: ModelProps
  descriptor: { pending: boolean; error: unknown; ready: boolean }
  sourcesInput: SourceProps
  context: ContextProps
  pixelArt: PixelProps
  role: AiRoleId | null
  offered: LandingTarget | null
  landing: LandingTarget | null
  landingChoice: LandingProps['choice']
  onLanding: (target: LandingTarget) => void
  running: Job | null
  refusal?: string
  submitNote: FormProps['submitNote']
  form: Pick<FormProps, 'fields' | 'preset' | 'sources' | 'onValuesChange'> & {
    onSubmit: (values: FormValues) => void
    busy: boolean
  }
}

export function GeneratorForm(props: GeneratorFormProps) {
  const { t } = useTranslation()
  return (
    <>
      {props.asking && (
        <GeneratorLandingDialog
          onCancel={() => props.setAsking(null)}
          onAnswer={props.answerLanding}
        />
      )}
      <div className={cn(PANEL_SCROLL, 'gap-2 pt-2 pl-2')}>
        {generatorFormSetup(props, t)}
        {generatorFormRun(props, t)}
      </div>
    </>
  )
}

function generatorFormSetup(props: GeneratorFormProps, t: ReturnType<typeof useTranslation>['t']) {
  return (
    <>
      <GeneratorOperation capability={props.capability} onForce={props.onForce} />
      <GeneratorModel {...props.model} />
      {props.model.modelId !== null && props.descriptor.pending && (
        <EmptyState icon={mdiCreationOutline} message={t('collection.loading')} />
      )}
      {props.model.modelId !== null && props.descriptor.error !== null && (
        <EmptyState icon={mdiCreationOutline} message={t(failureKeyOf(props.descriptor.error))} />
      )}
      <GeneratorSources {...props.sourcesInput} />
      <GeneratorComments fields={props.form.fields} />
      {props.descriptor.ready && props.model.modelId !== null && (
        <GeneratorContext {...props.context} />
      )}
      <GeneratorPixelArt {...props.pixelArt} />
      {props.role !== null && props.offered !== null && props.landing !== null && (
        <GeneratorLanding
          role={props.role}
          choice={props.landingChoice}
          landing={props.landing}
          onLanding={props.onLanding}
        />
      )}
    </>
  )
}

function generatorFormRun(props: GeneratorFormProps, t: ReturnType<typeof useTranslation>['t']) {
  const Form = props.Form
  return (
    <>
      <GeneratorRun job={props.running} />
      {props.refusal && <p className="text-muted text-xs">{props.refusal}</p>}
      {props.descriptor.ready && (
        <ErrorBoundary>
          <Suspense
            fallback={<EmptyState icon={mdiCreationOutline} message={t('collection.loading')} />}
          >
            <Form
              {...props.form}
              submitNote={props.submitNote}
              submitLabel={t('actions.generate')}
              submitHint={t('actions.generateHint')}
              accessory={dictationAccessory}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}
