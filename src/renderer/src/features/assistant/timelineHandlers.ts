import { refused, type ActionOutcome } from '@shared/domain/assistant'
import {
  TIMELINE_TEMPLATES,
  type TimelineTemplate,
  type TransitionKind,
  TRANSITION_KINDS,
} from '@shared/domain/animation'
import { TIMELINE_LISTS } from '@shared/domain/gameActions'
import {
  addTimelineRow,
  removeTimelineRow,
  setTimelineTemplate,
} from '@/engines/scene/timelineCommands'
import { newId } from '@/helpers/ids'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { ActionHandlers } from './actionHandler'
import { numberOf, textOf } from './actionInputs'
import { mountedScene } from './sceneHandlerCore'

/**
 * What a timeline CUES, driven from outside the window.
 *
 * 🛑 One action for the four lists: what `what` MEANS is read by the list, exactly as
 * `component.setProperties` reads a value by what its descriptor declares. A model that had to tell four
 * schemas apart before asking for anything is a model that asks for nothing.
 */
export const TIMELINE_HANDLERS: ActionHandlers = {
  'timeline.addSceneCue': addSceneCue,

  'timeline.removeSceneCue': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const list = textOf(input, 'list') ?? ''
    if (!TIMELINE_LISTS.includes(list)) return refused('badInput', `no list "${list}"`)

    const id = textOf(input, 'id') ?? ''
    return runOrRefuse(open.documentId, removeTimelineRow(listOf(list), id), `no row "${id}"`)
  },

  'timeline.setPanelRows': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const template = textOf(input, 'template') ?? ''
    if (!TIMELINE_TEMPLATES.includes(template as TimelineTemplate)) {
      return refused('badInput', `no template "${template}"`)
    }
    return runOrRefuse(
      open.documentId,
      setTimelineTemplate(template as TimelineTemplate),
      'is already as asked',
    )
  },
}

function addSceneCue(input: Record<string, unknown>): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  const list = textOf(input, 'list') ?? ''
  if (!TIMELINE_LISTS.includes(list)) return refused('badInput', `no list "${list}"`)

  const at = numberOf(input, 'at') ?? 0
  if (!Number.isFinite(at) || at < 0) return refused('badInput', 'at must be a positive number')

  const what = textOf(input, 'what') ?? ''
  const duration = numberOf(input, 'duration') ?? 0
  const id = newId()

  if (list === 'events') return addEvent(open.documentId, input, id, at, what)
  if (list === 'transitions') return addTransition(open.documentId, input, id, at, what, duration)

  return addMedia(open.documentId, list, id, at, what, duration)
}

function addMedia(
  documentId: string,
  list: string,
  id: string,
  at: number,
  what: string,
  duration: number,
): ActionOutcome {
  if (what.length === 0) return refused('badInput', `${list} needs an asset`)
  if (duration <= 0) return refused('badInput', `${list} needs a duration`)
  useScenes.getState().runCommand(
    documentId,
    addTimelineRow(list === 'audio' ? 'audio' : 'video', {
      id,
      assetId: what,
      start: at,
      duration,
    }),
  )
  return { ok: true, data: { id } }
}

function addEvent(
  documentId: string,
  input: Record<string, unknown>,
  id: string,
  at: number,
  what: string,
): ActionOutcome {
  if (what.length === 0) return refused('badInput', 'an event needs a name')
  const entity = textOf(input, 'entity')
  useScenes
    .getState()
    .runCommand(
      documentId,
      addTimelineRow('events', { id, at, name: what, ...(entity ? { entity } : {}) }),
    )
  return { ok: true, data: { id } }
}

function addTransition(
  documentId: string,
  input: Record<string, unknown>,
  id: string,
  at: number,
  what: string,
  duration: number,
): ActionOutcome {
  if (!TRANSITION_KINDS.includes(what as TransitionKind))
    return refused('badInput', `no transition "${what}" — ${TRANSITION_KINDS.join(', ')}`)
  if (what !== 'cut' && duration <= 0) return refused('badInput', `a ${what} needs a duration`)

  const scene = textOf(input, 'scene') ?? ''
  useScenes.getState().runCommand(
    documentId,
    addTimelineRow('transitions', {
      id,
      at,
      kind: what as TransitionKind,
      duration,
      ...(scene.length > 0 ? { scene } : {}),
    }),
  )
  return { ok: true, data: { id } }
}

/** The list, narrowed — `TIMELINE_LISTS` is what a model chooses from, and it is plain text. */
const listOf = (list: string): 'events' | 'audio' | 'video' | 'transitions' =>
  list === 'events' || list === 'audio' || list === 'video' ? list : 'transitions'

/** A command the state refuses left the document untouched, and `ok` would send it again. */
function runOrRefuse(
  documentId: string,
  command: ReturnType<typeof setTimelineTemplate>,
  already: string,
): ActionOutcome {
  if (command.refuses?.(sceneOf(useScenes.getState(), documentId))) {
    return refused('badInput', already)
  }
  useScenes.getState().runCommand(documentId, command)
  return { ok: true }
}
