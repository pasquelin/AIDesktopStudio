// SPDX-License-Identifier: MIT

/**
 * 🛑 The only JavaScript this repository ships as TEXT: it is evaluated INSIDE the sandbox, where
 * no module is importable and no bundler reaches. Plain ES2020, and proved by what the port does
 * rather than by a unit test.
 */
export const KERNEL = String.raw`
;(function () {
  var scripts = new Map()
  var instances = new Map()
  var intents = []
  var faults = []
  var current = null
  var context = null
  var seed = 1

  function push(intent) { intents.push(intent) }

  function vector(x, y, z) {
    return { x: number(x), y: number(y), z: number(z) }
  }

  function number(value) { return Number(value) || 0 }

  // Mulberry32, the same draw the world uses, run INSIDE the machine: a random that crossed the
  // bridge would cost more than the number it carries, and would not replay.
  function draw() {
    seed = (seed + 0x6d2b79f5) >>> 0
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function refused(method) {
    push({ act: 'log', level: 'warn', message: 'game.ai.' + method + ' refused: notGranted' })
    return { ok: false, refused: 'notGranted' }
  }

  var kept = {}
  var bindings = {}

  globalThis.defineScript = function (definition) { return definition }

  globalThis.game = {
    log: {
      info: function (message) { push({ act: 'log', level: 'info', message: String(message) }) },
      warn: function (message) { push({ act: 'log', level: 'warn', message: String(message) }) },
      error: function (message) { push({ act: 'log', level: 'error', message: String(message) }) },
    },
    events: {
      emit: function (name, payload) {
        push({ act: 'emit', name: String(name), entity: null, payload: payload || {} })
      },
    },
    input: {
      pushContext: function (id) { push({ act: 'inputContext', action: 'push', id: String(id) }) },
      popContext: function (id) { push({ act: 'inputContext', action: 'pop', id: String(id) }) },
      rebind: function (context, action, index, binding) {
        push({ act: 'inputRebind', context: String(context), action: String(action), index: Number(index), binding: binding })
      },
      reset: function (context, action) {
        var intent = { act: 'inputReset' }
        if (context !== undefined) intent.context = String(context)
        if (action !== undefined) intent.action = String(action)
        push(intent)
      },
    },
    spawn: function (name, at) {
      push({ act: 'spawn', name: String(name), at: at ? vector(at.x, at.y, at.z) : null })
    },
    scene: {
      // Asked for, never awaited: a world cannot replace itself mid-step, so the host swaps
      // between two. What answers is a SceneLoaded event, on the bus of the scene that arrives.
      load: function (scene, options) {
        push({ act: 'scene', scene: String(scene), fade: Number(options && options.fade) || 0 })
      },
      keep: function (key, value) {
        push({ act: 'keep', key: String(key), value: value === undefined ? null : value })
      },
      // Read off the FRAME, never across the bridge: a call costs nine times the work it does.
      kept: function (key) {
        return Object.prototype.hasOwnProperty.call(kept, key) ? kept[key] : null
      },
    },
    random: {
      float: draw,
      int: function (low, high) { return low + Math.floor(draw() * (high - low)) },
    },
    // Named, refusing, and synchronous: a fixed step cannot wait on a promise, and the permission
    // to spend is not granted — see aiPort.ts.
    ai: {
      generateImage: function () { return refused('generateImage') },
      generateDialogue: function () { return refused('generateDialogue') },
      generateAudio: function () { return refused('generateAudio') },
    },
  }

  function selfOf(entity, held) {
    return {
      id: entity.entity,
      name: entity.name,
      props: held.props,
      position: entity.position,
      rotation: entity.rotation,
      get: function (type) {
        for (var i = 0; i < entity.components.length; i++) {
          if (entity.components[i].type === type) return entity.components[i]
        }
        return null
      },
      has: function (type) { return this.get(type) !== null },
      moveBy: function (x, y, z) { push({ act: 'move', entity: entity.entity, by: vector(x, y, z) }) },
      walk: function (x, z) { push({ act: 'walk', entity: entity.entity, x: number(x), z: number(z) }) },
      jump: function () { push({ act: 'jump', entity: entity.entity }) },
      look: function (yaw, pitch) {
        push({ act: 'look', entity: entity.entity, yaw: number(yaw), pitch: number(pitch) })
      },
      drive: function (throttle, steer, handBrake) {
        push({ act: 'drive', entity: entity.entity, throttle: number(throttle), steer: number(steer), handBrake: handBrake === true })
      },
      fly: function (pitch, roll, yaw, throttle) {
        push({ act: 'fly', entity: entity.entity, pitch: number(pitch), roll: number(roll), yaw: number(yaw), throttle: number(throttle) })
      },
      placeAt: function (x, y, z) { push({ act: 'place', entity: entity.entity, at: vector(x, y, z) }) },
      turnTo: function (x, y, z) { push({ act: 'turn', entity: entity.entity, to: vector(x, y, z) }) },
      set: function (type, key, value) {
        push({ act: 'field', entity: entity.entity, type: String(type), key: String(key), value: value })
      },
      say: function (name, payload) {
        push({ act: 'emit', name: String(name), entity: entity.entity, payload: payload || {} })
      },
      destroy: function () { push({ act: 'destroy', entity: entity.entity }) },
      anim: {
        state: entity.anim ? entity.anim.state : '',
        time: entity.anim ? entity.anim.time : 0,
        set: function (param, value) {
          push({ act: 'animParam', entity: entity.entity, param: String(param), value: value === true || value === false ? value : number(value) })
        },
        play: function (state) { push({ act: 'animPlay', entity: entity.entity, state: String(state) }) },
        stop: function () { push({ act: 'animStop', entity: entity.entity }) },
      },
    }
  }

  function has(list, code) {
    for (var i = 0; i < list.length; i++) if (list[i] === code) return true
    return false
  }

  function contextOf(frame) {
    kept = frame.kept || {}
    if (frame.bindings) bindings = frame.bindings
    var actions = frame.actions || {}
    return {
      tick: frame.tick,
      dt: frame.dt,
      input: {
        down: function (code) { return has(frame.input.held, code) },
        pressed: function (code) { return has(frame.input.pressed, code) },
        released: function (code) { return has(frame.input.released, code) },
        button: function (id) { return actions[id] === true },
        axis: function (id) { return typeof actions[id] === 'number' ? actions[id] : 0 },
        axis2: function (id) {
          var value = actions[id]
          return value && typeof value === 'object' ? value : { x: 0, y: 0 }
        },
        bindings: function (context, action) {
          var map = bindings[context]
          return (map && map[action]) || []
        },
        gamepads: frame.input.gamepads || [],
        pointer: frame.input.pointer,
      },
    }
  }

  // The line an editor would open, read off the stack QuickJS writes. One LESS: the host wraps
  // every module in a line of its own before evaluating it — see wrapped().
  function faultOf(error, script, entity) {
    var stack = (error && error.stack) || ''
    var at = /\(([^()]*):(\d+):(\d+)\)/.exec(stack)
    return {
      script: script,
      entity: entity,
      message: (error && error.message) || String(error),
      line: at ? Math.max(1, Number(at[2]) - 1) : 0,
      column: at ? Number(at[3]) : 0,
    }
  }

  // Which hooks at least one LIVING instance declares. The host skips a crossing entirely for a
  // hook nobody wrote — the frame would otherwise be serialized to find that out per entity.
  function hookNames() {
    var named = {}
    instances.forEach(function (held) {
      for (var key in held.definition) if (typeof held.definition[key] === 'function') named[key] = true
    })
    return Object.keys(named)
  }

  var INERT_CONTEXT = {
    tick: 0,
    dt: 0,
    input: {
      down: function () { return false },
      pressed: function () { return false },
      released: function () { return false },
      button: function () { return false },
      axis: function () { return 0 },
      axis2: function () { return { x: 0, y: 0 } },
      bindings: function () { return [] },
      gamepads: [],
      pointer: { x: 0, y: 0, down: false },
    },
  }

  globalThis.__register = function (script, definition) {
    scripts.set(script, definition || null)
  }

  globalThis.__attach = function (payload) {
    var wanted = JSON.parse(payload)
    var refusals = []
    for (var i = 0; i < wanted.length; i++) {
      var one = wanted[i]
      var definition = scripts.get(one.script)
      if (!definition) {
        refusals.push({ script: one.script, entity: one.entity, message: 'script never loaded', line: 0, column: 0 })
        continue
      }
      // The instance's settings LAYERED over what the script declares: a prop the inspector
      // never touched still answers what its author wrote as the default.
      var settings = {}
      var declared = definition.props || {}
      for (var key in declared) settings[key] = declared[key]
      for (var given in one.props || {}) settings[given] = one.props[given]
      instances.set(one.entity, { script: one.script, definition: definition, props: settings })
    }
    return JSON.stringify({ intents: [], faults: refusals, hooks: hookNames() })
  }

  // 🛑 onDestroy belongs HERE and not to a swept frame: by the time the system notices, the
  // entity has left the store, so a frame composed from the world holds the survivors instead.
  globalThis.__detach = function (payload) {
    var gone = JSON.parse(payload)
    intents = []
    faults = []
    for (var i = 0; i < gone.length; i++) {
      var one = gone[i]
      var held = instances.get(one.entity)
      if (!held) continue
      call('onDestroy', one.entity, held, one, context || INERT_CONTEXT, 0)
      instances.delete(one.entity)
    }
    return JSON.stringify({ intents: intents, faults: faults, hooks: hookNames() })
  }

  globalThis.__disarm = function (entity) {
    instances.delete(entity)
    return JSON.stringify(hookNames())
  }

  globalThis.__seed = function (value) { seed = Number(value) >>> 0 }

  /** Who was running when the machine was interrupted — read AFTER the deadline was pushed back. */
  globalThis.__current = function () { return current ? JSON.stringify(current) : '' }

  // The self is built INSIDE, after the hook was found: it is nine allocations, and the common
  // case is a script that does not declare the hook being driven.
  function call(hook, entity, held, seen, ctx, arg) {
    var fn = held.definition[hook]
    if (typeof fn !== 'function') return
    current = { script: held.script, entity: entity }
    try {
      fn(selfOf(seen, held), ctx, arg)
    } catch (error) {
      faults.push(faultOf(error, held.script, entity))
    }
    current = null
  }

  globalThis.__run = function (hook, payload) {
    var frame = JSON.parse(payload)
    intents = []
    faults = []
    context = contextOf(frame)
    for (var i = 0; i < frame.entities.length; i++) {
      var entity = frame.entities[i]
      var held = instances.get(entity.entity)
      if (!held) continue
      call(hook, entity.entity, held, entity, context, frame.dt)
    }
    return JSON.stringify({ intents: intents, faults: faults })
  }

  var HOOKS = {
    AnimationEvent: 'onAnimationEvent',
    AnimationFinished: 'onAnimationEvent',
    Collided: 'onCollision',
    TriggerEntered: 'onTriggerEnter',
    TriggerExited: 'onTriggerExit',
  }

  globalThis.__deliver = function (payload, events) {
    var frame = JSON.parse(payload)
    var delivered = JSON.parse(events)
    intents = []
    faults = []
    context = contextOf(frame)
    var byId = new Map()
    // Walked ONCE for every event rather than once per event: who hears onMessage is a property
    // of the instances, not of what happened.
    var hearing = []
    for (var i = 0; i < frame.entities.length; i++) {
      var one = frame.entities[i]
      byId.set(one.entity, one)
      var mine = instances.get(one.entity)
      if (mine && typeof mine.definition.onMessage === 'function') hearing.push(one)
    }

    for (var e = 0; e < delivered.length; e++) {
      var event = delivered[e]
      // The one it happened TO hears its own hook; everyone hears onMessage.
      var subject = event.entity ? byId.get(event.entity) : null
      var held = event.entity ? instances.get(event.entity) : null
      var named = HOOKS[event.name]
      if (subject && held && named) call(named, event.entity, held, subject, context, event)

      for (var k = 0; k < hearing.length; k++) {
        var listener = hearing[k]
        call('onMessage', listener.entity, instances.get(listener.entity), listener, context, event)
      }
    }
    return JSON.stringify({ intents: intents, faults: faults })
  }
})()
`
