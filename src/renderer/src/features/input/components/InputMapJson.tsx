// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import { FIELD_FILL } from '@/components/styles'
import { cn } from '@/helpers/cn'

type InputMapJsonProps = { value: string; onChange: (value: string) => void }

export function InputMapJson({ value, onChange }: InputMapJsonProps) {
  const { t } = useTranslation()
  return (
    <div className="min-h-0 flex-1 p-(--sc-gutter)">
      <textarea
        data-sc="field:input.source"
        aria-label={t('game.inputMap.jsonLabel')}
        spellCheck={false}
        value={value}
        onChange={event => onChange(event.target.value)}
        className={cn(FIELD_FILL, 'size-full resize-none p-3 font-mono')}
      />
    </div>
  )
}
