// SPDX-License-Identifier: MIT
import { mdiCogOutline, mdiPencilOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { BUILT_IN_PARAMETERS, type AnimationParameter } from '@shared/domain/animationGraph'
import { Tag } from '@/components/Tag'
import { roleInk } from '@/helpers/workspaces'

export type AnimationGraphParameterTagsProps = { parameters: readonly AnimationParameter[] }

/**
 * Every name a condition may stand on, in one run: what the game publishes on each step, then
 * what this graph declares.
 *
 * 🛑 The colour never says it alone — a cog for what the game holds, a pencil for what the author
 * wrote, and the sentence beside the list says the same in words. `rule-interface` refuses a
 * category told by colour only, and the ink is the SECTION's own (`roleInk`), not a colour picked
 * here: two greys in a row of nine tags is what made this list unreadable.
 */
export function AnimationGraphParameterTags({ parameters }: AnimationGraphParameterTagsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.keys(BUILT_IN_PARAMETERS).map(id => (
        <Tag key={id} icon={mdiCogOutline} ink={roleInk('animations')}>
          {id}
        </Tag>
      ))}
      {parameters.map(parameter => (
        <Tag key={parameter.id} icon={mdiPencilOutline}>
          {parameter.id} · {t(`game.animationGraph.parameterKinds.${parameter.kind}`)}
        </Tag>
      ))}
    </div>
  )
}
