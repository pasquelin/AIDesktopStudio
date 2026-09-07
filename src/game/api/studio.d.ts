// SPDX-License-Identifier: MIT

/**
 * What an author's script sees, and the ONLY thing it sees.
 *
 * 🛑 One source, three readers: this text is served to Monaco so an editor can type a script, it
 * names what `kernel.ts` builds inside the sandbox, and the MCP documentation quotes it. Nothing
 * generates it — `studioApi.test.ts` holds it against the kernel instead, which is the half a
 * typecheck cannot see: the kernel ships as TEXT.
 */

type StudioGamepadControl =
  | 'leftStick'
  | 'rightStick'
  | 'leftStickX'
  | 'leftStickY'
  | 'rightStickX'
  | 'rightStickY'
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftTrigger'
  | 'rightTrigger'
  | 'select'
  | 'start'
  | 'leftStickButton'
  | 'rightStickButton'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight'
  | 'home'
type StudioInputBinding =
  | { device: 'keyboard'; code: string; axis?: 'x' | 'y'; scale?: number }
  | { device: 'mouse'; control: 'primary' }
  | {
      device: 'gamepad'
      control: StudioGamepadControl
      deadZone?: number
      invert?: boolean
      scale?: number
    }
type StudioInputAction = {
  readonly id: string
  readonly kind: 'button' | 'axis1' | 'axis2'
  readonly bindings: readonly StudioInputBinding[]
}
type StudioInputMap = {
  readonly version: number
  readonly id: string
  readonly priority: number
  readonly defaultActive: boolean
  readonly actions: readonly StudioInputAction[]
}

declare module '@studio' {
  /**
   * 🛑 What the PROJECT declares, layered in by its own `.d.ts` — see `projectTypes`.
   *
   * An interface so the project's declaration MERGES into it; empty here so a script still types
   * with no project loaded, and every name below then widens back to `string`.
   */
  /* oxlint-disable-next-line typescript/no-empty-object-type, typescript/consistent-type-definitions -- an INTERFACE and empty on purpose: only an interface merges with the project's own declaration, and a member here would be one the project cannot override */
  export interface StudioNames {}

  /** A family of the project, or a plain string while nothing declared it. */
  type Named<Family extends string> = StudioNames extends Record<Family, infer Held> ? Held : string

  /** A component type the studio has a descriptor for. Refused if the project has no such one. */
  export type ComponentName = Named<'components'>

  export type Vector3 = { x: number; y: number; z: number }
  export type InputBinding = StudioInputBinding
  export type InputAction = StudioInputAction
  export type InputMap = StudioInputMap
  export type GamepadInput = {
    readonly id: string
    readonly index: number
    readonly mapping: string
    readonly axes: readonly number[]
    readonly buttons: readonly number[]
  }

  /** One of the components an entity carries, as plain JSON. `type` names which. */
  export type Component = { type: string; [field: string]: unknown }

  /**
   * The entity a hook is running for. Every gesture is DEFERRED — see `defineScript`.
   *
   * `P` is what THIS script declared in `props`, so `self.props.speed` is a number rather than
   * an `unknown` the author has to widen — the default is what a hook typed by hand still gets.
   */
  export type Self<P = Record<string, unknown>> = {
    /** The entity's own id, stable for as long as it lives. */
    readonly id: string
    readonly name: string
    /**
     * What the inspector set on THIS instance of the script, over what `props` declared.
     *
     * The index stays open beside the declared keys: `kernel.ts` layers EVERY key an instance
     * carries, declared or not — a prop taken out of the block but left in the scene is still
     * there at runtime, and reading it must not be a compile error.
     */
    readonly props: Readonly<P & Record<string, unknown>>
    /** Where it is at the start of the step. Moving it is `moveBy` or `placeAt`. */
    readonly position: Readonly<Vector3>
    readonly rotation: Readonly<Vector3>
    /** The component of that type, or `null` when the entity does not carry one. */
    get(type: ComponentName): Component | null
    has(type: ComponentName): boolean
    /**
     * Asks the CHARACTER CONTROLLER to walk this body — the `AddMovementInput` of this runtime.
     * Gravity, slopes and walls still apply; `moveBy` places the node instead, and puts a walker
     * through a wall.
     *
     * 🛑 A DIRECTION, not a speed: the pace comes from `CharacterController.moveSpeed`, or from
     * the scene's own when that is zero. Anything longer than one unit is normalised back — half
     * a unit walks at half the pace, as half a stick does.
     *
     * 🛑 Relative to where the LOOK points, not to the world: `walk(0, -1)` is « away from the
     * camera », which is what the same call means for a stick.
     *
     * 🛑 It REPLACES the input map for this body and this step. A script silent on a step hands
     * the sticks back on it, so calling it every step owns the body and calling it never leaves
     * the player in charge — and `walk(0, 0)` is how one says « stand still ».
     */
    walk(x: number, z: number): void
    /**
     * Asks for a jump, answered by the same coyote time and buffer a button gets.
     *
     * 🛑 It ADDS to the button rather than replacing it — an impulse cannot be un-pressed, so a
     * script cannot stop a player from jumping.
     */
    jump(): void
    /**
     * Turns the look. The shape the right STICK speaks in — from −1 to 1, clamped, and a full
     * stick is a turn of about 2,6 radians a second. `look(1, 0)` turns the same way the stick
     * pushed right does, which is towards decreasing yaw.
     *
     * 🛑 There is ONE look for the world, and it belongs to the body the camera watches: asked
     * for by any other, it is dropped.
     */
    look(yaw: number, pitch: number): void
    /** Drives THIS vehicle: throttle and steering from −1 to 1, and the hand brake. */
    drive(throttle: number, steer: number, handBrake?: boolean): void
    /** Flies THIS aircraft: stick and rudder from −1 to 1, throttle as a rate. */
    fly(pitch: number, roll: number, yaw: number, throttle: number): void
    /** Moves BY that much, in metres. Applied at the end of the step. */
    moveBy(x: number, y: number, z: number): void
    /** Moves TO that place, in metres. */
    placeAt(x: number, y: number, z: number): void
    /** Turns to that rotation, in radians. */
    turnTo(x: number, y: number, z: number): void
    /** Writes one field of one component the entity ALREADY carries. */
    set(type: ComponentName, key: string, value: unknown): void
    /** Puts a named event on the bus, carrying this entity. Heard by every `onMessage`. */
    say(name: string, payload?: Record<string, unknown>): void
    /** Asks for this entity to be destroyed at the end of the step. */
    destroy(): void
    /**
     * What this body is ANIMATED by — the state machine of its `Animator`, if it carries one.
     *
     * 🛑 The two readings are a step behind, as `position` is: scripts run before the animator,
     * so what is read here is the state the frame being drawn actually shows. Empty for a body
     * no graph animates.
     */
    anim: {
      /** The state the machine ended the last step in, or `''` for a body with no animator. */
      readonly state: string
      /** How far into that state's clip, in seconds. */
      readonly time: number
      /**
       * Writes one parameter of the graph. It STAYS written until it is written again — unlike
       * `walk`, which lapses the step after.
       *
       * 🛑 The eight built-in names — `speed`, `forward`, `strafe`, `grounded`, `airborne`,
       * `verticalSpeed`, `jumped`, `turning` — are published by the runtime and cannot be taken
       * by a graph's own parameter; a graph that tries will not open.
       */
      set(param: string, value: number | boolean): void
      /**
       * Forces a state of the graph, whatever its ways out say. Held until `stop`, or until a
       * state that does not loop has played out — a one-shot need not be released by hand.
       */
      play(state: string): void
      /** Hands the body back to its own state machine. */
      stop(): void
    }
  }

  /** The step itself: its clock and what the player is doing. */
  export type Context = {
    /** How many fixed steps have run. A tick is the unit the network counts in. */
    readonly tick: number
    /** How long one step lasts, in seconds. Constant at 1/60. */
    readonly dt: number
    readonly input: {
      /** Whether the key is held down right now. `code` is a `KeyboardEvent.code`. */
      down(code: string): boolean
      /**
       * Whether it went down during THIS step. 🛑 A key TAPPED between two steps answers true
       * here AND on `released` at the same step — that is what makes a 20 ms tap register at all.
       */
      pressed(code: string): boolean
      /** Whether it came up during this step. See `pressed`: a tap says both. */
      released(code: string): boolean
      /** Whether a named button action in the active input contexts is held. */
      button(id: string): boolean
      /** The value of a named one-dimensional action, or zero. */
      axis(id: string): number
      /** The value of a named two-dimensional action, or zero on both axes. */
      axis2(id: string): Readonly<{ x: number; y: number }>
      /** Current bindings, including persisted rebindings, for a custom controls interface. */
      bindings(context: string, action: string): readonly InputBinding[]
      /** Connected standard controllers, for a custom rebinding capture interface. */
      readonly gamepads: readonly GamepadInput[]
      readonly pointer: { readonly x: number; readonly y: number; readonly down: boolean }
    }
  }

  /** What an event hook is handed: what happened, and to whom. */
  export type GameEvent = {
    readonly name: string
    readonly entity: string | null
    readonly payload: Readonly<Record<string, unknown>>
  }

  /** What `game.ai` answers today: a refusal, named. Spending is not granted to a script. */
  export type Refused = { readonly ok: false; readonly refused: 'notGranted' }

  /**
   * 🛑 The whole surface. No `fetch`, no `WebSocket`, no clock, no `Math.random` worth replaying —
   * the time comes from `ctx`, and the draw comes from here so a session replays.
   */
  export const game: {
    log: {
      info(message: unknown): void
      warn(message: unknown): void
      error(message: unknown): void
    }
    events: {
      /** Puts a named event on the bus, belonging to no entity. */
      emit(name: string, payload?: Record<string, unknown>): void
    }
    input: {
      /** Activates a project input context after this script step. */
      pushContext(id: string): void
      /** Deactivates a project input context after this script step. */
      popContext(id: string): void
      /** Replaces or appends one binding and persists it in an exported game. */
      rebind(context: string, action: string, index: number, binding: InputBinding): void
      /** Restores all defaults, one context, or one action. */
      reset(context?: string, action?: string): void
    }
    /** Asks for an entity of that name, at that place. Born at the end of the step. */
    spawn(name: string, at?: Vector3): void
    scene: {
      /**
       * Asks for another scene of the project — its document, by title or by id.
       *
       * 🛑 It does not wait, and nothing after it runs in the new scene: a world cannot replace
       * itself mid-step. Listen for `SceneLoaded`, which arrives on the new scene's own bus.
       */
      load(scene: string, options?: { fade?: number }): void
      /** Puts a value aside for the scene AFTER this one. Pure JSON, like every payload. */
      keep(key: string, value: unknown): void
      /** What a former scene put aside, or `null`. Read off the step, so it costs nothing. */
      kept(key: string): unknown
    }
    random: {
      /** In `[0, 1)`, from the world's own seed: the same session replays the same numbers. */
      float(): number
      /** In `[low, high)`. */
      int(low: number, high: number): number
    }
    /** Named and refusing: a fixed step cannot wait, and spending is not granted. */
    ai: {
      generateImage(): Refused
      generateDialogue(): Refused
      generateAudio(): Refused
    }
  }

  /**
   * What a script IS. Every hook is optional; what is not written never crosses the bridge.
   *
   * ```ts
   * import { defineScript } from '@studio'
   * export default defineScript({
   *   onUpdate(self, ctx, dt) {
   *     if (ctx.input.down('KeyW')) self.moveBy(0, 0, -4 * dt)
   *   },
   * })
   * ```
   */
  // 🛑 NO default on `P`: `Record<string, never>` was tried, and `never` is assignable to
  // everything — a script reading a prop it never declared compiled clean and multiplied an
  // `undefined` at runtime. With none, `P` falls back on the constraint, which stays red.
  export function defineScript<P extends Record<string, string | number | boolean>>(definition: {
    /**
     * What this script exposes to the inspector, with the default each one takes.
     *
     * 🛑 A plain value, always — a number, a switch or a word. It is read off the FILE before the
     * script has ever run, so an expression is left out rather than guessed at, and what the
     * inspector set on an instance is layered over it in `self.props`.
     */
    props?: P
    /** Once, when the entity joins — before its first step. */
    onCreate?(self: Self<P>, ctx: Context): void
    /** Once, on the world's first step, after everything exists. */
    onStart?(self: Self<P>, ctx: Context, dt: number): void
    /** Every fixed step. `dt` is `ctx.dt`, handed over for what a movement is written against. */
    onUpdate?(self: Self<P>, ctx: Context, dt: number): void
    /**
     * Once per RENDERED frame, after every step of it.
     *
     * 🛑 `walk`, `jump`, `drive` and `fly` asked for HERE are dropped: the controllers have
     * already read the step, and the next one opens by clearing what nobody asked for again.
     * Ask from `onUpdate`, which is the step itself.
     */
    onLateUpdate?(self: Self<P>, ctx: Context, dt: number): void
    /** Once, on its way out. The entity has already left the world. */
    onDestroy?(self: Self<P>, ctx: Context): void
    /** Every event on the bus, whoever it happened to. */
    onMessage?(self: Self<P>, ctx: Context, event: GameEvent): void
    /** When something hit THIS entity. */
    onCollision?(self: Self<P>, ctx: Context, event: GameEvent): void
    /**
     * A marker crossed inside a clip, or a state that does not loop having played out.
     *
     * `event.payload.state` names the state; `event.payload.event` the marker, and is absent for
     * the end of a clip. Both arrive for the entity that carries the `Animator`.
     */
    onAnimationEvent?(self: Self<P>, ctx: Context, event: GameEvent): void
    onTriggerEnter?(self: Self<P>, ctx: Context, event: GameEvent): void
    onTriggerExit?(self: Self<P>, ctx: Context, event: GameEvent): void
  }): unknown
}

declare module '*.input.json' {
  const inputMap: StudioInputMap
  export default inputMap
}
