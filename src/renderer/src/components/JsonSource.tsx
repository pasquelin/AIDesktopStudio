// SPDX-License-Identifier: MIT
import { TextArea } from './TextArea'
import { fieldHandle } from './scHandle'

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
      <TextArea
        data-sc={fieldHandle(scId)}
        aria-label={label}
        spellCheck={false}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="size-full resize-none p-3 font-mono"
      />
    </div>
  )
}
