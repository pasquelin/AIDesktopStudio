import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ADVANCED_GROUP } from '@shared/domain/localFields'
import type { FieldDescriptor } from '@shared/domain/model'
import {
  buildBody,
  defaultValues,
  dependencyKeys,
  groupFields,
  isNumeric,
  randomSeed,
  visibleFields,
  type FormValues,
} from '@/helpers/dynamicForm'
import { buildSchema } from '@/helpers/dynamicFormSchema'
import { cn } from '@/helpers/cn'
import { FIELD_HELP, PANEL_GROUP_LABEL } from '../styles'
import { useModelText } from '@/hooks/useModelText'
import { Button } from '../Button'
import { FormField } from '../FormField'
import { FoldRule } from '../FoldRule'
import { DynamicFormControl } from './DynamicFormControl'
import { HINT_TOP } from '@/helpers/tooltip'

export type DynamicFormProps = {
  fields: readonly FieldDescriptor[]
  /**
   * Absent where the form is not run but read into something — parameters kept for a caller that
   * submits later. The button then has nothing to say and is not drawn.
   */
  onSubmit?: (body: FormValues) => void
  submitLabel?: string
  /** What the submit label does not say. Required with it: a form's one action is the one
   * nobody should have to press to find out about. */
  submitHint?: string
  /** Beside the label on the button, for what the form costs. Absent draws nothing. */
  submitNote?: string
  /**
   * The body as it stands, on every edit. A subscription rather than a watched value: rendering
   * on each keystroke is what the dependency watch below goes out of its way to avoid.
   */
  onValuesChange?: (body: FormValues) => void
  busy?: boolean
  /**
   * Values to open on, over each field's own default. What "regenerate with these parameters"
   * hands in; keys the model never declared are ignored, since a set kept from another model
   * would reach fields that do not exist.
   */
  preset?: FormValues
  /**
   * The half of `preset` the CONTEXT fills and takes back — a picture selected in the shelf. Kept
   * apart because it is the half that may vanish under the person's hand: a value it stopped
   * naming is dropped rather than carried, so withdrawing a source really leaves the form. The
   * rest of the preset carries as § 22 asks.
   */
  sources?: FormValues
  /**
   * Rendered inside each field that has room for it — the foot of a long text box, where a
   * spoken prompt is dictated. Called for every field so that nothing about any particular
   * feature is decided here; answering `null` leaves the field alone.
   *
   * The field alone, with no handle onto its value. It carried one — `read`, `write`, `readAll`
   * — for prompt assistance, which rewrote the field it hung under. That moved to the assistant,
   * which reaches the form through `GeneratorBridge` instead, and nothing was left reading it.
   */
  accessory?: (field: FieldDescriptor) => ReactNode
}

/**
 * Renders a form from the descriptors a model published. Nothing about any particular model
 * appears here: writing a form by hand for a given model is a bug, not a shortcut.
 */
export function DynamicForm({
  fields,
  onSubmit,
  submitLabel,
  submitHint,
  submitNote,
  onValuesChange,
  busy = false,
  preset,
  sources,
  accessory,
}: DynamicFormProps) {
  const { t } = useTranslation()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const say = useModelText()
  // Two generators can be open at once — the panel and a detached window — and an id repeated
  // across them would point every label at the first form's field.
  const formId = useId()
  const schema = useMemo(() => buildSchema(fields), [fields])
  const initial = useMemo(() => defaultValues(fields, preset), [fields, preset])
  // The sources of the PREVIOUS reset, so the next one can tell what the person typed from what
  // the workspace filled. Not `useLatest`, which answers with the current render: this is read
  // before it is written, in the same effect, and a ref answering `sources` would compare it to
  // itself.
  const applied = useRef<FormValues | undefined>(undefined)
  // Split rather than reordered: the advanced knobs are drawn UNDER the button, and a fieldset
  // hidden in place would leave the disclosure describing something above it.
  const [plain, advanced] = useMemo(() => {
    const groups = groupFields(fields)
    return [
      groups.filter(([group]) => group !== ADVANCED_GROUP),
      groups.filter(([group]) => group === ADVANCED_GROUP),
    ]
  }, [fields])
  const dependencies = useMemo(() => dependencyKeys(fields), [fields])

  const { register, handleSubmit, watch, setValue, getValues, reset, formState } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: initial,
    })

  /**
   * § 22: switching model keeps what the two have in common and drops the rest. `getValues()` is
   * read INSIDE the effect, so it still answers with the form the previous descriptor built —
   * `initial` above cannot see it, being computed during the render that already has the new
   * fields.
   */
  useEffect(() => {
    reset(defaultValues(fields, preset, getValues(), applied.current))
    applied.current = sources
    // `initial` and not `fields`/`preset`: it is the memo of exactly those two, so listing them
    // beside it would say the same thing twice.
  }, [initial, fields, preset, sources, getValues, reset])

  // Subscribed, not rendered: `watch(callback)` reports every edit without making this component
  // a listener of its own form. The body is built the same way submitting builds it, so what is
  // priced is what would be sent.
  useEffect(() => {
    if (!onValuesChange) return

    onValuesChange(buildBody(fields, getValues()))
    const subscription = watch(current => onValuesChange(buildBody(fields, current)))
    return () => subscription.unsubscribe()
  }, [fields, getValues, onValuesChange, watch])

  // Watching the whole form would re-render every control on every keystroke. Only the keys
  // another field declares a dependency on can change what is on screen.
  const watched = dependencies.length > 0 ? watch(dependencies) : []
  const values: FormValues = Object.fromEntries(
    dependencies.map((key, index) => [key, watched[index]]),
  )

  if (fields.length === 0) {
    return <p className="text-muted p-2 text-xs">{t('generation.noParameter')}</p>
  }

  const fieldsetOf = ([group, groupedFields]: (typeof plain)[number]) => (
    <fieldset key={group} className="m-0 flex flex-col gap-4 border-0 p-0">
      {group && group !== ADVANCED_GROUP && (
        <legend className={cn(PANEL_GROUP_LABEL, 'p-0')}>{say(group)}</legend>
      )}

      {visibleFields(groupedFields, values).map(field => (
        // Named THROUGH the label rather than by nesting the control in it: an accessory holds
        // buttons, and everything a label wraps is read out as the control's own name.
        <FormField
          key={field.key}
          label={say(field.label)}
          htmlFor={`${formId}${field.key}`}
          required={field.required}
          // A checkbox is the one control whose name belongs on its own line, after the box.
          beside={field.kind === 'boolean'}
          control={
            <DynamicFormControl
              id={`${formId}${field.key}`}
              field={field}
              registration={register(field.key, { valueAsNumber: isNumeric(field.kind) })}
              initial={initial[field.key]}
              onRoll={() => setValue(field.key, randomSeed())}
              accessory={accessory?.(field)}
            />
          }
        >
          {field.help && <span className={FIELD_HELP}>{say(field.help)}</span>}
          {formState.errors[field.key] && (
            <span role="alert" className="text-danger text-tiny">
              {t('errors.invalidValue')}
            </span>
          )}
        </FormField>
      ))}
    </fieldset>
  )

  return (
    <form
      // No gutter of its own: its one host pads the whole column, and a form padding itself
      // there would sit a step in from the fields above it.
      className="flex flex-col gap-3"
      onSubmit={event =>
        void handleSubmit(submitted => onSubmit?.(buildBody(fields, submitted)))(event)
      }
    >
      {plain.map(fieldsetOf)}

      {/* Folded — § 14: seed, steps, sides and guidance are not what most generations are about,
          and a panel that shows everything shows nothing. The rule the collection bar folds its
          filters by, which is the same problem and now the same component. */}
      {advanced.length > 0 && (
        <>
          <FoldRule
            open={showAdvanced}
            onToggle={() => setShowAdvanced(current => !current)}
            moreLabel={t('collection.more')}
            fewerLabel={t('collection.fewer')}
            moreHint={t('generation.advancedHint')}
            fewerHint={t('generation.advancedFewerHint')}
            scId="generation.advanced"
          />

          {showAdvanced && <div className="flex flex-col gap-2">{advanced.map(fieldsetOf)}</div>}
        </>
      )}

      {/* 🛑 STUCK to the foot of the scroller, never carried down the page by the fields above:
          a model declaring a dozen of them pushed the one button this form has out of sight, and
          a generation nobody can start is a panel that does nothing. */}
      {submitLabel !== undefined && (
        <div className="bg-panel sticky bottom-0 z-10 -mx-2 mt-auto px-2 pt-2 pb-2">
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            {...(submitHint ? HINT_TOP(submitHint) : {})}
            disabled={busy}
          >
            {submitLabel}
            {/* Spaced here rather than by a gap on the button: every tool button in the studio is
                built on the same base, and most of them are an icon beside a word. Set apart by
                its SIZE alone — an `opacity-70` read 3.03:1 on the accent, and this is a price. */}
            {submitNote && <span className="text-tiny ms-1.5">{submitNote}</span>}
          </Button>
        </div>
      )}
    </form>
  )
}
