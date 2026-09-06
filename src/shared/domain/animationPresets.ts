import {
  ANIMATION_GRAPH_VERSION,
  type AnimationCondition,
  type AnimationGraph,
  type AnimationState,
  type AnimationTransition,
} from './animationGraph'

export type AnimationPresetId = 'character'

export const ANIMATION_PRESET_IDS: readonly AnimationPresetId[] = ['character']

/**
 * How fast the shipped `Walk` clip was authored to travel, in metres a second.
 *
 * 🛑 A DIVISOR and not a guess to tune: the state plays at `pace ÷ this`, so a body walking at
 * exactly this speed plays the clip at its own timing and the feet do not slide. Measured on the
 * clip's own travel, which is why it is written once rather than typed into the state.
 */
const WALK_PACE = 1.4

/** Metres a second under which a body counts as standing still. Below one step of a slow walk. */
const STANDING = 0.15

/** Metres a second sideways past which the body is stepping across rather than walking on. */
const STEPPING_ASIDE = 0.5

const bundled = (id: string, name: string, rest: Partial<AnimationState> = {}): AnimationState => ({
  id,
  source: { kind: 'bundled', name },
  loop: true,
  speed: 1,
  rootMotion: 'inPlace',
  ...rest,
})

/**
 * 🛑 `grounded` on every way into the locomotion states, and that is what keeps a jump whole: an
 * « any state » way out would otherwise cut the jump on its first frame, the moment the sticks
 * moved. Nothing here says « unless jumping » — being on the ground says it.
 */
const onGround = (...rest: readonly AnimationCondition[]): AnimationCondition[] => [
  { param: 'grounded', op: '==', value: true },
  ...rest,
]

const into = (
  to: string,
  priority: number,
  when: readonly AnimationCondition[],
  fade = 0.15,
): AnimationTransition => ({ from: '', to, fade, when, priority })

/**
 * What a player module is born animated by: the ten shipped clips, on the readings the character
 * controller publishes for nothing.
 *
 * A file the author OWNS the moment a template lays it down — every threshold here is a number in
 * that file, and adding a state is adding an object to it.
 */
const PRESETS: Record<AnimationPresetId, AnimationGraph> = {
  character: {
    version: ANIMATION_GRAPH_VERSION,
    id: 'character',
    parameters: [],
    layers: [
      {
        id: 'base',
        part: 'all',
        initial: 'idle',
        states: [
          bundled('idle', 'Idle'),
          bundled('walk', 'Walk', { speed: 1 / WALK_PACE, speedFrom: 'speed' }),
          bundled('stepLeft', 'StrafeLeft', { speed: 1 / WALK_PACE, speedFrom: 'speed' }),
          bundled('stepRight', 'StrafeRight', { speed: 1 / WALK_PACE, speedFrom: 'speed' }),
          bundled('jump', 'Jump', { loop: false }),
        ],
        transitions: [
          into('idle', 0, onGround({ param: 'speed', op: '<=', value: STANDING }), 0.2),
          // |strafe| bounded so an any-state Walk cannot reopen on a body that is stepping aside —
          // both conditions were true together, and the machine flipped every step.
          into(
            'walk',
            1,
            onGround(
              { param: 'speed', op: '>', value: STANDING },
              { param: 'strafe', op: '>=', value: -STEPPING_ASIDE },
              { param: 'strafe', op: '<=', value: STEPPING_ASIDE },
            ),
          ),
          into('stepLeft', 2, onGround({ param: 'strafe', op: '<', value: -STEPPING_ASIDE })),
          into('stepRight', 2, onGround({ param: 'strafe', op: '>', value: STEPPING_ASIDE })),
          // Highest, and off the ground it is the only one left: a jump interrupts whatever the
          // body was doing, which is the whole point of an « any state » way out.
          into('jump', 10, [{ param: 'jumped', op: '==', value: true }], 0.05),
        ],
      },
    ],
  },
}

export function animationGraphPreset(id: AnimationPresetId): AnimationGraph {
  return PRESETS[id]
}
