import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  assetClip,
  bundledClip,
  embeddedClip,
  type ClipRef,
  type ClipSource,
} from '@shared/domain/scene'
import { hasMotion } from '@/character/characterMotion'
import { removeModelClip } from '@/engines/scene/commands'
import { laySceneClip, sceneOf, useScenes } from '@/stores/scenes'
import { Button } from '@/components/Button'
import { QuietNote } from '@/components/QuietNote'
import { linkCharacterMotion } from '@/engines/character/characterCommands'
import { newId } from '@/helpers/ids'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { characterOf, useCharacters } from '@/stores/character'
import { CharacterMotionPicker } from './CharacterMotionPicker'

export type CharacterMotionOfferProps = {
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
 * Everything a model is offered once it has joints to drive — see `CharacterMotionSection` for
 * the gate. Apart from the list beside it because what is already LINKED stays reachable
 * whatever the answer, and this half does not.
 */
export function CharacterMotionOffer({
  assetId,
  documentId,
  nodeId,
  onSave,
}: CharacterMotionOfferProps) {
  const { t } = useTranslation()
  const empty = useCharacters(state => characterOf(state, assetId).motions.length === 0)
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

  return (
    <>
      {empty && <QuietNote>{t('character.motionEmpty')}</QuietNote>}

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
