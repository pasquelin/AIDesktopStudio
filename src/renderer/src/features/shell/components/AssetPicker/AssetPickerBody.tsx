import { mdiImageSearchOutline } from '@mdi/js'
import { Input } from '@/components/Input'
import { useMemo, useRef } from 'react'
import { posterUrl, type AssetType } from '@shared/domain/asset'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { MediaTile } from '@/components/MediaTile'
import { cn } from '@/helpers/cn'
import { useDismiss } from '@/hooks/useDismiss'
import { useProjectPictureAssets } from '@/hooks/useProjectPictureAssets'

export type AssetPickerBodyProps = {
  accepts: readonly AssetType[]
  search: string
  onSearch: (search: string) => void
  titleId: string
  /** `null` calls the choice off. */
  settle: (assetId: string | null) => void
  labels: Record<'title' | 'search' | 'empty' | 'cancel', string>
}

/**
 * The window itself, split from the shell that registers it so the catalogue is asked ONLY while
 * it is up: hooks cannot be called conditionally, and a picker mounted for the session would hold
 * a query open for as long as the studio runs.
 */
export function AssetPickerBody({
  accepts,
  search,
  onSearch,
  titleId,
  settle,
  labels,
}: AssetPickerBodyProps) {
  // Local only: nothing in the app writes a `'cloud'` row to the catalogue, and `isLocalPicture`
  // is the studio's one answer to "can this be decoded".
  const found = useProjectPictureAssets(accepts)
  const surface = useRef<HTMLDivElement>(null)

  // On the DOCUMENT: the press that opens this window leaves the focus on `<body>`, so a handler
  // on the dialog caught no Escape. `onLeave` is a NO-OP and not `undefined`, which a default
  // parameter would read as "unset" and answer the choice on the first ⌘-Tab.
  useDismiss(
    () => settle(null),
    surface,
    null,
    () => {},
  )

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle === '' ? found : found.filter(asset => asset.name.toLowerCase().includes(needle))
  }, [found, search])

  return (
    <div className="bg-scrim fixed inset-0 z-60 flex items-center justify-center p-8">
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'border-border bg-surface flex max-h-full w-full max-w-3xl flex-col gap-3',
          'rounded-(--radius-sc-lg) border p-4 shadow-(--sc-shadow-floating)',
        )}
      >
        <h2 id={titleId} className="text-text m-0 text-sm font-medium">
          {labels.title}
        </h2>

        <Input
          data-sc="field:assetPicker.search"
          type="search"
          autoFocus
          value={search}
          placeholder={labels.search}
          aria-label={labels.search}
          onChange={event => onSearch(event.target.value)}
          className="w-full"
        />

        {shown.length === 0 ? (
          <EmptyState icon={mdiImageSearchOutline} message={labels.empty} />
        ) : (
          <ul className="m-0 grid list-none grid-cols-4 gap-2 overflow-y-auto p-0">
            {shown.map(asset => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => settle(asset.id)}
                  className="w-full cursor-pointer border-none bg-transparent p-0"
                >
                  <MediaTile url={posterUrl(asset) ?? undefined} caption={asset.name} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={() => settle(null)}>{labels.cancel}</Button>
        </div>
      </div>
    </div>
  )
}
