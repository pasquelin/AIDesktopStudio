import { dragListChannel } from '@/helpers/drag'

/**
 * What a row of the outliner carries, and what the animation band reads when it is let go over it.
 *
 * BOTH effects, and this channel is the one place in the studio where that is right: one row
 * serves two gestures. Dropped on another row it REPARENTS, which is a move; dropped on the band
 * it ADDS, which is a copy and is what draws the `+`. A target may only ask for an effect its
 * source allowed, and `Tree` arms its own channel first — announcing `copy` alone here overwrote
 * that and left every reparenting drag refused in SILENCE, which jsdom cannot see.
 */
export const sceneNodeDrag = dragListChannel(
  'application/x-ai-desktop-studio-scene-node',
  'copyMove',
)
