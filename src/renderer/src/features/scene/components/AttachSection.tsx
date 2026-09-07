import { useTranslation } from 'react-i18next'
import type { CharacterSocket } from '@shared/domain/character'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { attachNode } from '@/engines/scene/commands'
import type { SceneNode } from '@/engines/scene/sceneState'
import type { SceneEdit } from '@/hooks/useSceneEdit'
import { useModelFiles } from '@/stores/modelFiles'

export type AttachSectionProps = {
  node: SceneNode
  documentId: string
  edit: SceneEdit
}

/** What « hangs from nothing in particular » is called, since a select needs a value for it. */
const LOOSE = ''

/** Shared: a `?? []` written in the selector hands zustand a new array on every render. */
const NO_SOCKETS: readonly CharacterSocket[] = []

/**
 * Where this node hangs on the character above it — a sword in a hand, a hat on a head.
 *
 * Absent unless the parent is a character carrying attachment points: a select offering nothing
 * is a promise the file cannot keep.
 */
export function AttachSection({ node, documentId, edit }: AttachSectionProps) {
  const { t } = useTranslation()
  const sockets = useModelFiles(
    state => state.sockets[documentId]?.[node.parentId ?? ''] ?? NO_SOCKETS,
  )

  if (sockets.length === 0) return null

  return (
    <PropertySection title={t('inspector.attach')} scId="attach">
      <SelectField
        label={t('inspector.attachSocket')}
        value={node.attach?.socket ?? LOOSE}
        options={[
          { value: LOOSE, label: t('inspector.attachNone') },
          ...sockets.map(socket => ({ value: socket.id, label: socket.name })),
        ]}
        scId="attach.socket"
        onChange={value => edit.run(attachNode(node.id, value === LOOSE ? null : value))}
      />
    </PropertySection>
  )
}
