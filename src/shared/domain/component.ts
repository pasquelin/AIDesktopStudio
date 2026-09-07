/**
 * What an entity DOES, beside what its `type` says it draws.
 *
 * The state of a component is pure JSON — no function, no three.js object, no closure. That one
 * decision is what makes serialisation, undo by `Command`, the `DynamicForm` inspector, the MCP
 * schema and network replication all possible at once. The BEHAVIOUR lives in a system.
 */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue }

/**
 * A closed union, like `ActionName`, so the compiler holds the list and MCP publishes it.
 *
 * 🛑 **A type is declared by the lot that gives it a SYSTEM.** A component nothing simulates is a
 * form field that does nothing, and thirty of them written ahead of their behaviour would be
 * thirty guesses. The four physics ones arrived with the engine, the script one with the sandbox,
 * the six travelling ones with the systems that move them, and the two piloted ones with Jolt.
 */
export type ComponentType =
  | 'Player'
  | 'Health'
  | 'Movement'
  | 'Path'
  | 'Follow'
  | 'Orbit'
  | 'LookAt'
  | 'Patrol'
  | 'Spin'
  | 'SpringArm'
  | 'Collider'
  | 'RigidBody'
  | 'Trigger'
  | 'CharacterController'
  | 'Vehicle'
  | 'Aircraft'
  | 'Script'
  | 'Animator'

export type Component = { type: ComponentType } & { readonly [key: string]: JsonValue }

/**
 * The types that say an entity MOVES ON ITS OWN, declared rather than deduced.
 *
 * 🛑 No new type for it: a component nothing simulates is a form field that does nothing, and
 * these components already carry the meaning — a body with any of them is one a system drives. What
 * reads this is the drawing side, which files a mover apart from the bodies that never budge.
 */
const MOVERS: readonly ComponentType[] = [
  'Movement',
  'Path',
  'Follow',
  'Orbit',
  'LookAt',
  'Patrol',
  'Spin',
  'RigidBody',
  'CharacterController',
]

export const movesOnItsOwn = (components: readonly Component[] | undefined): boolean =>
  components?.some(component => MOVERS.includes(component.type)) ?? false

/**
 * The list with `component` on it — replacing the one of its type rather than doubling it. One
 * `Health` per entity: two would leave the winner to whichever a system happened to read first.
 */
export function withComponent(
  components: readonly Component[],
  component: Component,
): readonly Component[] {
  const at = components.findIndex(held => held.type === component.type)
  if (at < 0) return [...components, component]
  return components.map((held, index) => (index === at ? component : held))
}

export function withoutComponent(
  components: readonly Component[],
  type: ComponentType,
): readonly Component[] {
  return components.filter(component => component.type !== type)
}
