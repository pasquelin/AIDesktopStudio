import type { RuntimeOccupancy } from '@shared/domain/aiMemory'
import { runtimeEndpointId, type RuntimeEndpointId } from '@shared/domain/aiRuntime'
import type { EngineDoorMemory } from './pythonProtocol'

/**
 * Engine door readings as what `admissionFor` reads. A door is a process a release plan can kill.
 */

/** `<runtime>/<door>`, which the engine already speaks. A door it spells otherwise is dropped. */
export function endpointOfDoor(door: string): RuntimeEndpointId | null {
  const [runtime, name, ...rest] = door.split('/')
  if (!runtime || !name || rest.length > 0) return null

  try {
    return runtimeEndpointId(runtime, name)
  } catch {
    return null
  }
}

/**
 * A release hands the tensors back, and where the caller is not about to reload the door it also
 * ends the process (`door.close`) — the only thing that returns the interpreter's own 208 MB.
 * What stays behind on an admission release is that baseline, never the weights a plan counts.
 */
const RECLAIMABLE = true

export function occupancyOfDoors(
  doors: readonly EngineDoorMemory[],
): Readonly<Record<RuntimeEndpointId, RuntimeOccupancy>> {
  const held: Record<string, RuntimeOccupancy> = {}

  for (const door of doors) {
    const endpoint = endpointOfDoor(door.door)
    // `heldBytes` and not `tensorBytes`: measured 2026-08-22, a generation moved the driver by
    // 5.67 GB while the allocator did not move at all.
    if (endpoint) held[endpoint] = { bytes: door.heldBytes, reclaimable: RECLAIMABLE }
  }

  return held
}
