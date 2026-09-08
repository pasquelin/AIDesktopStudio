import { localizedError } from '@shared/localizedError'
import {
  EXPORTED_GAME_FILE,
  exportedSceneNamed,
  type ExportedGame,
} from '@shared/domain/gameExport'
import { createBundledAssets } from '@game/host/bundledAssets'
import { createExportHost } from '@game/host/exportHost'
import { createRingLog } from '@game/host/ringLog'
import type { LogPort } from '@game/ports/logPort'
import { loadQuickjsScripts } from '@game/host/quickjsScripts'
import { loadJoltPhysics } from '@game/host/joltPhysics'
import type { AssetPort } from '@game/ports/assetPort'
import type { EntityPlacement, RenderPort } from '@game/ports/renderPort'
import type { AnimationPort } from '@game/ports/animationPort'
import type { ScriptModule } from '@game/ports/scriptPort'
import { createGameLoop } from '@game/runtime/gameLoop'
import { placementsOf } from '@game/runtime/placements'
import { sceneFromGltf } from '@/engines/scene/gltfDocument'
import { heightmapFromExr } from '@/engines/scene/heightmap'
import { animationFrames } from './frameDriver'
import { createSceneSwap } from './sceneSwap'
import { veilLift } from './veilLift'
import { createWebRender } from './webRender'
import { heightmapsOf } from './heightmapsOf'
import { worldFromScene } from './worldFromScene'
import { animatedNodesOf, graphNamed } from './animatedNodes'
import { graphSourcesOf } from '@/engines/scene/clipSources'
import type { ClipSource } from '@shared/domain/scene'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import type { SceneState } from '@/engines/scene/sceneState'
import type { World } from '@game/runtime/world'
import { secondsToUs } from '@shared/domain/time'
import { answering, exportedJson, exportedText } from './exportedResponse'
import { expandCompressedAssets, type ExpandedAssets } from './exportedAssets'
import { createStartupRollback, failStartup } from './startupRollback'
import { createInputControls, type InputControls } from '@game/runtime/inputControls'
import type { InputMap } from '@shared/domain/inputMap'
import { createInputControlsMenu } from '@game/host/inputControlsMenu'
import en from '@shared/i18n/en/game.json'
import fr from '@shared/i18n/fr/game.json'
/**
 * A game running in a browser page, with no studio anywhere.
 *
 * 🛑 The bundle's ONLY entry: `main/export-imports.test.ts` sweeps what it reaches, so React, the
 * stores and Electron cannot arrive here by a shortcut somebody took at three in the morning.
 */
export async function startExportedGame(canvas: HTMLCanvasElement): Promise<() => void> {
  const game = await exportedJson<ExportedGame>(EXPORTED_GAME_FILE)
  const inputControls = createInputControls(game.inputMaps ?? [], browserInputStorage())
  const expanded = await expandCompressedAssets(game.assets, game.compressedAssets ?? [])
  const rollback = createStartupRollback()
  rollback.add(expanded.dispose)
  installControlsMenu(canvas, inputControls, rollback)
  try {
    const { assets, render, drawn, swap, entry, log } = openStage(canvas, game, expanded, rollback)

    // 🛑 Together: awaited in turn, the page paid the SUM of two WebAssembly runtimes and two
    // fetches before its first frame. A sibling of a load that rejects goes undisposed — that
    // startup has already failed, and the page shows nothing.
    const [{ ports, modules }, openingSource] = await Promise.all([
      createPorts(canvas, game, assets, drawn.port, render.animation, swap.port, rollback, log),
      exportedJson<unknown>(entry.file, entry.compression),
    ])
    const runtime = runtimeOf(game, modules, inputControls)

    const openingScene = await createOpeningScene(entry, openingSource, assets, ports, runtime)
    const { opening, heightmaps } = openingScene
    let { world } = openingScene
    rollback.add(() => world.dispose())
    let loop = createGameLoop(world)
    let warmed = false
    let playing = entry.id
    let reading = false
    let stopped = false
    /** Seconds of veil the scene that has just arrived still owes. */
    let fading = 0
    await shown(render, game, opening, entry.optimization, heightmaps, runtime)

    /**
     * The scene a running game asked for, put on between two steps — as `playSession` does.
     *
     * 🛑 `settled` only once the file is HERE: settling before the fetch reopens the port for its
     * whole duration, and a trigger asking every step then runs a dozen loads at once, the last
     * one to answer winning.
     */
    async function swapIfAsked(): Promise<void> {
      const request = swap.pending()
      if (!request || reading) return

      // A scene naming itself would rebuild a world and a three.js scene every frame, for ever.
      const wanted = exportedSceneNamed(game, request.scene)
      if (!wanted || wanted.id === playing) {
        swap.settled()
        ports.log.write('warn', `"${request.scene}" is not a scene to go to from here`)
        return
      }

      reading = true
      try {
        const found = sceneFromGltf(await exportedJson<unknown>(wanted.file, wanted.compression))
        if (stopped) return

        world.events.emit({ name: 'SceneLoading', payload: { scene: wanted.id } })
        world.events.drain()
        world.dispose()
        playing = wanted.id
        const nextMaps = await heightmapsOf(found.world.layers, id =>
          heightmapFromBundle(assets, id),
        )
        world = worldOf(wanted.id, found, ports, runtime, nextMaps)
        loop = createGameLoop(world)
        // The first step of the arrived scene derives every collider — not a gap to catch up on.
        warmed = false
        // 🛑 BEFORE the build, which suspends for a scene that carves: frames run in that window,
        // stepping the arrived world over the picture of the one just left — and the veil would
        // lift onto it.
        fading = request.fade
        await render.show(
          found,
          wanted.optimization,
          game.modelAssets,
          nextMaps,
          clipsIn(found, runtime),
        )
        // A second suspension point, so a second look: the stop above threw this world away.
        if (stopped) return

        world.events.emit({ name: 'SceneLoaded', payload: { scene: wanted.id } })
      } finally {
        reading = false
        swap.settled()
      }
    }

    const placements: EntityPlacement[] = []
    const frames = animationFrames()

    frames.start(nowMs => {
      render.resize(canvas.clientWidth, canvas.clientHeight)
      if (loop.advance(nowMs / 1000) > 0 && !warmed) {
        warmed = true
        loop.reset()
      }
      // 🛑 Named and caught: a `game.json` pointing at a file nothing serves would otherwise kill
      // the page by `unhandledRejection`, and a game has no console anybody watches. Asked only
      // when there IS one: two promises a frame, for a request that is almost never there.
      if (swap.pending()) void asked()

      render.place(placementsOf(world, placements, loop.alpha()))
      render.seek(secondsToUs(world.time.elapsed))
      // The veil the arrived scene came in under, on ITS clock, which a swap restarts at zero.
      if (fading > 0) {
        const lift = veilLift(world.time.elapsed, fading, drawn.veiled())
        render.veil(lift.veil)
        if (lift.through) fading = 0
      }
      render.draw()
    })
    rollback.add(frames.stop)

    async function asked(): Promise<void> {
      try {
        await swapIfAsked()
      } catch (error) {
        ports.log.write('error', `scene load failed: ${String(error)}`)
      }
    }

    return () => {
      // 🛑 Told to the swap in flight too: its continuation would otherwise build a world on a
      // renderer, a physics and a sandbox this line has just thrown away.
      stopped = true
      rollback.dispose()
    }
  } catch (error) {
    failStartup(rollback, error)
  }
}

function installControlsMenu(
  canvas: HTMLCanvasElement,
  controls: InputControls,
  rollback: ReturnType<typeof createStartupRollback>,
): void {
  const language = globalThis.navigator.language.toLowerCase().startsWith('fr') ? fr : en
  const menu = createInputControlsMenu({
    owner: canvas.ownerDocument,
    controls,
    labels: language.game.controlsMenu,
  })
  rollback.add(menu.dispose)
}

/** Everything a game draws THROUGH, and the scene it opens on — nothing that runs yet. */
function openStage(
  canvas: HTMLCanvasElement,
  game: ExportedGame,
  expanded: ExpandedAssets,
  rollback: ReturnType<typeof createStartupRollback>,
) {
  const assets = createBundledAssets(expanded.files)
  // 🛑 The journal is opened HERE, before the ports: what the drawer has to say — a chain of
  // effects that will not build — happens on this side of the line, and one game keeps one.
  const log = createRingLog(printedForExport)
  const render = createWebRender(canvas, assets, game.render, log.write)
  rollback.add(render.dispose)
  const entry = exportedSceneNamed(game, game.entryScene)
  if (!entry) throw localizedError('gameSceneMissing', { name: game.entryScene })
  return { assets, render, log, drawn: createDrawnPort(render), swap: createSceneSwap(), entry }
}

function createDrawnPort(render: ReturnType<typeof createWebRender>): {
  port: RenderPort
  veiled: () => number
} {
  let veiled = 0
  return {
    port: {
      place: render.place,
      view: render.view,
      veil: amount => {
        veiled = amount
        render.veil(amount)
      },
    },
    veiled: () => veiled,
  }
}

async function createPorts(
  canvas: HTMLCanvasElement,
  game: ExportedGame,
  assets: ReturnType<typeof createBundledAssets>,
  render: RenderPort,
  animation: AnimationPort,
  scenes: ReturnType<typeof createSceneSwap>['port'],
  rollback: ReturnType<typeof createStartupRollback>,
  log: LogPort,
) {
  const [physics, script, modules] = await Promise.all([
    loadJoltPhysics(),
    loadQuickjsScripts(),
    modulesOf(game),
  ])
  rollback.add(physics.dispose)
  rollback.add(script.dispose)
  const ports = createExportHost({
    input: canvas,
    player: { id: 'local', name: 'Player', local: true },
    files: game.assets,
    assets,
    physics,
    script,
    render,
    animation,
    scenes,
    log,
  })
  rollback.add(() => {
    ports.input.detach()
    ports.audio.stopAll()
  })
  return { ports, modules }
}

async function createOpeningScene(
  entry: ExportedGame['scenes'][number],
  source: unknown,
  assets: ReturnType<typeof createBundledAssets>,
  ports: ReturnType<typeof createExportHost>,
  runtime: ReturnType<typeof runtimeOf>,
) {
  const opening = sceneFromGltf(source)
  const heightmaps = await heightmapsOf(opening.world.layers, id => heightmapFromBundle(assets, id))
  return { opening, world: worldOf(entry.id, opening, ports, runtime, heightmaps), heightmaps }
}

/** Every script of the game, already JavaScript: the studio transpiled them at export time. */
async function modulesOf(game: ExportedGame): Promise<readonly ScriptModule[]> {
  return await Promise.all(
    game.scripts.map(async one => ({
      script: one.script,
      code: await exportedText(one.file, one.compression),
    })),
  )
}
async function heightmapFromBundle(assets: AssetPort, assetId: string) {
  const url = assets.urlOf({ kind: 'asset', id: assetId })
  if (!url) throw localizedError('assetFileMissing', { name: assetId })
  return heightmapFromExr(await (await answering(url)).arrayBuffer())
}

function browserInputStorage() {
  const key = `input-controls:${globalThis.location.pathname}`
  return {
    read: (): unknown => {
      const value = globalThis.localStorage.getItem(key)
      return value === null ? null : JSON.parse(value)
    },
    write: (maps: readonly InputMap[]): void => {
      globalThis.localStorage.setItem(key, JSON.stringify(maps))
    },
  }
}

/** One world of this game, built the same way on the opening scene and on every swap. */
function worldOf(
  documentId: string,
  state: SceneState,
  ports: ReturnType<typeof createExportHost>,
  runtime: ReturnType<typeof runtimeOf>,
  heightmaps: ReadonlyMap<string, HeightmapSamples>,
): World {
  return worldFromScene(
    documentId,
    state,
    ports,
    runtime,
    1,
    heightmaps,
    runtime.inputMaps,
    runtime.inputControls,
    runtime.animationGraphs,
  )
}

/** What every world of this game is built from, named once rather than spelled at each build. */
function runtimeOf(
  game: ExportedGame,
  modules: readonly ScriptModule[],
  inputControls: InputControls,
) {
  return {
    modules,
    inputMaps: game.inputMaps ?? [],
    animationGraphs: game.animationGraphs ?? [],
    inputControls,
  }
}

/** One scene put on screen, with the clips its state machines need — the same call, twice. */
async function shown(
  render: ReturnType<typeof createWebRender>,
  game: ExportedGame,
  state: SceneState,
  optimization: ExportedGame['scenes'][number]['optimization'],
  heightmaps: ReadonlyMap<string, HeightmapSamples>,
  runtime: ReturnType<typeof runtimeOf>,
): Promise<void> {
  await render.show(state, optimization, game.modelAssets, heightmaps, clipsIn(state, runtime))
}

/**
 * What a state machine plays on each node of this scene, for whoever loads the files.
 *
 * 🛑 Every shipped clip a graph named became an asset of the bundle at export time — see
 * `bundledGraphs`. Nothing here resolves an `animation://`, which no exported page serves.
 */
function clipsIn(
  state: SceneState,
  runtime: ReturnType<typeof runtimeOf>,
): (nodeId: string) => readonly ClipSource[] {
  const sources = new Map(
    animatedNodesOf(state.nodes, graphNamed(runtime.animationGraphs)).map(one => [
      one.nodeId,
      graphSourcesOf(one.graph),
    ]),
  )

  return nodeId => sources.get(nodeId) ?? []
}

/** An exported game has no journal to send a line to: what a browser shows is all there is. */
function printedForExport(entry: { level: string; message: string }): void {
  if (entry.level === 'warn') console.warn(entry.message)
  if (entry.level === 'error') console.error(entry.message)
}
