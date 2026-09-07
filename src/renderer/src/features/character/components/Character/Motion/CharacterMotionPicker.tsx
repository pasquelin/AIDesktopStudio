import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClipSource } from '@shared/domain/scene'
import { Button } from '@/components/Button'
import { Flyout } from '@/components/Flyout'
import { chipSkin } from '@/components/styles'
import { CharacterMotionPickerAi } from './CharacterMotionPickerAi'
import { CharacterMotionPickerImport } from './CharacterMotionPickerImport'
import { CharacterMotionPickerLibrary } from './CharacterMotionPickerLibrary'
import { CharacterMotionPickerMapping } from './CharacterMotionPickerMapping'
import { CharacterMotionPickerPreview } from './CharacterMotionPickerPreview'

/** The three places a motion can come from. Their order is the one the issue lists them in. */
export type CharacterMotionPickerSource = 'library' | 'import' | 'ai'

const SOURCES: readonly CharacterMotionPickerSource[] = ['library', 'import', 'ai']

export type CharacterMotionPickerProps = {
  documentId: string
  nodeId: string
  /** What it hangs off — the « add an animation » button of the inspector. */
  anchor: HTMLElement | null
  /** The block laid while browsing, so the preview and the fit both speak of the same thing. */
  laid: { clipId: string; source: ClipSource } | null
  /** Lays one, replacing whatever was being looked at. */
  onChoose: (source: ClipSource, label: string) => void
  onKeep: () => void
  /** Takes the laid block back — the button, pressing outside, and `Escape`. Never a blur. */
  onCancel: () => void
}

/**
 * Where an animation is chosen: the project's own, a file from disk, or a Scenario model.
 *
 * A flyout rather than a window, and choosing lays the REAL block: a separate window has no
 * viewport, so it could only ever show a rehearsal.
 */
export function CharacterMotionPicker({
  documentId,
  nodeId,
  anchor,
  laid,
  onChoose,
  onKeep,
  onCancel,
}: CharacterMotionPickerProps) {
  const { t } = useTranslation()
  const [source, setSource] = useState<CharacterMotionPickerSource>('library')

  const pane = (): ReactNode => {
    if (source === 'import') return <CharacterMotionPickerImport onChoose={onChoose} />
    if (source === 'ai') return <CharacterMotionPickerAi />

    return (
      <CharacterMotionPickerLibrary documentId={documentId} nodeId={nodeId} onChoose={onChoose} />
    )
  }

  return (
    <Flyout anchor={anchor} placement="under" onDismiss={onCancel} onWindowLeave={onKeep}>
      <div className="flex w-80 flex-col gap-2 p-2">
        <div role="tablist" aria-label={t('inspector.addAnimation')} className="flex gap-2">
          {SOURCES.map(candidate => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={candidate === source}
              className={chipSkin(candidate === source)}
              onClick={() => setSource(candidate)}
            >
              {t(`inspector.animationSource_${candidate}`)}
            </button>
          ))}
        </div>

        <div className="max-h-64 min-h-0 overflow-y-auto">{pane()}</div>

        {laid && (
          <>
            <CharacterMotionPickerPreview
              documentId={documentId}
              nodeId={nodeId}
              clipId={laid.clipId}
            />
            <CharacterMotionPickerMapping
              documentId={documentId}
              nodeId={nodeId}
              source={laid.source}
            />
            <div className="flex justify-end gap-2">
              <Button onClick={onCancel}>{t('inspector.animationCancel')}</Button>
              <Button variant="primary" onClick={onKeep}>
                {t('inspector.animationKeep')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Flyout>
  )
}
