// SPDX-License-Identifier: MIT

import type { GameApi } from '../api/gameApi'
import type { AnimationPort } from '../ports/animationPort'
import type { LogEntry } from '@shared/domain/gameRuntime'
import type { Player } from '../ports/netPort'
import type { AudioPort } from '../ports/audioPort'
import type { PhysicsPort } from '../ports/physicsPort'
import type { ScriptPort } from '../ports/scriptPort'
import type { RenderPort } from '../ports/renderPort'
import type { ScenePort } from '../ports/scenePort'
import { createDomInput, type DomInputTarget } from './domInput'
import { createHostedAssets } from './hostedAssets'
import { createInertAnimation } from './inertAnimation'
import { createInertAudio } from './inertAudio'
import { createInertPhysics } from './inertPhysics'
import { createInertScripts } from './inertScripts'
import { createInertRender } from './inertRender'
import { createRefusedAi } from './refusedAi'
import { createRingLog } from './ringLog'
import { createSingleScene } from './singleScene'
import { createSoloNet } from './soloNet'

export type StudioHostDeps = {
  input: DomInputTarget
  player: Player
  /** What poses a body from a state machine. Absent leaves every character in its rest pose. */
  animation?: AnimationPort
  /** What draws. Absent while a host has no viewport to give — see `createInertRender`. */
  render?: RenderPort
  /** What simulates. Absent until the engine's WebAssembly has landed — see `loadJoltPhysics`. */
  physics?: PhysicsPort
  /** Where a game's own code runs. Absent leaves every script silent — see `loadQuickjsScripts`. */
  script?: ScriptPort
  /** What sounds. Absent leaves a game silent — named rather than hidden, like the others. */
  audio?: AudioPort
  /** Where the project's other scenes are read from. Absent holds the game to the one it opened. */
  scenes?: ScenePort
  /** How the studio spells an asset URL — `assetUrl` from `@shared/domain/asset`. */
  urlForAsset: (id: string) => string
  /**
   * Where a line ALSO goes. The journal lives in the main process and nothing here may reach it,
   * so the window that opens the game passes the way in.
   */
  journal?: (entry: LogEntry) => void
}

/** Every port as the studio fills them. What is inert here says so where it is written. */
export function createStudioHost(deps: StudioHostDeps): GameApi {
  const log = createRingLog(deps.journal)

  return {
    assets: createHostedAssets(deps.urlForAsset),
    input: createDomInput(deps.input),
    render: deps.render ?? createInertRender(),
    animation: deps.animation ?? createInertAnimation(),
    physics: deps.physics ?? createInertPhysics(),
    script: deps.script ?? createInertScripts(),
    scenes: deps.scenes ?? createSingleScene(log),
    audio: deps.audio ?? createInertAudio(),
    log,
    ai: createRefusedAi(log),
    net: createSoloNet(deps.player),
  }
}
