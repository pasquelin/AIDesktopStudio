import type { SceneAnimate } from './studioAnimation'
import type { AnimationGraphModule } from '@shared/domain/animationGraph'
import type { DomInputTarget } from '@game/host/domInput'
import type { ScriptModule } from '@game/ports/scriptPort'
import type { ScriptTrouble } from '@/engines/code/scriptCompiler'
import type { RuntimeReport } from '@shared/domain/gameRuntime'
import type { SceneState } from '@/engines/scene/sceneState'
import { gameMessageOf, openGameChannel, type GameCommand } from './gameChannel'
import { startGame } from './gameHost'
import type { PlaySession, SceneLookup } from './playSession'
import type { SceneDraw } from './studioRender'
import {
  createRuntimeWorldCompiler,
  worldWithRuntimePatch,
} from '@/engines/scene/runtimeWorldCompiler'
import type { InputMap } from '@shared/domain/inputMap'

export type GameStageDeps = {
  /** What draws. The game window's own engine — a WebGL context never crosses a window. */
  renderer: SceneDraw
  /**
   * The mixers a state machine writes through. Absent, every body stands in its rest pose and the
   * game plays on — a host with no viewport of its own has none.
   */
  animate?: SceneAnimate
  /** What the keyboard and the pointer are read off. The window itself, where there is one. */
  input: DomInputTarget
  /** Told what is playing, so a window can title itself and draw its own debug drawer. */
  onReport?: (report: RuntimeReport | null) => void
}

export type GameStage = { close: () => void }

/**
 * Where a game actually runs: the channel end that OWNS the session. Not a hook, and that is why
 * it exists — `pnpm banc` has no window, and mounts this on a stub renderer. One transport, two
 * callers, so what a Play speaks is measured rather than replaced.
 */
export function createGameStage(deps: GameStageDeps): GameStage {
  const channel = openGameChannel()
  const compiler = createRuntimeWorldCompiler()

  let session: PlaySession | null = null
  let documentId: string | null = null
  let scene: SceneState | null = null
  let authoring: SceneState | null = null
  let modules: readonly ScriptModule[] = []
  let troubles: readonly ScriptTrouble[] = []
  let inputMaps: readonly InputMap[] = []
  let animationGraphs: readonly AnimationGraphModule[] = []
  let compilationMs = 0
  /** Scenes the studio has answered for, by the name the game asked with. */
  const known = new Map<string, SceneLookup>()
  /** Guards a start against the `play` that overtook it while the engines were landing. */
  let generation = 0

  const report = (one: RuntimeReport): void => {
    if (documentId) channel.postMessage({ kind: 'report', documentId, report: one })
    deps.onReport?.(one)
  }

  const sceneNamed = (name: string): SceneLookup => {
    const held = known.get(name)
    if (held) return held
    // Asked once, and `reading` until the answer lands — the value `startPlay` already waits on.
    known.set(name, 'reading')
    channel.postMessage({ kind: 'want', scene: name })
    return 'reading'
  }

  const drop = (): void => {
    generation += 1
    session?.stop()
    session = null
    documentId = null
    scene = null
    authoring = null
    known.clear()
    compiler.clearOptimizationCache()
    deps.onReport?.(null)
  }

  const begin = async (token: number): Promise<void> => {
    const held = scene
    const id = documentId
    if (!held || !id) return

    const started = await startGame({
      documentId: id,
      renderer: deps.renderer,
      animate: deps.animate,
      // The LATEST published state, never the one captured here: the studio keeps editing.
      editState: () => scene ?? held,
      input: deps.input,
      modules,
      troubles,
      sceneNamed,
      onReport: report,
      compilationMs: () => compilationMs,
      inputMaps,
      animationGraphs,
    })

    // Overtaken by a later Play, or stopped while the engines were landing.
    if (generation !== token) {
      started.stop()
      return
    }
    session = started
  }

  const runCommand = (command: GameCommand): { ok: boolean; ran: number } => {
    if (!session) return { ok: false, ran: 0 }
    if (command.name === 'step') return { ok: true, ran: session.step(command.steps) }

    if (command.name === 'pause') session.pause()
    else if (command.name === 'resume') session.resume()
    else if (command.name === 'loadScene') session.loadScene(command.scene, command.fade)
    else drop()

    return { ok: true, ran: 0 }
  }

  function handleMessage(event: MessageEvent<unknown>): void {
    const message = gameMessageOf(event.data)
    if (!message) return
    if (message.kind === 'play') {
      handlePlay(message)
      return
    }
    if (message.kind === 'clearOptimization') {
      handleClearOptimization(message.documentId)
      return
    }
    if (message.kind === 'edit') {
      handleEdit(message.documentId, message.patch)
      return
    }
    if (message.kind === 'scene') {
      known.set(message.scene, compiledLookup(message.found))
      return
    }

    if (message.kind === 'command') {
      const answer = runCommand(message.command)
      channel.postMessage({ kind: 'done', id: message.id, ...answer })
      return
    }

    if (message.kind === 'gone') drop()
  }

  function handlePlay(
    message: Extract<NonNullable<ReturnType<typeof gameMessageOf>>, { kind: 'play' }>,
  ): void {
    drop()
    documentId = message.documentId
    authoring = message.scene
    scene = compiler.compileRuntimeWorld(authoring)
    compilationMs = compiler.getOptimizationReport().compilationMs
    modules = message.modules
    troubles = message.troubles
    inputMaps = message.inputMaps
    animationGraphs = message.animationGraphs
    deps.renderer.apply(scene)
    void begin(generation)
  }

  function handleClearOptimization(id: string): void {
    if (id !== documentId || !authoring) return
    compiler.clearOptimizationCache()
    // A fresh REFERENCE is all this needs — `SceneRenderer` skips what compares equal by identity.
    // A deep clone copied the whole scene state, instance transforms included.
    scene = compiler.compileRuntimeWorld({
      ...authoring,
      nodes: authoring.nodes.map(node => ({ ...node })),
    })
    compilationMs = compiler.getOptimizationReport().compilationMs
    deps.renderer.apply(scene)
  }

  function handleEdit(id: string, patch: Parameters<typeof worldWithRuntimePatch>[1]): void {
    if (id !== documentId) return
    if (authoring) authoring = worldWithRuntimePatch(authoring, patch)
    const compiled = compiler.compileRuntimeRegion(patch)
    if (!compiled) return
    scene = compiled
    compilationMs = compiler.getOptimizationReport().compilationMs
    deps.renderer.apply(scene)
  }
  channel.onmessage = handleMessage

  // The window opens long after the studio pressed Play, and a channel replays nothing.
  channel.postMessage({ kind: 'ask' })

  return {
    close: () => {
      drop()
      channel.close()
    },
  }
}

/**
 * A scene looked up for a REFERENCE, never the one being played. Its own compilation time is not
 * reported: `compilationMs` names what the player is standing in, and writing another scene's
 * figure there made the panel read a number from somewhere nobody was.
 */
function compiledLookup(found: SceneLookup): SceneLookup {
  if (found === 'reading' || found === 'unknown') return found
  return { ...found, state: createRuntimeWorldCompiler().compileRuntimeWorld(found.state) }
}
