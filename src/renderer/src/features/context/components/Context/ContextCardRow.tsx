import { mdiTrashCanOutline } from '@mdi/js'
import { TextArea } from '@/components/TextArea'
import { Input } from '@/components/Input'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONTEXT_BODY_MAX,
  CONTEXT_TITLE_MAX,
  type ContextCard,
} from '@shared/domain/projectContext'
import { Checkbox } from '@/components/Checkbox'
import { PANEL_HEAD } from '@/components/styles'
import { ToolButton } from '@/components/ToolButton'
import { TIP_LEFT } from '@/helpers/tooltip'
import { ContextPictures } from './ContextPictures'

export type ContextCardRowProps = {
  card: ContextCard
  onChange: (card: ContextCard) => void
  onRemove: () => void
}

/**
 * The two texts are held here and stored on BLUR: per keystroke would write the project's file on
 * every letter, and a card rewritten under the hand by another window is an edit nobody gets back.
 */
export function ContextCardRow({ card, onChange, onRemove }: ContextCardRowProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)

  return (
    <div className={PANEL_HEAD}>
      <div className="flex items-center gap-2">
        <Checkbox
          data-sc="field:context.active"
          checked={card.active}
          aria-label={card.active ? t('context.inactiveHint') : t('context.activeHint')}
          onChange={event => onChange({ ...card, active: event.target.checked })}
        />
        <Input
          data-sc="field:context.title"
          type="text"
          value={title}
          maxLength={CONTEXT_TITLE_MAX}
          aria-label={t('context.titlePlaceholder')}
          placeholder={t('context.titlePlaceholder')}
          onChange={event => setTitle(event.target.value)}
          onBlur={() => onChange({ ...card, title })}
          className="min-w-0 flex-1 text-xs"
        />
        <ToolButton
          icon={mdiTrashCanOutline}
          label={t('context.remove')}
          description={t('context.removeHint')}
          tooltip={TIP_LEFT}
          onClick={onRemove}
        />
      </div>

      <TextArea
        data-sc="field:context.body"
        rows={3}
        value={body}
        maxLength={CONTEXT_BODY_MAX}
        aria-label={t('context.bodyPlaceholder')}
        placeholder={t('context.bodyPlaceholder')}
        onChange={event => setBody(event.target.value)}
        onBlur={() => onChange({ ...card, body })}
        className="resize-y py-1 text-xs"
      />

      <ContextPictures
        pictures={card.pictures}
        onChange={pictures => onChange({ ...card, pictures })}
      />
    </div>
  )
}
