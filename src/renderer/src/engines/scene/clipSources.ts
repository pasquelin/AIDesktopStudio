import { assetUrl } from '@shared/domain/asset'
import { bundledAnimationUrl } from '@shared/domain/animationLibrary'
import { clipKeyOf, type ClipLane, type ClipSource } from '@shared/domain/scene'
import type { AnimationGraph } from '@shared/domain/animationGraph'

/** A clip a model's blocks name that its own file did not bring: where to read it, what to call it. */
export type ForeignClip = { key: string; url: string; label: string; clipIndex?: number }

/** Where a clip that did not come with the model is read from — `null` for the model's own. */
export function clipSourceUrl(source: ClipSource): string | null {
  if (source.kind === 'bundled') return bundledAnimationUrl(source.name)
  return source.kind === 'asset' ? assetUrl(source.assetId) : null
}

/**
 * Every clip a document asks a model to play that the model's own file did not bring, once each.
 *
 * Once per KEY and not per block: a walk laid down four times is one file to read, and the key
 * carries the kind, so a shipped `walk` and a project asset called `walk` stay two things.
 */
export function foreignClipsOf(lanes: readonly ClipLane[]): ForeignClip[] {
  const found = new Map<string, ForeignClip>()

  for (const clip of lanes.flatMap(lane => lane.clips)) {
    const foreign = foreignClipOf(clip.source, clip.label)
    if (foreign && !found.has(foreign.key)) found.set(foreign.key, foreign)
  }
  return [...found.values()]
}

/** `null` for a clip the model's own file brought — there is nothing to read from elsewhere. */
function foreignClipOf(source: ClipSource, label: string): ForeignClip | null {
  const url = clipSourceUrl(source)
  return url
    ? {
        key: clipKeyOf(source),
        url,
        label,
        ...('clipIndex' in source && { clipIndex: source.clipIndex }),
      }
    : null
}

/**
 * Every clip a state machine names, once per key — as a source, and as something to read.
 *
 * The two answer the same question for two callers: the studio preloads by URL, the exported
 * game by source. One pass, so the « first wins on a key held twice » rule is written once.
 */
export function graphSourcesOf(graph: AnimationGraph): ClipSource[] {
  const found = new Map<string, ClipSource>()

  for (const state of graph.layers.flatMap(one => one.states))
    if (!found.has(clipKeyOf(state.source))) found.set(clipKeyOf(state.source), state.source)
  return [...found.values()]
}

export function graphClipsOf(graph: AnimationGraph): ForeignClip[] {
  return graphSourcesOf(graph).flatMap(source => foreignClipOf(source, source.name) ?? [])
}
