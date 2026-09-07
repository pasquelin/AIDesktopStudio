import type { ActionField } from './assistantAction'
import type { Component, ComponentType, JsonValue } from './component'
import type { GameEventName } from './gameEvent'

export type ComponentCategory =
  'transform' | 'render' | 'physics' | 'gameplay' | 'audio' | 'video' | 'ui' | 'ai' | 'net'

/**
 * Everything the studio knows about one kind of component, said ONCE.
 *
 * 🛑 `fields` is `ActionField`, the very type an assistant action declares its parameters with,
 * and that is the pivot of the whole design rather than a coincidence. The same list already
 * produces the MCP JSON Schema (`main/mcp/tools.ts`) and validates an input (`readInput`); reusing
 * it means a component written once also gets its inspector form, its schema, its validation, its
 * introspection and its Monaco declaration. One place to write, five surfaces served — invariant 5
 * of CLAUDE.md, applied to gameplay.
 *
 * The BEHAVIOUR is nowhere here: it lives in a system. A descriptor describes data.
 */
export type ComponentDescriptor = {
  type: ComponentType
  titleKey: string
  descriptionKey: string
  category: ComponentCategory
  fields: readonly ActionField[]
  /** One per field, and only fields — `componentRegistry.test.ts` holds the two together. */
  defaults: Readonly<Record<string, JsonValue>>
  /** What this one needs beside it. A `RigidBody` is meaningless without a `Collider`. */
  requires?: readonly ComponentType[]
  /** What it puts on the bus, so a script author can be told without reading the system. */
  events?: readonly GameEventName[]
}

/**
 * A field and its label, which is its key: written out, twelve of them repeated
 * `labelKey: 'game.fields.<key>'` and each was a chance for the two to drift.
 */
const numberField = (key: string, min: number, max?: number): ActionField => ({
  key,
  kind: 'number',
  labelKey: `game.fields.${key}`,
  required: true,
  min,
  ...(max === undefined ? {} : { max }),
})

const choiceField = (key: string, options: readonly string[]): ActionField => ({
  key,
  kind: 'choice',
  labelKey: `game.fields.${key}`,
  required: true,
  options,
})

/** A name, a list of names, or a list of points — what no number and no closed list can say. */
const textField = (key: string, picks?: ActionField['picks']): ActionField => ({
  key,
  kind: 'text',
  labelKey: `game.fields.${key}`,
  required: true,
  ...(picks === undefined ? {} : { picks }),
})

const flagField = (key: string): ActionField => ({
  key,
  kind: 'boolean',
  labelKey: `game.fields.${key}`,
  required: true,
})

/**
 * Who is PLAYED. What the player IS — a body, an eye — is the STRUCTURE hanging under the node
 * and never a value here; the two fields say only where it came from and what it currently rides.
 */
const PLAYER: ComponentDescriptor = {
  type: 'Player',
  titleKey: 'game.components.Player.title',
  descriptionKey: 'game.components.Player.description',
  category: 'gameplay',
  // `from` is the module FILE these nodes were read out of, kept so the studio can offer to read
  // them again. Empty for a module built in the scene and never filed.
  //
  // 🛑 `possesses` is what the player currently RIDES — a car, a lift, anything the scene holds.
  // Empty means it holds its own body, which is the ordinary case. See `possession.ts`.
  fields: [textField('from'), textField('possesses')],
  defaults: { from: '', possesses: '' },
}

const HEALTH: ComponentDescriptor = {
  type: 'Health',
  titleKey: 'game.components.Health.title',
  descriptionKey: 'game.components.Health.description',
  category: 'gameplay',
  fields: [numberField('max', 1), numberField('current', 0)],
  defaults: { max: 100, current: 100 },
  events: ['HealthChanged', 'Died'],
}

const MOVEMENT: ComponentDescriptor = {
  type: 'Movement',
  titleKey: 'game.components.Movement.title',
  descriptionKey: 'game.components.Movement.description',
  category: 'gameplay',
  fields: [
    choiceField('axis', ['x', 'y', 'z']),
    numberField('speed', 0),
    numberField('distance', 0),
    choiceField('mode', ['once', 'loop', 'pingPong']),
  ],
  defaults: { axis: 'y', speed: 1, distance: 2, mode: 'pingPong' },
}

/**
 * The six that travel without the physics. They write TRANSFORMS, which is why they run before
 * `physics` and why `writeConflicts` cannot see them meeting — its table names components.
 *
 * `target` and `waypoints` hold ENTITY names rather than positions, so an author moves the mark
 * and the follower follows. `Path` is the exception: its waypoints are points, because a rail is
 * a shape rather than a set of objects.
 */
const PATH: ComponentDescriptor = {
  type: 'Path',
  titleKey: 'game.components.Path.title',
  descriptionKey: 'game.components.Path.description',
  category: 'gameplay',
  fields: [
    textField('waypoints'),
    numberField('speed', 0),
    choiceField('mode', ['once', 'loop', 'pingPong']),
    flagField('orientToTangent'),
  ],
  defaults: { waypoints: '', speed: 2, mode: 'loop', orientToTangent: false },
}

const FOLLOW: ComponentDescriptor = {
  type: 'Follow',
  titleKey: 'game.components.Follow.title',
  descriptionKey: 'game.components.Follow.description',
  category: 'gameplay',
  fields: [
    textField('target'),
    numberField('speed', 0),
    numberField('stopDistance', 0),
    numberField('acceleration', 0),
  ],
  defaults: { target: '', speed: 3, stopDistance: 1.5, acceleration: 8 },
}

const ORBIT: ComponentDescriptor = {
  type: 'Orbit',
  titleKey: 'game.components.Orbit.title',
  descriptionKey: 'game.components.Orbit.description',
  category: 'gameplay',
  // An empty `target` is the world's origin, which is what an author means by « turn about there ».
  // A negative speed turns the other way, and a negative height hangs the orbit below its mark.
  fields: [
    textField('target'),
    numberField('radius', 0),
    numberField('speed', -720, 720),
    numberField('height', -100, 100),
  ],
  defaults: { target: '', radius: 5, speed: 45, height: 0 },
}

const LOOK_AT: ComponentDescriptor = {
  type: 'LookAt',
  titleKey: 'game.components.LookAt.title',
  descriptionKey: 'game.components.LookAt.description',
  category: 'gameplay',
  // A turn speed of zero is INSTANT, which is what a camera mount or a signpost wants.
  fields: [textField('target'), numberField('turnSpeed', 0)],
  defaults: { target: '', turnSpeed: 0 },
}

const PATROL: ComponentDescriptor = {
  type: 'Patrol',
  titleKey: 'game.components.Patrol.title',
  descriptionKey: 'game.components.Patrol.description',
  category: 'gameplay',
  fields: [
    textField('waypoints'),
    numberField('speed', 0),
    numberField('waitSeconds', 0),
    choiceField('mode', ['once', 'loop', 'pingPong']),
  ],
  defaults: { waypoints: '', speed: 2, waitSeconds: 1, mode: 'pingPong' },
}

const SPIN: ComponentDescriptor = {
  type: 'Spin',
  titleKey: 'game.components.Spin.title',
  descriptionKey: 'game.components.Spin.description',
  category: 'gameplay',
  // Degrees a second, and a negative one turns the other way.
  fields: [choiceField('axis', ['x', 'y', 'z']), numberField('speed', -720, 720)],
  defaults: { axis: 'y', speed: 90 },
}

/**
 * A camera on an arm, the way Unreal hangs one: `camera` behind `subject`, pulled in by a wall.
 * 🛑 `orientation` is the whole of what a rig FEELS like — `pointer` aims where the player looks
 * (Unreal's `bUsePawnControlRotation`), `subject` where the thing is pointed, `fixed` at its node.
 */
const SPRING_ARM: ComponentDescriptor = {
  type: 'SpringArm',
  titleKey: 'game.components.SpringArm.title',
  descriptionKey: 'game.components.SpringArm.description',
  category: 'gameplay',
  fields: [
    textField('subject', 'node'),
    textField('camera', 'node'),
    choiceField('orientation', ['pointer', 'subject', 'fixed']),
    numberField('length', 0, 50),
    numberField('height', -10, 10),
    numberField('shoulder', -5, 5),
    flagField('collision'),
    numberField('probeRadius', 0, 2),
    numberField('safetyMargin', 0, 1),
    numberField('hysteresis', 0, 1),
    numberField('positionLag', 0, 2),
    numberField('rotationLag', 0, 2),
    numberField('collisionInLag', 0, 2),
    numberField('collisionOutLag', 0, 2),
    numberField('pitchMin', -89, 89),
    numberField('pitchMax', -89, 89),
    choiceField('lookAt', ['pivot', 'subject']),
  ],
  // Seconds, the four lags, and zero is what an author writes for a camera welded to its subject.
  // 🛑 Coming in is FASTER than going out, never instant: a snap read as a cut. What keeps the
  // shot off the subject is `probeRadius` plus `safetyMargin` — measured 1,25 m against a 0,90 m
  // pillar — and never a floor on the length, which would seat the camera INSIDE what it met.
  defaults: {
    subject: '',
    camera: '',
    orientation: 'pointer',
    length: 4,
    height: 1.6,
    shoulder: 0,
    collision: true,
    probeRadius: 0.2,
    safetyMargin: 0.1,
    hysteresis: 0.1,
    positionLag: 0.08,
    rotationLag: 0.05,
    collisionInLag: 0.04,
    collisionOutLag: 0.25,
    pitchMin: -60,
    pitchMax: 60,
    lookAt: 'pivot',
  },
}

const COLLIDER: ComponentDescriptor = {
  type: 'Collider',
  titleKey: 'game.components.Collider.title',
  descriptionKey: 'game.components.Collider.description',
  category: 'physics',
  fields: [
    choiceField('fidelity', ['auto', 'box', 'hull', 'convexes', 'trimesh']),
    numberField('friction', 0, 2),
    numberField('restitution', 0, 1),
  ],
  // `auto` reads the fidelity ADR-25 already writes into a carved solid, and takes the exact
  // primitive for anything else. The four other words are the author overruling that.
  defaults: { fidelity: 'auto', friction: 0.6, restitution: 0 },
}

const RIGID_BODY: ComponentDescriptor = {
  type: 'RigidBody',
  titleKey: 'game.components.RigidBody.title',
  descriptionKey: 'game.components.RigidBody.description',
  category: 'physics',
  fields: [
    choiceField('kind', ['dynamic', 'fixed', 'kinematic']),
    numberField('mass', 0, 10_000),
    numberField('gravityScale', -5, 5),
    flagField('lockRotation'),
  ],
  // A mass of zero is the engine weighing the shape itself, which is what an author means by
  // « a crate » — a number here is for the crate that has to feel heavier than it looks.
  defaults: { kind: 'dynamic', mass: 0, gravityScale: 1, lockRotation: false },
  // No `requires`, and it was written and taken back out: a body with no `Collider` beside it
  // still falls — the volume comes from what the node DRAWS, and the component only tunes it.
  events: ['Collided'],
}

const TRIGGER: ComponentDescriptor = {
  type: 'Trigger',
  titleKey: 'game.components.Trigger.title',
  descriptionKey: 'game.components.Trigger.description',
  category: 'physics',
  // No field, and not an oversight: a trigger is a MARK on a volume the `Collider` already
  // describes. What it does when something enters belongs to a script, which is the next lot.
  fields: [],
  defaults: {},
  events: ['TriggerEntered', 'TriggerExited'],
}

const CHARACTER_CONTROLLER: ComponentDescriptor = {
  type: 'CharacterController',
  titleKey: 'game.components.CharacterController.title',
  descriptionKey: 'game.components.CharacterController.description',
  category: 'physics',
  // The pull and the eye height stay the scene's, in `world.play`. The PACE falls back instead, so
  // that two characters in one scene can walk at two paces:
  // 🛑 `moveSpeed` at zero is « the scene's » and `runSpeed` at zero is « no running » — never
  // « standing still ». Both labels say so, because `main/mcp/tools.ts` publishes the label as the
  // schema's description and a model reading `minimum: 0` would otherwise write it to freeze a walker.
  // 🛑 `acceleration` and `deceleration` start at 0,1 and NOT at zero, which `Follow` already spends
  // on « never moves »: one key cannot mean « instant » here and « frozen » there.
  fields: [
    numberField('height', 0.2, 10),
    numberField('radius', 0.05, 5),
    numberField('moveSpeed', 0, 50),
    numberField('runSpeed', 0, 50),
    numberField('acceleration', 0.1, 200),
    numberField('deceleration', 0.1, 200),
    numberField('bodyTurnSpeed', 0, 1440),
    numberField('jumpSpeed', 0, 50),
    numberField('airControl', 0, 1),
    numberField('coyoteTime', 0, 1),
    numberField('jumpBuffer', 0, 1),
    numberField('stepHeight', 0, 2),
    numberField('slopeLimit', 0, 89),
    numberField('snapDistance', 0, 2),
  ],
  defaults: {
    height: 1.8,
    radius: 0.3,
    moveSpeed: 0,
    runSpeed: 0,
    acceleration: 40,
    deceleration: 60,
    bodyTurnSpeed: 0,
    jumpSpeed: 2.8,
    airControl: 0.35,
    coyoteTime: 0.12,
    jumpBuffer: 0.12,
    stepHeight: 0.5,
    slopeLimit: 45,
    snapDistance: 0.5,
  },
  events: ['Collided'],
}

/**
 * What rolls: a body the engine hangs on suspended, driven, steered wheels. `wheels` names the
 * child nodes that DRAW them, in the body's own frame — their local place is where each wheel is
 * hung, so an author moves a wheel mesh and the axle follows. The ones ahead of the centre steer.
 */
const VEHICLE: ComponentDescriptor = {
  type: 'Vehicle',
  titleKey: 'game.components.Vehicle.title',
  descriptionKey: 'game.components.Vehicle.description',
  category: 'physics',
  fields: [
    textField('wheels'),
    numberField('wheelRadius', 0.05, 2),
    numberField('wheelWidth', 0.05, 1),
    numberField('suspensionLength', 0.05, 2),
    numberField('maxSteerAngle', 0, 60),
    numberField('maxTorque', 0, 20_000),
    choiceField('drive', ['all', 'front', 'rear']),
  ],
  defaults: {
    wheels: '',
    wheelRadius: 0.35,
    wheelWidth: 0.25,
    suspensionLength: 0.4,
    maxSteerAngle: 30,
    maxTorque: 500,
    drive: 'all',
  },
  requires: ['RigidBody'],
  events: ['Collided'],
}

/**
 * What flies: lift, drag and thrust computed on the body's own motion each step, and control
 * surfaces that only bite with air over them — a plane standing still answers no stick.
 */
const AIRCRAFT: ComponentDescriptor = {
  type: 'Aircraft',
  titleKey: 'game.components.Aircraft.title',
  descriptionKey: 'game.components.Aircraft.description',
  category: 'physics',
  fields: [
    numberField('maxThrust', 0, 200_000),
    numberField('wingArea', 0.1, 500),
    numberField('stallAngle', 1, 45),
    numberField('agility', 0, 10),
    numberField('drag', 0, 1),
  ],
  defaults: { maxThrust: 12_000, wingArea: 16, stallAngle: 15, agility: 1, drag: 0.04 },
  requires: ['RigidBody'],
  events: ['Collided'],
}

const SCRIPT: ComponentDescriptor = {
  type: 'Script',
  titleKey: 'game.components.Script.title',
  descriptionKey: 'game.components.Script.description',
  category: 'gameplay',
  // 🛑 ONE declared field. What a script exposes differs per script, so those rows are read off
  // the file's own `props` and written beside this one — see `scriptProps`. Absent by default:
  // a component nobody has set carries nothing, and `settingsOf` answers the author's own words.
  fields: [textField('script', 'script')],
  defaults: { script: '' },
}

/** `body` names the node carrying the `CharacterController` this reads; empty is this one. */
const ANIMATOR: ComponentDescriptor = {
  type: 'Animator',
  titleKey: 'game.components.Animator.title',
  descriptionKey: 'game.components.Animator.description',
  category: 'gameplay',
  // 🛑 `graph` is TYPED and not picked: a `picks` kind comes with a label of its own.
  fields: [textField('graph'), textField('body', 'node')],
  defaults: { graph: '', body: '' },
  events: ['AnimationFinished', 'AnimationEvent'],
}

/**
 * 🛑 A `Record<ComponentType, …>`, so the COMPILER refuses a type declared without a descriptor.
 * A component nothing describes has no form, no schema and no documentation — it is a name in a
 * union that no surface can offer.
 */
export const COMPONENTS: Record<ComponentType, ComponentDescriptor> = {
  Player: PLAYER,
  Health: HEALTH,
  Movement: MOVEMENT,
  Path: PATH,
  Follow: FOLLOW,
  Orbit: ORBIT,
  LookAt: LOOK_AT,
  Patrol: PATROL,
  Spin: SPIN,
  SpringArm: SPRING_ARM,
  Collider: COLLIDER,
  RigidBody: RIGID_BODY,
  Trigger: TRIGGER,
  CharacterController: CHARACTER_CONTROLLER,
  Vehicle: VEHICLE,
  Aircraft: AIRCRAFT,
  Script: SCRIPT,
  Animator: ANIMATOR,
}

export const COMPONENT_TYPES: readonly ComponentType[] =
  Object.keys(COMPONENTS).filter(isComponentType)

export function isComponentType(value: unknown): value is ComponentType {
  return typeof value === 'string' && Object.hasOwn(COMPONENTS, value)
}

export function descriptorOf(type: ComponentType): ComponentDescriptor {
  return COMPONENTS[type]
}

/** A component of that type at its defaults — what adding one from the inspector writes. */
export function newComponent(type: ComponentType): Component {
  return { ...COMPONENTS[type].defaults, type }
}

/**
 * The word a client sent, read as the field declares it — or nothing when it does not fit.
 *
 * 🛑 The bounds are enforced HERE and nowhere else. A component's value travels as text (a schema
 * naming every field of every type would describe none of them), so `options`, `min` and `max`
 * are read by no client and by no validator: without this an `axis` of `north` is written into
 * the document verbatim, saved into the `.gltf`, matched by no system, and refused on reload by
 * nothing.
 *
 * Refused rather than clamped: a caller told its value did not fit corrects it, where a caller
 * silently given another number believes it wrote the one it asked for.
 */
export function componentValueOf(field: ActionField, said: string): JsonValue | null {
  if (field.kind === 'boolean') return said === 'true' ? true : said === 'false' ? false : null
  if (field.kind === 'choice') return (field.options ?? []).includes(said) ? said : null
  if (field.kind !== 'number' && field.kind !== 'integer') return said

  const value = Number(said)
  if (!Number.isFinite(value)) return null
  if (field.kind === 'integer' && !Number.isInteger(value)) return null
  if (field.min !== undefined && value < field.min) return null

  return field.max !== undefined && value > field.max ? null : value
}

/**
 * A component with one field written, dropping a value the descriptor does not name.
 *
 * The drop is the point: an inspector form and an MCP call both hand over whatever they were
 * given, and a key nobody declared would ride into the document and out again for ever.
 */
export function withComponentField(component: Component, key: string, value: JsonValue): Component {
  if (!COMPONENTS[component.type].fields.some(field => field.key === key)) return component
  return { ...component, [key]: value, type: component.type }
}
