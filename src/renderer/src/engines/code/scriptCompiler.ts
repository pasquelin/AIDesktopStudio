import { digest } from '@shared/hash'
import type { ScriptModule } from '@game/ports/scriptPort'
import { INPUT_MAP_EXTENSION, type InputMapModule } from '@shared/domain/inputMap'
import { createWorkerSession } from '../core/workerSession'
import type { CodeRequest, CodeResponse } from './codeMessage'

/** A script that would not compile, said where an editor could open it. */
export type ScriptTrouble = { script: string; message: string; line: number }

export type ScriptCompiler = {
  /** Every script, compiled once. What came back unchanged is served from the cache. */
  compile: (
    sources: readonly { script: string; source: string }[],
    inputMaps?: readonly InputMapModule[],
  ) => Promise<{ modules: ScriptModule[]; troubles: ScriptTrouble[] }>
}

const spawn = (): Worker =>
  new Worker(new URL('./code.worker.ts', import.meta.url), { type: 'module' })

/**
 * 🛑 Held by the DIGEST of the source and, only for relative input imports, its path. Kept for the
 * window with no way to close it — the next Play would otherwise pay the parse again.
 */
export function createScriptCompiler(open: () => Worker = spawn): ScriptCompiler {
  const session = createWorkerSession<CodeRequest, CodeResponse>(open)
  const compiled = new Map<string, string>()

  return {
    compile: async (sources, inputMaps = []) => {
      const inputsKey = JSON.stringify(inputMaps)
      const keyed = sources.map(one => ({
        ...one,
        key: digest(
          one.source + inputsKey + (one.source.includes(INPUT_MAP_EXTENSION) ? one.script : ''),
        ),
      }))
      const asked = new Set<string>()
      // Sent TOGETHER: the worker answers by `id`, so what is waiting is one round trip rather
      // than one per script — a project of thirty would otherwise queue thirty latencies.
      const fresh = await Promise.all(
        keyed
          .filter(one => !compiled.has(one.key) && !asked.has(one.key) && asked.add(one.key))
          .map(async one => ({
            ...one,
            answer: await session.send({
              id: session.nextId(),
              script: one.script,
              source: one.source,
              inputMaps,
            }),
          })),
      )

      // 🛑 Keyed by the DIGEST, like the request: two scripts of identical source are one round
      // trip, and a refusal recorded under the one SENT dropped the other from the modules with
      // nothing said about it — missing from the Play and from the export.
      const refused = new Map<string, { message: string; line: number }>()
      for (const one of fresh) {
        if ('trouble' in one.answer) {
          refused.set(one.key, { message: one.answer.trouble, line: one.answer.line })
          continue
        }
        compiled.set(one.key, one.answer.code)
      }

      const modules: ScriptModule[] = []
      const troubles: ScriptTrouble[] = []
      for (const one of keyed) {
        const failed = refused.get(one.key)
        if (failed) {
          troubles.push({ script: one.script, ...failed })
          continue
        }
        const held = compiled.get(one.key)
        if (held !== undefined) modules.push({ script: one.script, code: held })
      }
      return { modules, troubles }
    },
  }
}
