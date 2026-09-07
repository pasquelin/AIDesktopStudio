import type { TFunction } from 'i18next'
import type { ClipRef } from '@shared/domain/scene'

/** What `GLTFLoader` numbers a glTF animation carrying no name of its own. */
const NUMBERED = /^animation_(\d+)$/

/** What to show for a clip a FILE names — never the raw name when the exporter chose it. */
export function clipLabel(name: string, t: TFunction): string {
  const numbered = NUMBERED.exec(name)
  if (numbered) return t('inspector.clipNumbered', { number: Number(numbered[1]) + 1 })

  // The default name of a Blender NLA track, which is what a Tripo rig ships with.
  return name === 'NlaTrack' ? t('inspector.clipUnnamed') : name
}

/**
 * What a BLOCK is called. Renamed only for a clip the model's own file spells — an asset or a
 * bundle was named by the studio or by the user, and `animation_0.glb` is a name they chose.
 */
export function clipRefLabel(ref: ClipRef, t: TFunction): string {
  return ref.source.kind === 'embedded' ? clipLabel(ref.label, t) : ref.label
}
