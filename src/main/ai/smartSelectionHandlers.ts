import { CHANNELS } from '@shared/ipc'
import { z } from 'zod'
import { handle } from '@main/ipc/handle'
import type { RunningTasks } from '@main/task/runningTasks'
import type { SmartSelectionHost } from './smartSelectionHost'

const point = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
})
const request = z.object({
  id: z.string().uuid(),
  revision: z.string().min(1),
  png: z.instanceof(Uint8Array).refine(value => value.byteLength > 0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  prompt: z.union([
    z.object({ point }),
    z.object({
      box: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
      }),
    }),
  ]),
})

export function registerSmartSelectionHandlers(
  host: SmartSelectionHost,
  running: RunningTasks,
): void {
  handle(CHANNELS.smartSelectionRun, async (_event, value) => {
    const parsed = request.parse(value)
    return await running.run(parsed.id, signal => host.run(parsed, signal))
  })
}
