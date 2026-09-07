// SPDX-License-Identifier: MIT

import type { PhysicsPort } from '../ports/physicsPort'
import { createJoltPhysics } from './joltPhysicsWorld'
import type { JoltModule } from './joltPhysicsTypes'
import { loadOnce } from './loadOnce'

const engine = loadOnce(startEngine)

/** Loads the 3.1 MB inline WebAssembly only in windows that need physics. */
export async function loadJoltPhysics(): Promise<PhysicsPort> {
  return createJoltPhysics(await engine())
}

async function startEngine(): Promise<JoltModule> {
  const module = await import('jolt-physics/wasm-compat')
  return module.default()
}

/** Bytes left in the engine heap. The fixed 128 MB npm build aborts when exhausted. */
export async function joltFreeBytes(): Promise<number> {
  return (await engine()).JoltInterface.prototype.sGetFreeMemory()
}
