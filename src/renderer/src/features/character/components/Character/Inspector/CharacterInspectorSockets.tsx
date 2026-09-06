import { mdiClose } from '@mdi/js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Rig } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { Button } from '@/components/Button'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ToolButton } from '@/components/ToolButton'
import { addCharacterSocket, removeCharacterSocket } from '@/engines/character/characterCommands'
import { newId } from '@/helpers/ids'
import { TIP_LEFT } from '@/helpers/tooltip'
import { characterOf, useCharacters } from '@/stores/character'
import { characterViewOf, useCharacterView } from '@/stores/characterView'

export type CharacterInspectorSocketsProps = {
  assetId: string
  /** The bones a point can stand on — nothing to pin without them, so the section stays away. */
  rig: Rig | null
}

/**
 * Where an object can be hung on this character — a hand, a hip, a back — each point standing
 * on one bone. Named by the author and written into the file; a scene hangs on them by name.
 */
export function CharacterInspectorSockets({ assetId, rig }: CharacterInspectorSocketsProps) {
  const { t } = useTranslation()
  const sockets = useCharacters(state => characterOf(state, assetId).sockets)
  const picked = useCharacterView(state => characterViewOf(state, assetId).pickedBone)
  const run = useCharacters(state => state.runCommand)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  if (!rig) return null

  const bones = rig.bones.map(one => one.name)
  // Derived, never seeded once: the joint picked in the view stays the default until a bone is
  // chosen here by hand.
  const bone = chosen ?? (picked && bones.includes(picked) ? picked : (bones[0] ?? null))
  const ready = name.trim() !== '' && bone !== null

  const add = (): void => {
    if (!bone) return

    run(
      assetId,
      addCharacterSocket({ id: newId(), name: name.trim(), bone, rest: IDENTITY_TRANSFORM }),
    )
    setName('')
  }

  return (
    <PropertySection title={t('character.sockets')} scId="character.sockets">
      {sockets.length === 0 && <QuietNote>{t('character.socketEmpty')}</QuietNote>}

      {sockets.map(socket => (
        <PropertyRow
          key={socket.id}
          label={socket.name}
          actions={
            <ToolButton
              icon={mdiClose}
              label={t('character.socketRemove')}
              tooltip={TIP_LEFT}
              variant="header"
              onClick={() => run(assetId, removeCharacterSocket(socket.id))}
            />
          }
        >
          {socket.bone}
        </PropertyRow>
      ))}

      <TextField
        label={t('character.socketName')}
        value={name}
        onChange={setName}
        scId="character.socketName"
      />
      <SelectField
        label={t('character.socketBone')}
        value={bone}
        options={bones.map(one => ({ value: one, label: one }))}
        onChange={setChosen}
        scId="character.socketBone"
      />
      <Button onClick={add} disabled={!ready}>
        {t('character.socketAdd')}
      </Button>
    </PropertySection>
  )
}
