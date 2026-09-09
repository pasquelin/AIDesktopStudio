// SPDX-License-Identifier: MIT

import type * as QuickJS from 'quickjs-emscripten-core'
import type { GameEvent } from '@shared/domain/gameEvent'
import { isRecord } from '../guards'
import { KERNEL } from '../script/kernel'
import {
  NO_OUTCOME,
  type ScriptFault,
  type ScriptIntent,
  type ScriptFrame,
  type ScriptHook,
  type ScriptOutcome,
} from '../script/frame'
import { loadOnce } from './loadOnce'
import {
  FAULTS_BEFORE_DISARM,
  SCRIPT_BUDGET_MS,
  SCRIPT_LOAD_BUDGET_MS,
  type ScriptModule,
  type ScriptPort,
} from '../ports/scriptPort'

type Engine = QuickJS.QuickJSWASMModule

const engine = loadOnce(startEngine)

/**
 * The sandbox, loaded on FIRST PLAY. Imported dynamically for the reason the physics is: the machine
 * carries its WebAssembly inlined and weighs some 3 Mo, which no window that only draws needs.
 */
export async function loadQuickjsScripts(): Promise<ScriptPort> {
  return createQuickjsScripts(await engine())
}

async function startEngine(): Promise<Engine> {
  const core = await import('quickjs-emscripten-core')
  // The single-file variant: its WebAssembly is inlined, so nothing is fetched and the content
  // security policy has nothing to allow beyond `wasm-unsafe-eval`.
  const variant = (await import('@jitl/quickjs-singlefile-browser-release-sync')).default
  return await core.newQuickJSWASMModuleFromVariant(variant)
}

/** Takes the machine rather than reaching for it, so the load stays in one place above. */
function createQuickjsScripts(machine: Engine): ScriptPort {
  const runtime = machine.newRuntime()
  const context = runtime.newContext()
  const disarmed = new Set<string>()
  const faultCount = new Map<string, number>()
  const declared = new Set<string>()
  let deadline = Number.POSITIVE_INFINITY
  let left = SCRIPT_BUDGET_MS
  let overspent = false
  runtime.setInterruptHandler(() => Date.now() > deadline)

  /** 🛑 Under a deadline of its own: evaluating a module RUNS its top level. */
  const evaluate = (code: string, file: string, budget: number): ScriptFault | null => {
    deadline = Date.now() + budget
    const held = context.evalCode(code, file)
    deadline = Number.POSITIVE_INFINITY
    if (held.error) {
      const said = context.dump(held.error)
      held.error.dispose()
      return faultOf(said, file)
    }
    held.value.dispose()
    return null
  }

  const loadKernel = (): void => {
    // 🛑 No budget: the kernel is OURS and cannot run away, so the guard against `while (true)` in
    // somebody's module protects nothing here. Held to the module budget it refused to load at all
    // on a machine busy enough to spend 100 ms on it, and the sandbox never opened.
    const fault = evaluate(KERNEL, 'kernel.js', Number.POSITIVE_INFINITY)
    if (fault) throw new Error(`the sandbox kernel did not load: ${fault.message}`)
  }
  loadKernel()

  /**
   * 🛑 Resolved ONCE. A handle costs a crossing to fetch and another to release, and these seven
   * names never move — paying it per hook is two of the frame's crossings spent on nothing.
   */
  const held = {
    run: context.getProp(context.global, '__run'),
    deliver: context.getProp(context.global, '__deliver'),
    attach: context.getProp(context.global, '__attach'),
    detach: context.getProp(context.global, '__detach'),
    disarm: context.getProp(context.global, '__disarm'),
    seed: context.getProp(context.global, '__seed'),
    current: context.getProp(context.global, '__current'),
  }

  const invoke = (fn: QuickJS.QuickJSHandle, args: readonly string[]): string | ScriptFault => {
    const passed = args.map(one => context.newString(one))
    const answer = context.callFunction(fn, context.undefined, ...passed)
    for (const one of passed) one.dispose()

    if (answer.error) {
      const said = context.dump(answer.error)
      answer.error.dispose()
      return faultOf(said, 'sandbox')
    }
    const value = context.getString(answer.value)
    answer.value.dispose()
    return value
  }

  /** Whoever was running when the machine was stopped — asked with the deadline pushed back. */
  const culprit = (): { script: string; entity: string } | null => {
    deadline = Number.POSITIVE_INFINITY
    const said = invoke(held.current, [])
    if (typeof said !== 'string' || said.length === 0) return null
    const parsed: unknown = JSON.parse(said)
    return isCulprit(parsed) ? parsed : null
  }

  const learn = (hooks: unknown): void => {
    if (!Array.isArray(hooks)) return
    declared.clear()
    for (const hook of hooks) if (typeof hook === 'string') declared.add(hook)
  }

  /** Out of the sandbox for the rest of the session, and out of the hooks it was declaring. */
  const disarm = (entity: string): void => {
    disarmed.add(entity)
    const said = invoke(held.disarm, [entity])
    if (typeof said === 'string') learn(JSON.parse(said))
  }

  const blame = (one: ScriptFault): ScriptFault => {
    if (!one.entity) return one
    const count = (faultCount.get(one.entity) ?? 0) + 1
    faultCount.set(one.entity, count)
    if (count < FAULTS_BEFORE_DISARM) return one

    disarm(one.entity)
    return { ...one, message: `${one.message} — disarmed after ${count} faults` }
  }

  /** One hook over the whole frame, inside what is LEFT of the frame's budget. */
  const drive = (fn: QuickJS.QuickJSHandle, args: readonly string[]): ScriptOutcome => {
    if (left <= 0) {
      if (overspent) return NO_OUTCOME
      overspent = true
      return { intents: [], faults: [spent()] }
    }

    const from = Date.now()
    deadline = from + left
    const said = invoke(fn, args)
    if (typeof said !== 'string') {
      const at = culprit()
      const blamed: ScriptFault = at ? { ...said, script: at.script, entity: at.entity } : said
      left = 0
      // Straight out, without waiting for a third: a script that overran once will overrun again,
      // and it is the whole frame it takes with it.
      if (blamed.entity) disarm(blamed.entity)
      return { intents: [], faults: [blamed] }
    }
    deadline = Number.POSITIVE_INFINITY
    left -= Date.now() - from

    const outcome: unknown = JSON.parse(said)
    if (!isOutcome(outcome)) return NO_OUTCOME
    learn(outcome.hooks)
    return { intents: outcome.intents, faults: outcome.faults.map(blame) }
  }

  return {
    seed: value => {
      invoke(held.seed, [String(value)])
    },

    load: modules => {
      const faults: ScriptFault[] = []
      for (const one of modules) {
        const trouble = evaluate(wrapped(one), fileOf(one.script), SCRIPT_LOAD_BUDGET_MS)
        if (trouble) faults.push({ ...trouble, script: one.script })
      }
      return faults
    },

    attach: instances => {
      const said = invoke(held.attach, [JSON.stringify(instances)])
      if (typeof said !== 'string') return [said]
      const parsed: unknown = JSON.parse(said)
      if (!isOutcome(parsed)) return []
      learn(parsed.hooks)
      return parsed.faults
    },

    detach: leaving => {
      for (const one of leaving) {
        disarmed.delete(one.entity)
        faultCount.delete(one.entity)
      }
      // 🛑 Outside the frame's budget, and on purpose: a spent frame that skipped this would
      // leave the instance in the sandbox for ever, still declaring hooks nobody owns.
      const spare = left
      left = SCRIPT_LOAD_BUDGET_MS
      const outcome = drive(held.detach, [JSON.stringify(leaving)])
      left = spare
      return outcome
    },

    declares: hook => declared.has(hook),

    run: (hook: ScriptHook, frame: ScriptFrame) => drive(held.run, [hook, JSON.stringify(frame)]),

    deliver: (frame: ScriptFrame, events: readonly GameEvent[]) =>
      events.length === 0
        ? NO_OUTCOME
        : drive(held.deliver, [JSON.stringify(frame), JSON.stringify(events)]),

    refill: () => {
      left = SCRIPT_BUDGET_MS
      overspent = false
    },

    disarmed: () => [...disarmed],

    dispose: () => {
      for (const one of Object.values(held)) one.dispose()
      context.dispose()
      runtime.dispose()
    },
  }
}

/** Said once per frame, never per hook: a frame that ran out says so, it does not go quiet. */
const spent = (): ScriptFault => ({
  script: 'sandbox',
  entity: null,
  message: `the frame's ${SCRIPT_BUDGET_MS} ms of scripts were spent — the rest of it did not run`,
  line: 0,
  column: 0,
})

/**
 * The module, run for its `export default`. Transpiled to CommonJS by the studio, so what it
 * declares lands on `exports` — and any `require` it kept is a name the sandbox does not hold,
 * which is the refusal rather than an escape.
 */
const wrapped = (one: ScriptModule): string =>
  `;(function(){var exports={};var module={exports:exports};\n${one.code}\n__register(${JSON.stringify(one.script)}, exports.default||module.exports.default||null)})()`

/** What an editor opens. A script's reference is `script:<path>`, and the path is the file. */
const fileOf = (script: string): string => script.replace(/^script:/, '')

function faultOf(said: unknown, file: string): ScriptFault {
  const message = isRecord(said) && typeof said.message === 'string' ? said.message : String(said)
  const stack = isRecord(said) && typeof said.stack === 'string' ? said.stack : ''
  const at = /\(([^()]*):(\d+):(\d+)\)/.exec(stack)

  return {
    script: file,
    entity: null,
    message,
    // One less: the module is wrapped in a line of its own before it is evaluated.
    line: at ? Math.max(1, Number(at[2]) - 1) : 0,
    column: at ? Number(at[3]) : 0,
  }
}

const isCulprit = (value: unknown): value is { script: string; entity: string } =>
  isRecord(value) && typeof value.script === 'string' && typeof value.entity === 'string'

/** Not re-read intent by intent: `apply` reaches the world through gestures that refuse. */
const isOutcome = (
  value: unknown,
): value is { intents: ScriptIntent[]; faults: ScriptFault[]; hooks?: unknown } =>
  isRecord(value) && Array.isArray(value.intents) && Array.isArray(value.faults)
