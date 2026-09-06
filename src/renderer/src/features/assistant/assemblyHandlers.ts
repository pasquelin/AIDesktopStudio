import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { prefabDocumentOf, prefabIdFor, withPrefab } from '@shared/domain/game'
import { refFromString, refToString } from '@shared/domain/ref'
import { isSceneTemplateId } from '@shared/domain/sceneTemplate'
import { addNodes } from '@/engines/scene/commands'
import { instancedNodes, prefabNodes } from '@/engines/scene/prefab'
import { layOutTemplate } from '@/engines/scene/templateCommands'
import type { SceneNode } from '@/engines/scene/sceneState'
import { getBridge } from '@/services/bridge'
import { newId } from '@/helpers/ids'
import { documentById, sceneDocumentNamed, useDocuments } from '@/stores/documents'
import { sceneOf, sceneStore, useScenes } from '@/stores/scenes'
import type { ActionHandlers } from './actionHandler'
import { numberOf, textOf } from './actionInputs'
import { mounted, NO_SCENE } from './sceneHandlers'
import { mountedScene } from './sceneHandlerCore'
import { messageOf } from '@shared/guards'

/** What puts a whole game together in one gesture — a template, or a prefab of the project. */
export const ASSEMBLY_HANDLERS: ActionHandlers = {
  'game.applyTemplate': async input => {
    const open = mountedScene()
    if ('ok' in open) return open

    // The choice field has already refused anything else, and names the three in doing so; this
    // is the narrowing TypeScript asks for, not a second gate.
    const wanted = textOf(input, 'template') ?? ''
    if (!isSceneTemplateId(wanted))
      return refused(
        'badInput',
        `no scene template "${wanted}" — the "template" field of this action lists the ones it takes`,
      )

    const { seedTemplateFiles } = await import('@/features/game/seedTemplateFiles')
    const seeded = await seedTemplateFiles(wanted)
    const before = open.state.nodes.length
    useScenes
      .getState()
      .runCommand(open.documentId, layOutTemplate(wanted, seeded.scripts, seeded.graph))
    // What was ADDED, as `prefab.instantiate` answers too: a scene's own total would have a
    // client reading « 52 objects » where 38 were laid down.
    return {
      ok: true,
      data: { template: wanted, nodes: (mounted()?.state.nodes.length ?? before) - before },
    }
  },

  'prefab.define': definePrefab,

  'prefab.instantiate': async input => {
    if (!mounted()) return refused('wrongSurface', NO_SCENE)

    const named = textOf(input, 'prefab') ?? ''
    const documentId = await prefabDocument(named)

    const read = await prefabRead(documentId)
    if ('refusal' in read) return read.refusal

    // Read AGAIN after the await: an MCP call is not user-driven, and a tab switched while the
    // disk answered would have the nodes land in the document that WAS in front.
    const open = mountedScene()
    if ('ok' in open) return open
    if (open.documentId === documentId) {
      return refused('badInput', `"${named}" is the scene in front: it cannot instance itself`)
    }

    const nodes = instancedNodes(read.nodes, {
      x: numberOf(input, 'positionX') ?? 0,
      y: numberOf(input, 'positionY') ?? 0,
      z: numberOf(input, 'positionZ') ?? 0,
    })
    if (nodes.length === 0) return refused('badInput', `"${named}" holds nothing to instance`)

    useScenes.getState().runCommand(open.documentId, addNodes(nodes))
    return { ok: true, data: { nodes: nodes.length } }
  },
}

async function definePrefab(input: Record<string, unknown>): Promise<ActionOutcome> {
  const named = textOf(input, 'name') ?? ''
  if (named.length === 0) return refused('badInput', 'a prefab needs a name')

  const wanted = textOf(input, 'document') ?? ''
  const documentId = wanted.length === 0 ? mounted()?.documentId : sceneDocumentNamed(wanted)
  if (!documentId) return refused('wrongSurface', 'no scene to name as a prefab')
  if (documentById(useDocuments.getState(), documentId)?.kind !== 'scene') {
    return refused('notFound', `no scene named "${wanted}"`)
  }

  const bridge = getBridge()
  if (!bridge) return refused('noBridge', 'this window is not connected to the studio process')

  try {
    const held = await bridge.game.read()
    if (held.trouble !== null) return refused('failed', `game.json is ${held.trouble}`)

    const id = prefabIdFor(held.game, named, documentId) ?? newId()
    const prefab = { id, name: named, document: documentId }
    await bridge.game.write(withPrefab(held.game, prefab))
    return { ok: true, data: { ...prefab, ref: refToString({ kind: 'prefab', id: prefab.id }) } }
  } catch (error) {
    return refused('failed', messageOf(error))
  }
}

/**
 * The nodes of a prefab: the OPEN tab's when there is one, the file otherwise.
 *
 * The tab is where edits land — reading the disk instead brings back a piece the author has just
 * deleted, and answers `notFound` for a document that is visibly open and never saved.
 */
async function prefabRead(
  documentId: string,
): Promise<{ nodes: readonly SceneNode[] } | { refusal: ReturnType<typeof refused> }> {
  if (sceneStore.hasState(useScenes.getState(), documentId)) {
    return { nodes: sceneOf(useScenes.getState(), documentId).nodes }
  }

  const bridge = getBridge()
  if (!bridge)
    return { refusal: refused('noBridge', 'this window is not connected to the studio process') }

  try {
    const file = await bridge.documents.read(documentId, 'scene')
    // `notFound` and not `badInput`: the caller's word was fine, the project holds no such file.
    return file ? { nodes: prefabNodes(file) } : { refusal: refused('notFound', documentId) }
  } catch (error) {
    // `failed`, never `badInput`: told its INPUT is wrong, a model rewrites the name and retries.
    return { refusal: refused('failed', `reading ${documentId}: ${messageOf(error)}`) }
  }
}

/**
 * Which document a prefab names — a `prefab:` reference through the manifest, or a title or id.
 *
 * 🛑 `ref.ts` says `game.prefabs` resolves a `prefab:` id, and `prefab.define` now fills it. A
 * reference the manifest does not hold falls back to a document id, which is what one written by
 * hand usually is.
 */
async function prefabDocument(named: string): Promise<string> {
  const ref = refFromString(named)
  if (ref?.kind !== 'prefab') return sceneDocumentNamed(named)

  try {
    const held = await getBridge()?.game.read()
    return (held && prefabDocumentOf(held.game, ref.id)) ?? ref.id
  } catch {
    // An unreadable manifest is the author's to repair; a prefab named by its id still resolves.
    return ref.id
  }
}
