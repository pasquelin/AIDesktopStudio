import { openCharacter } from '@/character/openCharacter'
import { revealTool } from '@/helpers/revealPanel'
import { getBridge } from '@/services/bridge'
import { useSectionFolds } from '@/stores/sectionFolds'

/** Returns to the existing character workshop and exposes its rig tools. */
export async function editRetargetRig(assetId: string, current: () => boolean): Promise<void> {
  if (!current()) return
  await getBridge()?.retargetWindow.focusOrigin()
  if (!current() || !(await openCharacter(assetId)) || !current()) return
  revealTool('inspector')
  useSectionFolds.setState(state => ({ stamp: state.stamp + 1, wanted: true }))
}
