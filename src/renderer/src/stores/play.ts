import { create } from 'zustand'
import { NOT_PLAYING, type RuntimeReport } from '@shared/domain/gameRuntime'
import { orElse } from '@shared/promises'
import type { ScriptModule } from '@game/ports/scriptPort'
import type { InputMap } from '@shared/domain/inputMap'
import {
  createScriptCompiler,
  type ScriptCompiler,
  type ScriptTrouble,
} from '@/engines/code/scriptCompiler'
import { withoutKey } from '@shared/collections'
import { gameMessageOf, openGameChannel, type GameCommand } from '@/game/gameChannel'
import type { SceneLookup } from '@/game/playSession'
import { getBridge } from '@/services/bridge'
import type { SceneState } from '@/engines/scene/sceneState'
import { runtimeWorldPatch, runtimeWorldPatchIsEmpty } from '@/engines/scene/runtimeWorldCompiler'
import { codeFilesOf, useCode } from './code'
import { documentById, sceneDocumentNamed, useDocuments } from './documents'
import { sceneEngineOf } from './sceneEngines'
import { loadSceneSource, montageSceneOf } from './sceneSources'
import { sceneOf, useScenes } from './scenes'
import {
  inputMapIdConflict,
  projectInputMaps,
  withoutDuplicateInputMapIds,
} from '@/engines/code/projectInputMaps'
import { projectAnimationGraphs } from '@/engines/code/projectAnimationGraphs'
import type { AnimationGraphModule } from '@shared/domain/animationGraph'
import i18next from 'i18next'

/** How long a command may wait on the game window. A `step` runs up to 120 fixed steps there. */
const COMMAND_MS = 2_000

export type PlayStoreState = {
  /** What each document's game says about itself. A document that is not playing has none. */
  reports: Record<string, RuntimeReport>
  /**
   * Opens the game window on that scene, or turns the open one towards it. 🛑 Answers AT ONCE:
   * the window, the WebAssembly and the first frame are all behind it.
   */
  start: (documentId: string) => void
  /** Whether there WAS a game to pause — the game window's own answer, not a guess. */
  pause: (documentId: string) => Promise<boolean>
  resume: (documentId: string) => Promise<boolean>
  /** Runs that many fixed steps on a PAUSED game and answers how many ran. */
  step: (documentId: string, steps: number) => Promise<number>
  /** Sends a running game to another scene. Whether there WAS one to send. */
  loadScene: (documentId: string, scene: string, fade: number) => Promise<boolean>
  stop: (documentId: string) => void
}

/**
 * The game runs in the window `openGameWindow` opens, which owns the only engine that may draw
 * it. What lives here is the studio half: what plays, what it reports, what is asked of it.
 */
let channel: BroadcastChannel | null = null
/** Which document the game window is playing, as far as this window asked. */
let playing: string | null = null
/** What was last published, so a window that opens late can be answered when it asks. */
let published: PublishedGame | null = null
/** Commands sent and not yet answered, by the id their answer quotes. */
const waiting = new Map<number, (answer: CommandAnswer) => void>()
let lastCommand = 0
/** Given back when the game stops: the studio publishes every edit made under a running game. */
let stopWatchingScene: (() => void) | null = null

type CommandAnswer = { ok: boolean; ran: number }

type PublishedGame = {
  documentId: string
  modules: readonly ScriptModule[]
  troubles: readonly ScriptTrouble[]
  inputMaps: readonly InputMap[]
  animationGraphs: readonly AnimationGraphModule[]
}

export const usePlay = create<PlayStoreState>()(() => ({
  reports: {},

  start: documentId => {
    // The runtime draws a scene the studio is showing: with no viewport there is nothing to play.
    if (playing === documentId || !sceneEngineOf(documentId)) return

    // 🛑 One window, one game: a Play on another scene REPLACES the one running, so the transport
    // of the scene it replaced has to stop saying it is playing.
    if (playing) forget(playing)
    playing = documentId
    void begin(documentId)
  },

  pause: async documentId => (await command(documentId, { name: 'pause' })).ok,
  resume: async documentId => (await command(documentId, { name: 'resume' })).ok,
  step: async (documentId, steps) => (await command(documentId, { name: 'step', steps })).ran,
  loadScene: async (documentId, scene, fade) =>
    (await command(documentId, { name: 'loadScene', scene, fade })).ok,

  stop: documentId => {
    // 🛑 The command first, and the window after: a stage running WITHOUT a window — the bench —
    // has a session to end that closing nothing would leave running.
    if (playing === documentId) {
      channel?.postMessage({ kind: 'command', id: ++lastCommand, command: { name: 'stop' } })
      void closeGame()
    }
    forget(documentId)
  },
}))

/** Shared by a Stop and by the window going away on its own — see `watchTheGameWindow`. */
function forget(documentId: string): void {
  if (playing === documentId) {
    playing = null
    published = null
    stopWatchingScene?.()
    stopWatchingScene = null
  }
  // Guarded: every viewport teardown calls this, playing or not, and an unconditional write would
  // re-render every subscriber for a document that was never played.
  usePlay.setState(state =>
    documentId in state.reports ? { reports: withoutKey(state.reports, documentId) } : state,
  )
}

async function closeGame(): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return
  // Swallowed with a reason: closing a window that has already gone is not a failure to report.
  try {
    await bridge.gameWindow.close()
  } catch {
    /* the window was already gone */
  }
}

/**
 * 🛑 Compiles HERE and never in the game window: what a Play runs has to be the text on screen,
 * and the unsaved source of an open script lives in this window's store alone.
 */
async function begin(documentId: string): Promise<void> {
  const compiled = await orElse(compiledScripts(), NO_SCRIPTS)
  // Stopped, or overtaken by a Play on another document, while the scripts were compiling.
  if (playing !== documentId) return

  // 🛑 The scenes this one goes TO, read while the window is opening: a fade that has to wait for
  // a file is a fade that stalls on black, and the timeline names them in advance.
  for (const scene of scenesAhead(sceneOf(useScenes.getState(), documentId))) sceneNamed(scene)

  published = {
    documentId,
    modules: compiled.modules,
    troubles: compiled.troubles,
    inputMaps: compiled.inputMaps,
    animationGraphs: compiled.animationGraphs,
  }
  publishGame()
  watchTheScene(documentId)

  const bridge = getBridge()
  if (!bridge) return
  // Swallowed with a reason: a window the main process refused to open leaves the transport where
  // it was, and the refusal is already in the journal.
  try {
    await bridge.gameWindow.open()
  } catch {
    /* the journal has the reason */
  }
}

function publishGame(): void {
  if (!published) return
  wire().postMessage({
    kind: 'play',
    documentId: published.documentId,
    scene: sceneOf(useScenes.getState(), published.documentId),
    modules: published.modules,
    troubles: published.troubles,
    inputMaps: published.inputMaps,
    animationGraphs: published.animationGraphs,
  })
}

/** Every edit under a running game: `createStudioRender` reads the edit state on every frame. */
function watchTheScene(documentId: string): void {
  stopWatchingScene?.()
  let shown: SceneState = sceneOf(useScenes.getState(), documentId)
  stopWatchingScene = useScenes.subscribe(state => {
    const scene = sceneOf(state, documentId)
    if (scene === shown) return
    const patch = runtimeWorldPatch(shown, scene)
    shown = scene
    if (!runtimeWorldPatchIsEmpty(patch)) wire().postMessage({ kind: 'edit', documentId, patch })
  })
}

/** The channel, opened on the first game and kept: the window may ask for the game at any time. */
function wire(): BroadcastChannel {
  if (channel) return channel

  const opened = openGameChannel()
  opened.onmessage = event => {
    const message = gameMessageOf(event.data)
    if (!message) return

    if (message.kind === 'ask') {
      publishGame()
      return
    }
    if (message.kind === 'report') {
      // 🛑 Only for the game this window ASKED for: a session ending publishes one last report,
      // which lands after the stop that caused it and would put a forgotten document back on the
      // transport — reading `edit` where there is nothing at all.
      if (message.documentId !== playing) return
      usePlay.setState(state => ({
        reports: { ...state.reports, [message.documentId]: message.report },
      }))
      return
    }
    if (message.kind === 'want') {
      opened.postMessage({ kind: 'scene', scene: message.scene, found: sceneNamed(message.scene) })
      return
    }
    if (message.kind === 'done') {
      waiting.get(message.id)?.({ ok: message.ok, ran: message.ran })
      waiting.delete(message.id)
    }
  }

  channel = opened
  watchTheGameWindow()
  return opened
}

/**
 * 🛑 The MAIN process's fact, never a message from its renderer: a window being torn down has no
 * turn left in which to publish, and the transport must go back to Play at once.
 */
function watchTheGameWindow(): void {
  getBridge()?.gameWindow.onClosed(() => {
    const held = playing
    if (held) forget(held)
  })
}

/**
 * Asks the game window to do something. 🛑 Bounded rather than open: a window that went away
 * answers nothing, and an MCP client hung on `play.pause` is what this family exists to avoid.
 */
function command(documentId: string, asked: GameCommand): Promise<CommandAnswer> {
  if (playing !== documentId || !channel) return Promise.resolve(NOT_ANSWERED)

  const id = ++lastCommand
  return new Promise<CommandAnswer>(resolve => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      resolve(NOT_ANSWERED)
    }, COMMAND_MS)

    waiting.set(id, answer => {
      clearTimeout(timer)
      resolve(answer)
    })
    channel?.postMessage({ kind: 'command', id, command: asked })
  })
}

const NOT_ANSWERED: CommandAnswer = { ok: false, ran: 0 }

/**
 * 🛑 The COMPILER is kept for the window, not the modules: a Play must not parse nine megabytes of
 * TypeScript again for a file nobody touched, and a file that WAS touched has to be read again.
 */
let compiler: ScriptCompiler | null = null

type CompiledScripts = {
  modules: readonly ScriptModule[]
  troubles: readonly ScriptTrouble[]
  inputMaps: readonly InputMap[]
  animationGraphs: readonly AnimationGraphModule[]
}

const NO_SCRIPTS: CompiledScripts = {
  modules: [],
  troubles: [],
  inputMaps: [],
  animationGraphs: [],
}

/**
 * Whether that text would compile, said the way a fault is — or nothing when it would.
 *
 * 🛑 Through the WORKER, never `transpile` in place: the compiler is nine megabytes of parsing
 * and the thread it runs on is the one that draws — invariant 6. The digest cache is the same
 * one a Play reads, so what is checked here is not parsed again a moment later.
 */
export async function scriptTrouble(script: string, source: string): Promise<ScriptTrouble | null> {
  compiler ??= createScriptCompiler()
  // The same maps a Play is handed, duplicates dropped — or the squiggle in the editor answers
  // for a set of contexts the game will never see.
  const maps = withoutDuplicateInputMapIds(await projectInputMaps())
  return (await compiler.compile([{ script, source }], maps)).troubles[0] ?? null
}

/**
 * Every script of the project, transpiled once. Shared with the EXPORT, which needs the same
 * thing: a compiler built per call leaks a worker and repays nine megabytes of parsing.
 */
export async function compiledScripts(): Promise<CompiledScripts> {
  // 🛑 Through the EDITOR's own reading, never a second walk of the disk: what a Play compiles
  // has to be what the screen shows, or an author watches the script from before their last
  // keystroke run — without a word.
  const [, allMaps, animationGraphs] = await Promise.all([
    useCode.getState().reload(),
    projectInputMaps(),
    projectAnimationGraphs(),
  ])
  const conflict = inputMapIdConflict(allMaps)
  // 🛑 SAID, never fatal: a duplicate id used to drop every script of the project, so a fifty-file
  // game lost all fifty for one map in double. `line: 0` because the offender is a `.input.json`
  // and `openScriptAt` opens scripts alone — an addressable fault that opens nothing is worse.
  const troubles: readonly ScriptTrouble[] = conflict
    ? [
        {
          script: conflict.path,
          message: i18next.t('game.inputMap.duplicateId', { id: conflict.map.id }),
          line: 0,
        },
      ]
    : []
  const inputMaps = withoutDuplicateInputMapIds(allMaps)
  const files = codeFilesOf(useCode.getState())
  const runtimeMaps = inputMaps.map(input => input.map)
  if (files.length === 0)
    return { ...NO_SCRIPTS, troubles, inputMaps: runtimeMaps, animationGraphs }

  compiler ??= createScriptCompiler()
  const compiled = await compiler.compile(
    files.map(file => ({ script: file.script, source: file.source })),
    inputMaps,
  )
  // The conflict FIRST: it is the cause, and what compiled after it is the consequence.
  return {
    ...compiled,
    troubles: [...troubles, ...compiled.troubles],
    inputMaps: runtimeMaps,
    animationGraphs,
  }
}

/** What a document's game says about itself, or the still report — never `undefined` on screen. */
export function playReportOf(state: PlayStoreState, documentId: string): RuntimeReport {
  return state.reports[documentId] ?? NOT_PLAYING
}

/**
 * Another scene of the project, by the title a game names it with or by its id.
 *
 * 🛑 The open TAB wins when there is one: reading the disk alone would load the level as it was
 * before the author's last save.
 */
function sceneNamed(scene: string): SceneLookup {
  const documentId = sceneDocumentNamed(scene)
  const copy = montageSceneOf(documentId)
  if (copy) return { state: copy, document: documentId }

  // The project holds no SCENE under that name: a name to repair, not a file to wait for.
  if (documentById(useDocuments.getState(), documentId)?.kind !== 'scene') return 'unknown'

  void loadSceneSource(documentId)
  return 'reading'
}

/** Which other scenes this one's timeline goes to. What a Play reads ahead of being asked. */
function scenesAhead(state: SceneState): readonly string[] {
  const named = (state.animation.transitions ?? []).flatMap(one => one.scene ?? [])
  return [...new Set(named)]
}

export function startOrResumePlay(documentId: string): void {
  const store = usePlay.getState()
  const report = playReportOf(store, documentId)
  if (report.state === 'paused') void store.resume(documentId)
  else if (report.state === 'edit') store.start(documentId)
}
