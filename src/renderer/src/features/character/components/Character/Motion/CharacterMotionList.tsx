import { mdiClose, mdiPencilOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { MotionRef } from '@shared/domain/character'
import { reopenCharacterMotion } from '@/character/characterMotion'
import { reportFailure } from '@/services/diagnostics'
import { ToolButton } from '@/components/ToolButton'
import { unlinkCharacterMotion } from '@/engines/character/characterCommands'
import { TIP_LEFT } from '@/helpers/tooltip'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { characterOf, useCharacters } from '@/stores/character'
import { CharacterMotionOffer } from './CharacterMotionOffer'

export type CharacterMotionListProps = {
  assetId: string
  /** The workshop scene this window drives, which is where a motion is tried out. */
  documentId: string
  nodeId: string
  /** Whether a motion laid here would drive anything — see `CharacterMotionSection`. */
  playable: boolean
  /**
   * Files what the band plays, over the motion being edited or as a new file. Absent where
   * nothing can export it.
   */
  onSave?: (asNew: boolean) => Promise<void>
}

/**
 * What this character knows how to play.
 *
 * 🛑 References, never copies: a motion is a file of its own, playable by every character whose
 * bones carry the same names — swallowing one into a `.glb` would take it from the others. The
 * rows stand whatever `playable` answers: they hold the only way to unlink what a `.glb` claims.
 */
export function CharacterMotionList({
  assetId,
  documentId,
  nodeId,
  playable,
  onSave,
}: CharacterMotionListProps) {
  const { t } = useTranslation()
  const motions = useCharacters(state => characterOf(state, assetId).motions)
  const openMotion = useAnimationViews(state => animationViewOf(state, documentId).openMotion)

  const reopen = async (motion: MotionRef): Promise<void> => {
    try {
      await reopenCharacterMotion(documentId, nodeId, motion.assetId)
    } catch (error) {
      reportFailure('assets.open', motion.name, error)
    }
  }

  return (
    <>
      {motions.map(motion => (
        <div key={motion.id} className="flex items-center justify-between gap-2">
          <span className="truncate">{motion.name}</span>
          <div className="flex shrink-0 items-center gap-0.5">
            <ToolButton
              icon={mdiPencilOutline}
              label={t('character.motionOpen', { name: motion.name })}
              description={t('character.motionOpenHint')}
              tooltip={TIP_LEFT}
              variant="header"
              active={openMotion === motion.assetId}
              onClick={() => void reopen(motion)}
            />
            <ToolButton
              icon={mdiClose}
              label={t('character.motionRemove')}
              tooltip={TIP_LEFT}
              variant="header"
              onClick={() => {
                // Let go of it FIRST: a bench still aimed at a motion the character no longer
                // knows would write the next save into a file nothing lists any more.
                if (openMotion === motion.assetId) {
                  useAnimationViews.getState().openMotion(documentId, null)
                }
                useCharacters.getState().runCommand(assetId, unlinkCharacterMotion(motion.id))
              }}
            />
          </div>
        </div>
      ))}

      {playable && (
        <CharacterMotionOffer
          assetId={assetId}
          documentId={documentId}
          nodeId={nodeId}
          onSave={onSave}
        />
      )}
    </>
  )
}
