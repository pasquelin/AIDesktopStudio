import { assetUrl } from '@shared/domain/asset'
import { clamp } from '@shared/numeric'
import {
  EMPTY_RUNTIME_PERFORMANCE,
  type PlayState,
  type RuntimeError,
  type RuntimeReport,
} from '@shared/domain/gameRuntime'
import type { DomInputTarget } from '@game/host/domInput'
import { createStudioHost } from '@game/host/studioHost'
import { refToString } from '@shared/domain/ref'
import type { AudioPort } from '@game/ports/audioPort'
import type { PhysicsPort } from '@game/ports/physicsPort'
import type { ScriptModule, ScriptPort } from '@game/ports/scriptPort'
import type { ScriptFault } from '@game/script/frame'
import type { ScriptTrouble } from '@/engines/code/scriptCompiler'
import type { EntityPlacement } from '@game/ports/renderPort'
import { createGameLoop } from '@game/runtime/gameLoop'
import { placementsOf } from '@game/runtime/placements'
import type { World } from '@game/runtime/world'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import type { SceneState } from '@/engines/scene/sceneState'
import type { FrameDriver } from './frameDriver'
import { createSceneSwap } from './sceneSwap'
import { createStudioAnimation, type SceneAnimate } from './studioAnimation'
import { graphClipsOf } from '@/engines/scene/clipSources'
import { animatedNodesOf, graphNamed, type AnimatedNode } from './animatedNodes'
import type { AnimationGraphModule } from '@shared/domain/animationGraph'
import { createStudioRender, type SceneDraw } from './studioRender'
import { veilLift } from './veilLift'
import { heightmapsOf } from './heightmapsOf'
import { worldFromScene } from './worldFromScene'
import type { InputMap } from '@shared/domain/inputMap'
import { createInputControls } from '@game/runtime/inputControls'
import { secondsToUs } from '@shared/domain/time'
/** How often the game says what it is doing. Six times a second, and that is a decision — see
 * `publish`. */
const REPORT_MS = 160
/** As many faults as the log keeps lines: enough to read one back, short enough to hold. */
const ERRORS_KEPT = 200
/**
 * How many steps ONE call may run. Two seconds of game at sixty a second — enough to watch a
 * fall land, short enough that a client cannot freeze the window by asking for a million.
 */
const MAX_STEPPED = 120
/** How long a scene may be « on its way » before the request is given up on. Five seconds. */
const GIVE_UP_FRAMES = 300
/**
 * The fault as something a reader can OPEN — the script by its own reference, the entity by the
 * one naming the document it lives in, which a node id alone does not.
 */
const addressed = (fault: ScriptFault, documentId: string): RuntimeError => ({
  script: fault.script,
  entity: fault.entity
    ? refToString({ kind: 'entity', document: documentId, id: fault.entity })
    : null,
  message: fault.message,
  line: fault.line,
  column: fault.column,
  at: Date.now(),
})

function sessionPerformance(
  deps: PlaySessionDeps,
  cpuFrameMs: number,
  renderMs: number,
): RuntimeReport['performance'] {
  const renderer = deps.renderer.runtimePerformance?.()
  return {
    ...EMPTY_RUNTIME_PERFORMANCE,
    ...renderer,
    cpuFrameMs,
    renderMs: renderer?.renderMs ?? renderMs,
    compilationMs: deps.compilationMs?.() ?? 0,
  }
}
export type PlaySession = {
  state: () => PlayState
  pause: () => void
  resume: () => void
  /**
   * Runs that many FIXED steps and draws once, whatever the clock says.
   *
   * 🛑 For whoever watches from outside — a model, a test — rather than for the game: a reading
   * taken while sixty frames a second run is a reading of a different world each time. Only
   * while PAUSED, so it never races the loop that is already stepping.
   */
  step: (steps: number) => number
  /** Drops the world and puts the viewport back on the edit state. Nothing to restore. */
  stop: () => void
  /** Which scene the game is IN — the document's until a load, another one after. */
  sceneNow: () => SceneState
  /** Asks for another scene, as a script would. Taken between two steps, like every request. */
  loadScene: (scene: string, fade: number) => void
}
export type PlaySessionDeps = {
  documentId: string
  renderer: SceneDraw
  /** The mixers a state machine writes through. Absent leaves every body in its rest pose. */
  animate?: SceneAnimate
  /** Read on every frame rather than captured: the document may be edited while a game runs. */
  editState: () => SceneState
  input: DomInputTarget
  onReport: (report: RuntimeReport) => void
  frames: FrameDriver
  /** What simulates. Absent leaves the game inert — nothing falls and nothing blocks. */
  physics?: PhysicsPort
  /** Where a game's own code runs. Absent leaves every script silent. */
  script?: ScriptPort
  /** Already transpiled by the studio: the sandbox runs JavaScript, an author writes TypeScript. */
  modules?: readonly ScriptModule[]
  /** What would not compile at all, said the way a fault is: the reader can OPEN it. */
  troubles?: readonly ScriptTrouble[]
  /** What sounds. Absent leaves a game silent — no mixer is wired to a Play yet. */
  audio?: AudioPort
  heightmaps?: ReadonlyMap<string, HeightmapSamples>
  /**
   * Another scene of the project, by the title or the id a game names it with.
   *
   * Three answers rather than two: a scene the project HOLDS but has not read yet is not a scene
   * it does not have. Absent holds the game to the scene it opened on.
   */
  sceneNamed?: (scene: string) => SceneLookup
  compilationMs?: () => number
  inputMaps?: readonly InputMap[]
  /** The state machines the project holds, by path. A module names none and walks off the preset. */
  animationGraphs?: readonly AnimationGraphModule[]
}
/**
 * What a project answers about a scene a game asked for.
 *
 * `document` is the id the name RESOLVED to: two names for one level must not read as two levels.
 */
export type SceneLookup =
  | {
      state: SceneState
      document: string
    }
  | 'reading'
  | 'unknown'
/**
 * A game running inside the studio.
 *
 * 🛑 The world holds no reference to the document store, so nothing it does can reach the scene
 * being edited. STOP therefore restores nothing — it redraws what was never touched.
 */
export function startPlay(deps: PlaySessionDeps): PlaySession {
  const inputControls = createInputControls(deps.inputMaps ?? [])
  let veiled = 0
  let loaded: SceneState | null = null
  let steered = false
  const sceneNow = (): SceneState => loaded ?? deps.editState()
  const startPlayStep1 = () => {
    const drawn: SceneDraw = {
      apply: state => deps.renderer.apply(state),
      applyRuntimeTransforms: placements =>
        deps.renderer.applyRuntimeTransforms?.(placements) ?? false,
      viewPlacement: () => deps.renderer.viewPlacement(),
      releaseView: () => deps.renderer.releaseView(),
      placeView: view => {
        steered = true
        deps.renderer.placeView(view)
      },
    }
    const render = createStudioRender(drawn, sceneNow, amount => {
      veiled = amount
    })
    const swap = createSceneSwap()
    const animation = createStudioAnimation(deps.animate)
    const graphOf = graphNamed(deps.animationGraphs ?? [])
    const animatedIn = (state: SceneState): AnimatedNode[] => animatedNodesOf(state.nodes, graphOf)
    const startPlayStep2 = () => {
      const ports = createStudioHost({
        input: deps.input,
        player: { id: 'local', name: 'Player', local: true },
        urlForAsset: assetUrl,
        render,
        animation,
        physics: deps.physics,
        script: deps.script,
        scenes: swap.port,
        audio: deps.audio,
      })
      if (!deps.physics) {
        ports.log.write('warn', 'no physics engine: nothing falls, nothing blocks, nobody walks')
      }
      const errors: RuntimeError[] = []
      const startPlayStep3 = () => {
        const noted = (fault: ScriptFault): void => {
          errors.push(addressed(fault, deps.documentId))
          if (errors.length > ERRORS_KEPT) errors.shift()
        }
        for (const trouble of deps.troubles ?? []) {
          noted({
            script: trouble.script,
            entity: null,
            message: trouble.message,
            line: trouble.line,
            column: 0,
          })
        }
        const heightmaps = new Map(deps.heightmaps ?? [])
        let pullingMaps = false
        const mapsReadyFor = (state: SceneState): boolean =>
          state.world.layers.every(
            layer => layer.kind !== 'relief' || heightmaps.has(layer.heightmap.assetId),
          )
        const pullMaps = async (state: SceneState): Promise<void> => {
          pullingMaps = true
          try {
            const loadedMaps = await heightmapsOf(state.world.layers)
            for (const [id, samples] of loadedMaps) heightmaps.set(id, samples)
          } finally {
            pullingMaps = false
          }
        }
        const build = (state: SceneState): World => {
          // 🛑 Before the first step: a state machine cannot loop, finish or place a footfall
          // without a length, and a length lives in the file.
          for (const one of animatedIn(state))
            deps.animate?.useGraphClips(one.nodeId, graphClipsOf(one.graph))

          return worldFromScene(
            deps.documentId,
            state,
            ports,
            { modules: deps.modules ?? [], onFault: noted },
            1,
            heightmaps,
            deps.inputMaps,
            inputControls,
            deps.animationGraphs,
          )
        }
        const startPlayStep4 = () => {
          let world = build(deps.editState())
          let loop = createGameLoop(world)
          const watching = deps.renderer.viewPlacement()
          const startPlayStep5 = () => {
            const placements: EntityPlacement[] = []
            let state: PlayState = 'playing'
            /** Seconds of veil a scene that has just arrived still owes. Zero when nothing is fading. */
            let fadeSpan = 0
            const startPlayStep6 = () => {
              /** The edit state as of the last repaint, so an edit of the document under a loaded scene shows. */
              let shown = deps.editState()
              /** Frames a request has waited on a file. Five seconds at sixty a second. */
              let waited = 0
              const startPlayStep7 = () => {
                /** Which document the game is playing. Its own until a load takes it somewhere else. */
                let playingDocument = deps.documentId
                let frameMs = 0
                let last: number | null = null
                let cpuFrameMs = 0
                let renderMs = 0
                const startPlayStep8 = () => {
                  let warmed = false
                  let said = Number.NEGATIVE_INFINITY
                  const publish = (): void =>
                    deps.onReport({
                      state,
                      tick: world.time.tick,
                      fps: frameMs > 0 ? 1000 / frameMs : 0,
                      frameMs,
                      entities: world.entities.count(),
                      logs: ports.log.recent(),
                      errors: [...errors],
                      veil: veiled,
                      performance: sessionPerformance(deps, cpuFrameMs, renderMs),
                    })
                  const startPlayStep9 = () => {
                    /**
                     * 🛑 Not on every frame. `onReport` writes into a store the panel subscribes to, so publishing at
                     * sixty hertz re-renders the transport — its four lookups, its formatter and its filter — on
                     * every frame of every game. Six times a second is faster than an eye reads a counter, and what
                     * CHANGES state says so at once through `publish`.
                     */
                    const publishIfDue = (nowMs: number): void => {
                      if (nowMs - said < REPORT_MS) return
                      said = nowMs
                      publish()
                    }
                    /** Between the two steps the frame falls between, which is what stops a 60 Hz picture juddering. */
                    let drawnUs = -1
                    const draw = (alpha: number): void => {
                      // 🛑 Before place: a still body makes `place` skip the apply, and a seek
                      // after a draw would pose bones the picture has already left behind.
                      // Not on a clock that has not moved: a pause would repose every model a frame.
                      const nowUs = secondsToUs(world.time.elapsed)
                      if (nowUs !== drawnUs) {
                        drawnUs = nowUs
                        deps.animate?.seekClips(nowUs)
                      }
                      world.ports.render.place(placementsOf(world, placements, alpha))
                    }
                    let liftVeil: () => void
                    const availableScene = (name: string): Exclude<SceneLookup, string> | null => {
                      const found = deps.sceneNamed?.(name) ?? 'unknown'
                      if (found === 'reading' && waited++ < GIVE_UP_FRAMES) return null
                      if (found === 'reading') {
                        waited = 0
                        swap.settled()
                        ports.log.write('warn', `scene "${name}" is taking too long to read`)
                        return null
                      }
                      if (found === 'unknown' || found.document === playingDocument) {
                        waited = 0
                        swap.settled()
                        const message =
                          found === 'unknown'
                            ? `no scene named "${name}" in this project`
                            : `"${name}" is already the scene being played`
                        ports.log.write('warn', message)
                        return null
                      }
                      return found
                    }
                    const mapsAvailable = (found: Exclude<SceneLookup, string>, name: string) => {
                      if (mapsReadyFor(found.state)) return true
                      if (!pullingMaps) {
                        waited = 0
                        void pullMaps(found.state)
                      }
                      if (waited++ < GIVE_UP_FRAMES) return false
                      ports.log.write('warn', `relief of "${name}" is taking too long to read`)
                      return true
                    }
                    /**
                     * The scene a running game asked for, put on between two steps.
                     *
                     * 🛑 The old world's systems give back what they took from the engines — bodies, voices,
                     * sandbox instances — which a STOP throws away with the engines and a swap must not.
                     */
                    const swapIfAsked = (): void => {
                      const request = swap.pending()
                      if (!request) return
                      const found = availableScene(request.scene)
                      if (!found || !mapsAvailable(found, request.scene)) return
                      waited = 0
                      swap.settled()
                      world.events.emit({ name: 'SceneLoading', payload: { scene: request.scene } })
                      world.events.drain()
                      world.dispose()
                      playingDocument = found.document
                      loaded = found.state
                      deps.renderer.apply(found.state)
                      shown = deps.editState()
                      world = build(found.state)
                      loop = createGameLoop(world)
                      warmed = false
                      world.events.emit({ name: 'SceneLoaded', payload: { scene: request.scene } })
                      fadeSpan = request.fade
                      if (fadeSpan > 0) liftVeil()
                      else render.veil(0)
                    }
                    const startPlayStep10 = () => {
                      /**
                       * 🛑 The viewport applies the DOCUMENT on any change of it — a click on a node is one — which
                       * over a game playing ANOTHER scene wipes it off the screen for good: nothing of the loaded
                       * scene changes, so nothing asks for a repaint.
                       */
                      const redrawIfEdited = (): void => {
                        if (loaded === null || deps.editState() === shown) return
                        shown = deps.editState()
                        deps.renderer.apply(loaded)
                      }
                      /**
                       * The veil coming back up on the scene that has just arrived.
                       *
                       * On the WORLD's clock, which a swap restarts at zero. Written AFTER the step, so a scene
                       * arriving under a fade owns the picture over its own timeline until it is through.
                       */
                      liftVeil = (): void => {
                        if (fadeSpan <= 0) return
                        const lift = veilLift(world.time.elapsed, fadeSpan, veiled)
                        render.veil(lift.veil)
                        if (lift.through) fadeSpan = 0
                      }
                      deps.frames.start(nowMs => {
                        const frameStarted = performance.now()
                        if (state === 'playing') {
                          if (last !== null)
                            frameMs =
                              frameMs === 0 ? nowMs - last : frameMs * 0.9 + (nowMs - last) * 0.1
                          last = nowMs
                          if (loop.advance(nowMs / 1000) > 0 && !warmed) {
                            warmed = true
                            loop.reset()
                          }
                          swapIfAsked()
                          redrawIfEdited()
                          liftVeil()
                        }
                        const renderStarted = performance.now()
                        draw(state === 'playing' ? loop.alpha() : 1)
                        renderMs = smooth(renderMs, performance.now() - renderStarted)
                        cpuFrameMs = smooth(cpuFrameMs, performance.now() - frameStarted)
                        publishIfDue(nowMs)
                      })
                      const startPlayStep11 = () => {
                        publish()
                        return {
                          state: () => state,
                          sceneNow,
                          loadScene: (scene: string, fade: number) => swap.port.load(scene, fade),
                          pause: () => {
                            if (state !== 'playing') return
                            state = 'paused'
                            last = null
                            publish()
                          },
                          step: (steps: number) => {
                            if (state !== 'paused') return 0
                            const ran = clamp(Math.trunc(steps), 1, MAX_STEPPED)
                            for (let at = 0; at < ran; at++) {
                              world.step(world.time.step)
                              swapIfAsked()
                              liftVeil()
                            }
                            world.lateUpdate(1, world.time.step * ran)
                            draw(1)
                            publish()
                            return ran
                          },
                          resume: () => {
                            if (state !== 'paused') return
                            state = 'playing'
                            loop.reset()
                            publish()
                          },
                          stop: () => {
                            said = Number.NEGATIVE_INFINITY
                            state = 'edit'
                            deps.frames.stop()
                            if (steered) deps.renderer.placeView(watching)
                            deps.renderer.releaseView()
                            world.events.clear()
                            ports.input.detach()
                            ports.audio.stopAll()
                            veiled = 0
                            ports.physics.dispose()
                            ports.script.dispose()
                            // 🛑 Before the repaint: a body still posed would be drawn in the
                            // pose the last step left him in, and no gate would say a word.
                            animation.releaseAll()
                            for (const one of animatedIn(sceneNow()))
                              deps.animate?.useGraphClips(one.nodeId, [])
                            deps.renderer.apply(deps.editState())
                            publish()
                          },
                        }
                      }
                      return startPlayStep11()
                    }
                    return startPlayStep10()
                  }
                  return startPlayStep9()
                }
                return startPlayStep8()
              }
              return startPlayStep7()
            }
            return startPlayStep6()
          }
          return startPlayStep5()
        }
        return startPlayStep4()
      }
      return startPlayStep3()
    }
    return startPlayStep2()
  }
  return startPlayStep1()
}

function smooth(previous: number, current: number): number {
  return previous === 0 ? current : previous * 0.9 + current * 0.1
}
