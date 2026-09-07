import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clipKeyOf, type ClipSource } from '@shared/domain/scene'
import { Collection } from '@/components/Collection/Collection'
import { QuietNote } from '@/components/QuietNote'
import { Row } from '@/components/Row'
import { INLINE_LINK } from '@/components/styles'
import { bodyFitOf } from '@/engines/scene/retarget'
import { clipFitOfNode, useModelFiles } from '@/stores/modelFiles'

export type CharacterMotionPickerMappingProps = {
  documentId: string
  nodeId: string
  source: ClipSource
}

/**
 * Whether the motion fits, and — only when asked — which joints it does not reach.
 *
 * ROLES rather than bone names, because that is the only vocabulary two skeletons share:
 * `mixamorigLeftHand` and `L_Hand` are the same joint and no string says so.
 */
export function CharacterMotionPickerMapping({
  documentId,
  nodeId,
  source,
}: CharacterMotionPickerMappingProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const fit = useModelFiles(state => clipFitOfNode(state, documentId, nodeId, clipKeyOf(source)))

  // Nothing was retargeted, so there is no fit to speak of — a clip the character's own file
  // brought speaks its skeleton already.
  if (!fit) return null

  const body = bodyFitOf(fit)
  const missing = [...body.missingInSource, ...body.missingInTarget]
  if (missing.length === 0) return <QuietNote>{t('inspector.animationFits')}</QuietNote>

  return (
    <div className="flex flex-col gap-2">
      <QuietNote>{t('inspector.animationFitsPartly')}</QuietNote>
      <button type="button" className={INLINE_LINK} onClick={() => setOpen(!open)}>
        {t(open ? 'inspector.animationHideJoints' : 'inspector.animationShowJoints')}
      </button>
      {open && (
        <Collection
          label={t('inspector.animationShowJoints')}
          items={[
            ...body.missingInSource.map(role => ({
              id: `source:${role}`,
              role,
              note: t('inspector.animationJointAtRest'),
            })),
            ...body.missingInTarget.map(role => ({
              id: `target:${role}`,
              role,
              note: t('inspector.animationJointDropped'),
            })),
          ]}
          renderRow={joint => <Row title={joint.role} subtitle={joint.note} />}
        />
      )}
    </div>
  )
}
