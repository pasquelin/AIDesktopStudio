import { englishText, textAt, TRANSLATIONS } from '@shared/i18n'
import {
  refused,
  type ActionField,
  type ActionName,
  type ActionOutcome,
} from '@shared/domain/assistant'
import { COMPONENTS, COMPONENT_TYPES, descriptorOf } from '@shared/domain/componentRegistry'
import { isComponentType } from '@shared/domain/componentRegistry'
import { resolveNamedReference } from '@shared/domain/namedReference'
import { refFromString } from '@shared/domain/ref'
import STUDIO_TYPES from '@game/api/studio.d.ts?raw'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import { usToSeconds } from '@shared/domain/time'
import type { AnimationTrack } from '@shared/domain/animation'
import { mounted } from './sceneHandlers'
import { studioSnapshot } from './stateHandlers'
import type { ActionHandlers } from './actionHandler'
import { textOf } from './actionInputs'
import { nodeAimed } from './nodeAimed'
import type { SceneNode, SceneState } from '@/engines/scene/sceneState'

/** The handlers of `STUDIO_ACTIONS`, which says why there are three of them. */
export const STUDIO_HANDLERS: ActionHandlers = {
  'studio.describe': input => {
    const open = mounted()
    // The studio itself when no scene is in front — refused as « no surface » at start-up, a
    // client asking what it was talking to learnt nothing (Codex by MCP, 2026-09-06).
    if (!open) return describedStudio()

    const named = textOf(input, 'ref') ?? ''
    const scene = open.state
    if (named.length === 0) {
      return {
        ok: true,
        data: {
          scene: open.documentId,
          nodes: scene.nodes.map(node => ({ id: node.id, name: node.name, type: node.type })),
          available: { components: COMPONENT_TYPES },
        },
      }
    }

    // 🛑 A reference naming ANOTHER document is refused rather than answered off the scene in
    // front: a confident answer about the wrong object is worse than no answer.
    const ref = refFromString(named)
    if (ref?.kind === 'entity' && ref.document !== open.documentId) {
      return refused('notFound', `"${named}" belongs to another document`)
    }
    const track = scene.animation.tracks.find(one => one.id === named)
    if (track) return { ok: true, data: describedTrack(track) }
    const node = nodeAimed(scene, ref?.kind === 'entity' ? ref.id : named)
    if (!node)
      return refused(
        'notFound',
        `no node "${named}" in the scene in front, by id or name — a node id, a node name or a channel id (track_…) is what this takes`,
      )
    return { ok: true, data: describedNode(node, scene) }
  },

  'studio.docs': input => {
    const topic = (textOf(input, 'topic') ?? '').trim()
    if (topic.length === 0) {
      return { ok: true, data: { topics: [...COMPONENT_TYPES, 'script'] } }
    }
    const resolved = resolveNamedReference(
      topic,
      [...COMPONENT_TYPES, 'script'],
      candidate => candidate,
      candidate =>
        isComponentType(candidate)
          ? [
              textAt(TRANSLATIONS.en, COMPONENTS[candidate].titleKey),
              textAt(TRANSLATIONS.fr, COMPONENTS[candidate].titleKey),
            ]
          : [],
    )
    if (resolved.kind === 'ambiguous') {
      return refused(
        'badInput',
        `topic "${topic}" is ambiguous — use one of: ${resolved.values.join(', ')}`,
      )
    }
    if (resolved.kind === 'missing') {
      return refused('notFound', `no topic "${topic}" — ask with no topic for the list`)
    }
    // The editor's API declaration is served verbatim, never retold in a second contract.
    if (resolved.value === 'script')
      return { ok: true, data: { topic: resolved.value, docs: STUDIO_TYPES } }
    if (!isComponentType(resolved.value))
      return refused('notFound', `no topic "${topic}" — ask with no topic for the list`)
    // 🛑 Resolved, never the KEYS: an action whose trade is to document serves sentences, and
    // `mcpTools` already puts every description through `englishText` for the same reason.
    const held = COMPONENTS[resolved.value]
    return {
      ok: true,
      data: {
        topic: resolved.value,
        title: englishText(held.titleKey),
        description: englishText(held.descriptionKey),
        fields: held.fields.map(describeField),
      },
    }
  },
}

function describedNode(node: SceneNode, scene: SceneState): Record<string, unknown> {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    transform: node.transform,
    components: (node.components ?? []).map(component => ({
      type: component.type,
      properties: component,
      fields: isComponentType(component.type)
        ? descriptorOf(component.type).fields.map(describeField)
        : [],
    })),
    relations: {
      parent: node.parentId ?? null,
      children: scene.nodes.filter(one => one.parentId === node.id).map(one => one.id),
    },
    available: {
      components: COMPONENT_TYPES.filter(
        type => !(node.components ?? []).some(one => one.type === type),
      ),
    },
  }
}

/** One field as a model reads it: the label resolved, and the bounds it must respect. */
const describeField = (field: ActionField): Record<string, unknown> => ({
  key: field.key,
  kind: field.kind,
  label: englishText(field.labelKey),
  required: field.required,
  ...(field.options ? { options: field.options } : {}),
  ...(field.min === undefined ? {} : { min: field.min }),
  ...(field.max === undefined ? {} : { max: field.max }),
})

function describedStudio(): ActionOutcome {
  return { ok: true, data: { ...studioSnapshot(), workspaces: WORKSPACE_IDS } }
}

/** A channel and what takes it: keys are read here, and written by the key actions below. */
function describedTrack(track: AnimationTrack) {
  return {
    channel: {
      id: track.id,
      name: track.name,
      target: track.target,
      muted: track.muted,
      solo: track.solo,
      locked: track.locked,
      keys: track.keys.map(key => ({ timeSeconds: usToSeconds(key.time), value: key.value })),
    },
    accepts: [
      'key.writeKeysOnOpenChannels',
      'key.move',
      'track.rename',
      'track.remove',
      'track.setMuteSoloLockHeight',
    ] satisfies readonly ActionName[],
  }
}
