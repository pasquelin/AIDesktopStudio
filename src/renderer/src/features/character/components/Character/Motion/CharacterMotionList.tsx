import { mdiClose, mdiPencilOutline } from '@mdi/js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MotionRef } from '@shared/domain/character'
import {
  assetClip,
  bundledClip,
  embeddedClip,
  type ClipRef,
  type ClipSource,
} from '@shared/domain/scene'
import { hasMotion, reopenCharacterMotion } from '@/character/characterMotion'
import { reportFailure } from '@/services/diagnostics'
import { removeModelClip } from '@/engines/scene/commands'
import { laySceneClip, sceneOf, useScenes } from '@/stores/scenes'
import { Button } from '@/components/Button'
import { QuietNote } from '@/components/QuietNote'
import { ToolButton } from '@/components/ToolButton'
import { linkCharacterMotion, unlinkCharacterMotion } from '@/engines/character/characterCommands'
import { newId } from '@/helpers/ids'
import { TIP_LEFT } from '@/helpers/tooltip'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { characterOf, useCharacters } from '@/stores/character'
import { CharacterMotionPicker } from './CharacterMotionPicker'

export type CharacterMotionListProps = {
  assetId: string
  /** The workshop scene this window drives, which is where a motion is tried out. */
  documentId: string
  nodeId: string
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
 * bones carry the same names — swallowing one into a `.glb` would take it from the others.
 */
export function CharacterMotionList({
  assetId,
  documentId,
  nodeId,
  onSave,
}: CharacterMotionListProps) {
  const { t } = useTranslation()
  const motions = useCharacters(state => characterOf(state, assetId).motions)
  const played = useScenes(state => hasMotion(sceneOf(state, documentId).animation))
  const openMotion = useAnimationViews(state => animationViewOf(state, documentId).openMotion)
  const [open, setOpen] = useState(false)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  // The block being TRIED, laid on the real band: the picker shows its preview and its bone
  // mapping against it, and neither has anything to say until one is laid.
  const [laid, setLaid] = useState<{ clipId: string; source: ClipSource; label: string } | null>(
    null,
  )

  /**
   * 🛑 Choosing LAYS the real block rather than filing anything: the character plays it at once,
   * through the real retargeting, which is the only way to tell whether it fits before keeping
   * it. Nothing reaches the file until `keep`.
   */
  const tryOut = (source: ClipSource, label: string): void => {
    takeBack()
    const clip = clipOf(newId(), source, label)
    laySceneClip(documentId, nodeId, clip)
    setLaid({ clipId: clip.id, source, label })
  }

  /** The block off the band again — the button, a press outside, and `Escape` all end here. */
  const takeBack = (): void => {
    if (laid) useScenes.getState().runCommand(documentId, removeModelClip(nodeId, laid.clipId))
    setLaid(null)
  }

  /**
   * Kept: the block stays on the band, and a motion of the PROJECT is taught to this character
   * besides. A clip the model's own file carries is already its own — there is no file to link.
   */
  const keep = (): void => {
    if (laid?.source.kind === 'asset') {
      useCharacters
        .getState()
        .runCommand(
          assetId,
          linkCharacterMotion({ id: newId(), name: laid.label, assetId: laid.source.assetId }),
        )
    }
    setLaid(null)
    setOpen(false)
  }

  const reopen = async (motion: MotionRef): Promise<void> => {
    try {
      await reopenCharacterMotion(documentId, nodeId, motion.assetId)
    } catch (error) {
      reportFailure('assets.open', motion.name, error)
    }
  }

  return (
    <>
      {motions.length === 0 && <QuietNote>{t('character.motionEmpty')}</QuietNote>}

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

      {/* Only once the band holds a key: a file claiming a motion it does not have is worse
          than no file. What it writes is a motion of the PROJECT, playable by any character. */}
      {played && onSave && (
        <Button onClick={() => void onSave(false)}>
          {openMotion ? t('character.motionUpdate') : t('character.motionSave')}
        </Button>
      )}

      {/* 🛑 The only way back off a reopened motion: without it the bench stays aimed at that
          file, and the NEXT movement posed here overwrites it rather than being filed. */}
      {played && onSave && openMotion && (
        <Button onClick={() => void onSave(true)}>{t('character.motionSaveNew')}</Button>
      )}

      <Button ref={setOpener} onClick={() => setOpen(!open)}>
        {t('character.motionAdd')}
      </Button>

      {open && (
        <CharacterMotionPicker
          documentId={documentId}
          nodeId={nodeId}
          anchor={opener}
          laid={laid}
          onChoose={tryOut}
          onKeep={keep}
          onCancel={() => {
            takeBack()
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

/** The block one of the three sources makes — the shapes `shared/domain/scene` already spells. */
function clipOf(id: string, source: ClipSource, label: string): ClipRef {
  if (source.kind === 'asset') return assetClip(id, source.assetId, label)
  if (source.kind === 'bundled') return bundledClip(id, source.name)

  return embeddedClip(id, source.name)
}
