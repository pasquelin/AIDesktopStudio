import { SliderField } from '@/components/SliderField'
import { characterViewOf, useCharacterView } from '@/stores/characterView'

export type CharacterInspectorMorphRowProps = {
  assetId: string
  name: string
}

const WEIGHT = { min: 0, max: 1, step: 0.01 }

/**
 * 🛑 Subscribed to ITS OWN weight, not to the record: reading `morphs` whole re-rendered every
 * slider on every drag, and a face carries fifty-two of them — under the hundred a virtual list
 * starts windowing at, so all fifty-two were mounted and all fifty-two redrew.
 */
export function CharacterInspectorMorphRow({ assetId, name }: CharacterInspectorMorphRowProps) {
  const value = useCharacterView(state => characterViewOf(state, assetId).morphs[name] ?? 0)
  const weigh = useCharacterView(state => state.setCharacterMorph)

  return (
    <SliderField
      label={name}
      value={value}
      {...WEIGHT}
      onChange={held => weigh(assetId, name, held)}
      onReset={() => weigh(assetId, name, 0)}
      scId="character.morph"
    />
  )
}
