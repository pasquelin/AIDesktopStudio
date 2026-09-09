import { mdiDiceMultipleOutline } from '@mdi/js'
import { useRef, type ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { FieldDescriptor } from '@shared/domain/model'
import { cn } from '@/helpers/cn'
import { TIP_LEFT } from '@/helpers/tooltip'
import { useModelText } from '@/hooks/useModelText'
import { AssetDropField } from '../AssetDropField'
import { AssetDropList } from '../AssetDropList'
import { fieldHandle } from '../scHandle'
import { Checkbox } from '../Checkbox'
import { Input } from '../Input'
import { Select } from '../Select'
import { FIELD } from '../styles'
import { ToolButton } from '../ToolButton'
import { isGenerationCanvasSource } from '@shared/domain/generationComment'
export type DynamicFormControlProps = {
  field: FieldDescriptor
  id: string
  registration: UseFormRegisterReturn
  initial: unknown
  onRoll: () => void
  accessory?: ReactNode
}
export function DynamicFormControl({
  field,
  id,
  registration,
  initial,
  onRoll,
  accessory,
}: DynamicFormControlProps) {
  const { t } = useTranslation()
  const say = useModelText()
  const box = useRef<HTMLTextAreaElement | null>(null)
  const handle = fieldHandle(`generation.${field.key}`)
  const input = { field, id, registration, initial, handle }
  if (field.kind === 'longText')
    return (
      <div className={cn(FIELD, 'flex h-auto resize-y flex-col overflow-hidden p-0')}>
        <textarea
          id={id}
          data-sc={handle}
          rows={4}
          className="min-h-0 w-full flex-1 resize-none bg-transparent px-2 py-1"
          {...registration}
          ref={element => {
            registration.ref(element)
            box.current = element
          }}
        />
        {accessory && (
          <div
            className="flex items-center justify-end gap-2 px-2 pb-1"
            onMouseDown={event => event.preventDefault()}
            onClick={() => box.current?.focus()}
          >
            {accessory}
          </div>
        )}
      </div>
    )
  if (field.kind === 'task' || field.kind === 'choice') return choiceControl(input, say)
  if (field.kind === 'number' || field.kind === 'integer') return numberControl(input)
  if (field.kind === 'image' || field.kind === 'mesh') return assetControl(input, t)
  return simpleControl(input, onRoll, t)
}

type ControlInput = Pick<DynamicFormControlProps, 'field' | 'id' | 'registration' | 'initial'> & {
  /** `field:generation.<key>`, spent across the branches rather than composed again in each. */
  handle: string
}
type Translate = ReturnType<typeof useTranslation>['t']

function choiceControl(input: ControlInput, say: ReturnType<typeof useModelText>) {
  const { field, id, registration, handle } = input
  if (field.kind === 'task' && !field.options?.length) return textControl(input)
  return (
    <Select id={id} data-sc={handle} {...registration}>
      {!field.required && <option value="" />}
      {field.options?.map(option => (
        <option key={option.value} value={option.value}>
          {say(option.label)}
        </option>
      ))}
    </Select>
  )
}

function numberControl({ field, id, registration, handle }: ControlInput) {
  return (
    <Input
      id={id}
      data-sc={handle}
      type="number"
      step={field.step ?? (field.kind === 'integer' ? 1 : 'any')}
      min={field.min}
      max={field.max}
      {...registration}
    />
  )
}

function assetControl(input: ControlInput, t: Translate) {
  if (input.field.repeated && input.field.kind === 'image')
    return (
      <AssetDropList
        id={input.id}
        registration={input.registration}
        initial={input.initial}
        placeholder={t('generation.dropViews')}
        scId={`generation.${input.field.key}`}
      />
    )
  return (
    <AssetDropField
      id={input.id}
      registration={input.registration}
      initial={initialAssetId(input.initial)}
      implicitLabel={
        isGenerationCanvasSource(initialAssetId(input.initial))
          ? t('generation.currentImage')
          : undefined
      }
      placeholder={t(
        input.field.kind === 'mesh' ? 'generation.dropModel' : 'generation.dropPicture',
      )}
      scId={`generation.${input.field.key}`}
    />
  )
}

function simpleControl(input: ControlInput, onRoll: () => void, t: Translate) {
  const { field, id, registration, handle } = input
  if (field.kind === 'boolean') return <Checkbox id={id} data-sc={handle} {...registration} />
  if (field.kind === 'color')
    return (
      <input
        id={id}
        data-sc={handle}
        type="color"
        className={cn(FIELD, 'px-1')}
        {...registration}
      />
    )
  if (field.kind === 'seed')
    return (
      <div className="flex items-center gap-2">
        <Input id={id} data-sc={handle} type="number" className="flex-1" {...registration} />
        <ToolButton
          icon={mdiDiceMultipleOutline}
          label={t('generation.randomSeed')}
          tooltip={TIP_LEFT}
          onClick={onRoll}
        />
      </div>
    )
  return textControl(input)
}

function textControl({ id, registration, handle }: ControlInput) {
  return <Input id={id} data-sc={handle} type="text" {...registration} />
}

function initialAssetId(initial: unknown): string | undefined {
  return typeof initial === 'string' && initial ? initial : undefined
}
