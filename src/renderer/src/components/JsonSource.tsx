// SPDX-License-Identifier: MIT
import { FIELD_FILL } from './styles'
import { fieldHandle } from './scHandle'
import { cn } from '@/helpers/cn'

type JsonSourceProps = {
  value: string
  label: string
  scId: string
  onChange: (value: string) => void
}

/** The text half of a JSON document's editor: the file as it is written, and nothing else. */
export function JsonSource({ value, label, scId, onChange }: JsonSourceProps) {
  return (
    <div className="min-h-0 flex-1 p-(--sc-gutter)">
      <textarea
        data-sc={fieldHandle(scId)}
        aria-label={label}
        spellCheck={false}
        value={value}
        onChange={event => onChange(event.target.value)}
        className={cn(FIELD_FILL, 'size-full resize-none p-3 font-mono')}
      />
    </div>
  )
}
