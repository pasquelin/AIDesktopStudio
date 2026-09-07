import { refused, type ActionField, type ActionOutcome } from '@shared/domain/assistant'
import type { ComponentType } from '@shared/domain/component'
import { componentValueOf, descriptorOf, isComponentType } from '@shared/domain/componentRegistry'
import { attachComponent, detachComponent, setComponentField } from '@/engines/scene/commands'
import type { SceneNode } from '@/engines/scene/sceneState'
import { activeSceneId, useDocuments } from '@/stores/documents'
import { noSuchNode } from './sceneHandlers'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { ActionHandlers } from './actionHandler'
import { textOf } from './actionInputs'
import { nodeAimed } from './nodeAimed'

/**
 * What an object DOES while the game runs, driven from outside the window.
 *
 * Its own file from the first action, `sceneHandlers.ts` at 41,9 Ko being the warning: the game
 * families would double it, and nobody opens a file that size to add a component.
 *
 * 🛑 Every way of missing is told apart — the surface, the object, the type, the field, the
 * value. One refusal for all of them sent a model repairing what was not broken: a `component.setProperties`
 * on an object with no such component answered « already as asked », and attaching it was the one
 * thing that would have helped.
 */

type Aimed = { node: SceneNode; type: ComponentType; documentId: string }

function aim(input: Record<string, unknown>): Aimed | ActionOutcome {
  const documentId = activeSceneId(useDocuments.getState())
  if (documentId === null)
    return refused(
      'wrongSurface',
      'the document in front is no scene — documents.list answers what is open and of which kind, and document.activate brings a scene forward',
    )

  const named = textOf(input, 'nodeId') ?? ''
  const scene = sceneOf(useScenes.getState(), documentId)
  const node = nodeAimed(scene, named)
  if (!node) return refused('notFound', noSuchNode(named, scene.nodes))

  const type = textOf(input, 'type') ?? ''
  if (!isComponentType(type)) return refused('badInput', `no component type "${type}"`)

  return { node, type, documentId }
}

const missed = (aimed: Aimed | ActionOutcome): aimed is ActionOutcome => 'ok' in aimed

function runOn(
  aimed: Aimed,
  command: ReturnType<typeof attachComponent>,
  already = 'is already as asked',
): ActionOutcome {
  // A command the state refuses leaves the document untouched, and answering `ok` is what sent a
  // client re-sending the same call.
  if (command.refuses?.(sceneOf(useScenes.getState(), aimed.documentId))) {
    return refused('badInput', `"${aimed.node.name}" ${already}`)
  }

  useScenes.getState().runCommand(aimed.documentId, command)
  return { ok: true }
}

/** What a field takes, in the words a refusal needs: `mode (one of once, loop, pingPong)`. */
function describeComponentField(field: ActionField): string {
  const takes =
    field.kind === 'choice'
      ? `one of ${(field.options ?? []).join(', ')}`
      : field.kind === 'boolean'
        ? 'true or false'
        : field.kind === 'number' || field.kind === 'integer'
          ? [
              field.kind,
              field.min !== undefined ? `≥ ${field.min}` : '',
              field.max !== undefined ? `≤ ${field.max}` : '',
            ]
              .filter(Boolean)
              .join(' ')
          : 'text'
  return `${field.key} (${takes})`
}

export const GAME_HANDLERS: ActionHandlers = {
  'component.attach': input => {
    const aimed = aim(input)
    if (missed(aimed)) return aimed

    return runOn(
      aimed,
      attachComponent(aimed.node.id, aimed.type),
      `already carries a ${aimed.type}`,
    )
  },

  'component.detach': input => {
    const aimed = aim(input)
    if (missed(aimed)) return aimed

    return runOn(aimed, detachComponent(aimed.node.id, aimed.type), `carries no ${aimed.type}`)
  },

  'component.setProperties': input => {
    const aimed = aim(input)
    if (missed(aimed)) return aimed

    // Said before the field is read: a value written on a component the object has not got is a
    // component to ATTACH, not a field to correct.
    if (!(aimed.node.components ?? []).some(component => component.type === aimed.type)) {
      return refused('notFound', `"${aimed.node.name}" carries no ${aimed.type}`)
    }

    // The fields ride with the refusal: told only « no field », a model guessed fifteen names
    // for a Movement — direction, velocity, start — and never the four it has (60.3, 2026-09-06).
    const named = textOf(input, 'field') ?? ''
    const fields = descriptorOf(aimed.type).fields
    const field = fields.find(one => one.key === named)
    if (!field) {
      const takes = fields.map(describeComponentField).join(', ')
      return refused('badInput', `${aimed.type} has no field "${named}" — it has: ${takes}`)
    }

    const said = textOf(input, 'value') ?? ''
    const value = componentValueOf(field, said)
    if (value === null) {
      const takes = describeComponentField(field)
      return refused(
        'badInput',
        `"${said}" does not fit ${aimed.type}.${named}, which takes ${takes}`,
      )
    }

    return runOn(aimed, setComponentField(aimed.node.id, aimed.type, named, value))
  },
}
