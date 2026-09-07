// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InputState } from '../ports/inputPort'
import type { ScriptPort } from '../ports/scriptPort'
import type { ScriptEntity, ScriptFrame } from '../script/frame'
import { loadQuickjsScripts } from './quickjsScripts'

const IDLE: InputState = {
  held: [],
  pressed: [],
  released: [],
  pointer: { x: 0, y: 0, down: false },
}

const walker = (over: Partial<ScriptEntity> = {}): ScriptEntity => ({
  entity: 'e1',
  name: 'Walker',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  components: [],
  ...over,
})

const frameOf = (entities: readonly ScriptEntity[], input = IDLE): ScriptFrame => ({
  tick: 1,
  dt: 1 / 60,
  input,
  actions: {},
  bindings: {},
  entities,
  kept: {},
})

/** What the studio's transpiler hands over: CommonJS, one `export default`. */
const compiled = (body: string): string => `exports.default = defineScript({ ${body} })`

describe('the sandbox a game runs its own code in', () => {
  let port: ScriptPort

  beforeEach(async () => {
    port = await loadQuickjsScripts()
  })

  afterEach(() => {
    port.dispose()
  })

  const running = (body: string, over: Partial<ScriptEntity> = {}) => {
    expect(port.load([{ script: 'script:Walk.ts', code: compiled(body) }])).toEqual([])
    expect(port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: { speed: 3 } }])).toEqual(
      [],
    )
    return port.run('onUpdate', frameOf([walker(over)]))
  }

  it('turns a script into what the world should do, and nothing else', () => {
    const outcome = running('onUpdate(self, ctx, dt) { self.moveBy(0, 0, -self.props.speed * dt) }')

    expect(outcome.faults).toEqual([])
    expect(outcome.intents).toEqual([{ act: 'move', entity: 'e1', by: { x: 0, y: 0, z: -3 / 60 } }])
  })

  it('reads the keys under the fingers of whoever is playing', () => {
    expect(
      port.load([
        {
          script: 'script:Walk.ts',
          code: compiled(
            'onUpdate(self, ctx) { if (ctx.input.down("KeyW")) self.moveBy(0, 0, -1) }',
          ),
        },
      ]),
    ).toEqual([])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: {} }])

    const still = port.run('onUpdate', frameOf([walker()]))
    // Two frames, so two budgets — `script.ts` refills at the end of every rendered one. Sharing
    // four milliseconds of wall clock between them leaves the second one empty on a busy machine.
    port.refill()
    const held = port.run('onUpdate', frameOf([walker()], { ...IDLE, held: ['KeyW'] }))

    expect(still.intents).toEqual([])
    expect(held.intents).toEqual([{ act: 'move', entity: 'e1', by: { x: 0, y: 0, z: -1 } }])
  })

  it('reads named actions and requests input context changes', () => {
    port.load([
      {
        script: 'script:Walk.ts',
        code: compiled(
          'onUpdate(self, ctx) { if (ctx.input.button("jump")) self.moveBy(0, 1, 0); game.input.pushContext("vehicle"); game.input.rebind("character", "jump", 0, { device: "keyboard", code: "Enter" }); game.input.reset("character", "jump") }',
        ),
      },
    ])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: {} }])

    const outcome = port.run('onUpdate', {
      ...frameOf([walker()]),
      actions: { jump: true, throttle: 0.5, move: { x: 1, y: -1 } },
    })

    expect(outcome.intents).toEqual([
      { act: 'move', entity: 'e1', by: { x: 0, y: 1, z: 0 } },
      { act: 'inputContext', action: 'push', id: 'vehicle' },
      {
        act: 'inputRebind',
        context: 'character',
        action: 'jump',
        index: 0,
        binding: { device: 'keyboard', code: 'Enter' },
      },
      { act: 'inputReset', context: 'character', action: 'jump' },
    ])
  })

  it('reads the components its entity carries', () => {
    const outcome = running(
      'onUpdate(self) { const health = self.get("Health"); if (health) game.log.info("hp " + health.current) }',
      { components: [{ type: 'Health', max: 100, current: 40 }] },
    )

    expect(outcome.intents).toEqual([{ act: 'log', level: 'info', message: 'hp 40' }])
  })

  /** 🛑 The whole reason the sandbox exists: a game's code is not trusted to be reachable. */
  it('has no way out — no fetch, no socket, no clock, no require', () => {
    const outcome = running(
      'onUpdate() { game.log.info([typeof fetch, typeof WebSocket, typeof XMLHttpRequest, typeof localStorage, typeof process, typeof require].join(",")) }',
    )

    expect(outcome.intents).toEqual([
      {
        act: 'log',
        level: 'info',
        message: 'undefined,undefined,undefined,undefined,undefined,undefined',
      },
    ])
  })

  /** 🛑 The second reason: the studio must not freeze because a script did. */
  it('interrupts a script that will not stop, names it, and never runs it again', () => {
    const started = Date.now()
    const outcome = running('onUpdate() { while (true) {} }')
    const took = Date.now() - started

    expect(outcome.faults[0]?.entity).toBe('e1')
    expect(outcome.faults[0]?.script).toBe('script:Walk.ts')
    expect(port.disarmed()).toEqual(['e1'])
    expect(took).toBeLessThan(200)

    // And the frame after it is clean: the loop is out of the world, not retried.
    port.refill()
    expect(port.run('onUpdate', frameOf([walker()]))).toEqual({ intents: [], faults: [] })
  })

  /** 🛑 A frame, not a call: a late frame carries up to fifteen steps, each driving its hooks. */
  it('spends one budget for the whole frame, and says so rather than going quiet', () => {
    running('onUpdate() { while (true) {} }')

    const after = port.run('onUpdate', frameOf([walker()]))
    expect(after.faults[0]?.message).toContain('did not run')
    // Said once, then silence — a frame that ran out must not write a line per hook.
    expect(port.run('onUpdate', frameOf([walker()])).faults).toEqual([])

    port.refill()
    expect(port.run('onUpdate', frameOf([walker()])).faults).toEqual([])
  })

  /** 🛑 The entity has left the world by then, so the hook cannot be driven off a swept frame. */
  it('runs onDestroy on its way out, for the one leaving', () => {
    port.load([
      {
        script: 'script:Walk.ts',
        code: compiled(
          'onDestroy(self) { game.log.info("bye " + self.id + " at " + self.position.y) }',
        ),
      },
    ])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: {} }])
    const outcome = port.detach([walker({ position: { x: 0, y: 7, z: 0 } })])

    expect(outcome.intents).toEqual([{ act: 'log', level: 'info', message: 'bye e1 at 7' }])
    expect(port.declares('onDestroy')).toBe(false)
  })

  /** 🛑 A death that lands on a spent frame still leaves the sandbox, or it stays for ever. */
  it('lets an entity go even when the frame budget is gone', () => {
    // The loop burns the frame's budget whole, and e2 is a bystander that outlives it.
    running('onUpdate() { while (true) {} }')
    port.load([
      { script: 'script:Bye.ts', code: compiled('onDestroy(self) { game.log.info("bye") }') },
    ])
    port.attach([{ entity: 'e2', script: 'script:Bye.ts', props: {} }])
    expect(port.declares('onDestroy')).toBe(true)

    const outcome = port.detach([walker({ entity: 'e2' })])

    expect(outcome.intents).toEqual([{ act: 'log', level: 'info', message: 'bye' }])
    expect(port.declares('onDestroy')).toBe(false)
  })

  /** 🛑 What the inspector set, over what the author wrote — and the author's word when it did not. */
  it("layers an instance's settings over the ones its script declares", () => {
    port.load([
      {
        script: 'script:Walk.ts',
        code: compiled(
          'props: { speed: 3, jump: 2 }, onUpdate(self) { game.log.info(self.props.speed + "/" + self.props.jump) }',
        ),
      },
    ])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: { speed: 9 } }])

    const outcome = port.run('onUpdate', frameOf([walker()]))

    expect(outcome.intents).toEqual([{ act: 'log', level: 'info', message: '9/2' }])
  })

  it('says which hooks are written, so a caller can skip a crossing whole', () => {
    port.load([{ script: 'script:Walk.ts', code: compiled('onUpdate() {}') }])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: {} }])

    expect(port.declares('onUpdate')).toBe(true)
    expect(port.declares('onLateUpdate')).toBe(false)
  })

  /** 🛑 The line the AUTHOR wrote, not the one the host's wrapper shifted it to. */
  it('says where a script threw, with the line an editor would open', () => {
    port.load([
      {
        script: 'script:Walk.ts',
        code: 'exports.default = defineScript({\n  onUpdate() {\n    throw new Error("no")\n  },\n})',
      },
    ])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: {} }])

    const outcome = port.run('onUpdate', frameOf([walker()]))

    expect(outcome.faults[0]?.message).toBe('no')
    expect(outcome.faults[0]?.entity).toBe('e1')
    expect(outcome.faults[0]?.line).toBe(3)
  })

  /** One bad frame is a bug; three is a script nobody should keep paying for. */
  it('disarms a script that throws over and over', () => {
    running('onUpdate() { throw new Error("no") }')
    // Three frames, three budgets: the fault count is what disarms, and a frame that never ran
    // for want of milliseconds does not count towards it.
    port.refill()
    port.run('onUpdate', frameOf([walker()]))
    port.refill()
    const third = port.run('onUpdate', frameOf([walker()]))

    expect(third.faults[0]?.message).toContain('disarmed')
    expect(port.disarmed()).toEqual(['e1'])
  })

  /**
   * 🛑 The load path is a script RUNNING: a loop written outside any hook is caught by nothing
   * else, and a synchronous WebAssembly call is not something a window comes back from.
   */
  it('interrupts a module that will not finish loading', () => {
    const started = Date.now()
    const faults = port.load([{ script: 'script:Bad.ts', code: 'while (true) {}' }])

    expect(Date.now() - started).toBeLessThan(2000)
    expect(faults[0]?.script).toBe('script:Bad.ts')
    // And the machine is still usable afterwards: one bad module is not the whole sandbox.
    expect(port.load([{ script: 'script:Walk.ts', code: compiled('onUpdate() {}') }])).toEqual([])
  })

  it('refuses a script that names a module, rather than running half of it', () => {
    const faults = port.load([
      { script: 'script:Bad.ts', code: 'const three = require("three"); exports.default = three' },
    ])

    expect(faults[0]?.script).toBe('script:Bad.ts')
    expect(faults[0]?.message).toContain('require')
  })

  /**
   * A game that cannot be replayed cannot be tested, predicted over a network, or reported.
   *
   * 🛑 `refill()` between the two, as `script.ts` does at the end of every rendered frame: the
   * frame budget is four milliseconds of WALL CLOCK shared by everything that runs inside one,
   * so two runs without it split four milliseconds between them. On a loaded machine the first
   * spent them all and the second answered `NO_OUTCOME` — an empty `intents`, no fault, and a
   * suite that went red for the machine it ran on rather than for anything in the sandbox.
   */
  it('draws the same numbers from the same seed', () => {
    port.seed(7)
    const once = running('onUpdate() { game.log.info(String(game.random.int(0, 1000))) }')
    port.refill()
    port.seed(7)
    const twice = port.run('onUpdate', frameOf([walker()]))

    // Read before the comparison: an overspent budget answers an empty outcome and no fault, so
    // comparing first reported "these two differ" for a frame that never ran.
    expect(twice.faults).toEqual([])
    expect(twice.intents).toEqual(once.intents)
    expect(once.intents).toHaveLength(1)
  })

  it('delivers what happened to the entity it happened to', () => {
    port.load([
      {
        script: 'script:Walk.ts',
        code: compiled(
          'onCollision(self, ctx, event) { game.log.info("hit " + event.payload.other) }',
        ),
      },
    ])
    port.attach([{ entity: 'e1', script: 'script:Walk.ts', props: {} }])

    const outcome = port.deliver(frameOf([walker()]), [
      { name: 'Collided', entity: 'e1', payload: { other: 'wall' } },
    ])

    expect(outcome.intents).toEqual([{ act: 'log', level: 'info', message: 'hit wall' }])
  })
})
