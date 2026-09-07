import { useTranslation } from 'react-i18next'
import { fieldHandle } from '@/components/scHandle'
import { useCommittedText } from '@/hooks/useCommittedText'
import type { CommittedProps } from './controls'
import { WindowInput } from '@/components/WindowInput'

/** Text settings commit on blur; a controlled input fed by a write hands back a stale word. */
export function SettingRowTextControl({
  descriptor,
  id,
  scId,
  describedBy,
  stored,
  onCommit,
}: CommittedProps) {
  const { t } = useTranslation()
  const field = useCommittedText(String(stored ?? ''), onCommit)

  return (
    <WindowInput
      id={id}
      data-sc={fieldHandle(scId)}
      aria-describedby={describedBy}
      className="w-full max-w-xs"
      type="text"
      placeholder={descriptor.placeholderKey ? t(descriptor.placeholderKey) : undefined}
      {...field}
    />
  )
}
