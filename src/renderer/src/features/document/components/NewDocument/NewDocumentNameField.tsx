import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { extensionOfKind, type DocumentKind } from '@shared/domain/document'
import type { WritableFormat } from '@shared/domain/formatCapability'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { FILE_EXTENSION } from '@/components/styles'
import { cn } from '@/helpers/cn'

export type NewDocumentNameFieldProps = {
  kind: DocumentKind
  value: string
  onChange: (name: string) => void
  /** The refusal shown under the field, so the input can point at it — `null` while there is none. */
  refusalId: string | null
  /**
   * The formats to choose between, and the one chosen. Empty or single leaves nothing to pick: the
   * kind's own extension is shown instead, as it is for a new document.
   */
  formats: readonly WritableFormat[]
  format: WritableFormat | null
  onFormat: (format: WritableFormat | null) => void
  ref: React.Ref<HTMLInputElement>
}

/**
 * What the document is called, and — where there is a choice — what file it becomes.
 *
 * Labelled where it shows, not by an `aria-label`: two bare fields under one heading leave
 * nothing to tell them apart, for a reader of either kind.
 */
export function NewDocumentNameField({
  kind,
  value,
  onChange,
  refusalId,
  formats,
  format,
  onFormat,
  ref,
}: NewDocumentNameFieldProps) {
  const { t } = useTranslation()
  const nameId = useId()
  const extensionId = useId()
  const offered = formats.length > 1

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nameId} className="text-muted text-xs">
        {t('documents.nameField')}
      </label>
      <div className="flex items-center gap-2">
        <Input
          ref={ref}
          data-sc="field:newDocument.name"
          id={nameId}
          aria-describedby={refusalId ? `${extensionId} ${refusalId}` : extensionId}
          value={value}
          className="flex-1 text-xs"
          onChange={event => onChange(event.target.value)}
        />
        {/* Offered only where there is a choice — the picture, whose two writers are the flat
            encoder and the container. Every other kind has one file to its name. */}
        {offered ? (
          <Select
            id={extensionId}
            data-sc="field:newDocument.format"
            className="shrink-0 text-xs"
            value={format ?? ''}
            onChange={event => onFormat(chosenAmong(formats, event.target.value))}
            aria-label={t('documents.formatField')}
          >
            {formats.map(one => (
              <option key={one} value={one}>
                {t(`documents.formats.${one}`)}
              </option>
            ))}
          </Select>
        ) : (
          <span id={extensionId} className={cn(FILE_EXTENSION, 'shrink-0 text-xs')}>
            {extensionOfKind(kind)}
          </span>
        )}
      </div>
    </div>
  )
}

/** What a `<select>` handed back, held to the list it was drawn from — its value is a string. */
function chosenAmong(offered: readonly WritableFormat[], value: string): WritableFormat | null {
  return offered.find(one => one === value) ?? null
}
