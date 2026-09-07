import { editRetargetRig } from '../editRetargetRig'
import { registerRetargetHost } from '@/character/retargetHosts'
import { useProject } from '@/stores/project'
import { useSkeletonProfiles, skeletonProfilesOf } from '@/stores/skeletonProfiles'
import { useEffect } from 'react'
import { characterOf, characterStore, useCharacters } from '@/stores/character'
import { assetsById, useAssets } from '@/stores/assets'
import { saveCharacterMotion } from '@/character/characterMotion'
import { getBridge } from '@/services/bridge'
import {
  openRetargetChannel,
  retargetMessageOf,
  type RetargetSnapshot,
  type RetargetMessage,
} from '../retargetChannel'

/** The session is the character itself: a window it left behind greets the next opening. */
export function useRetargetHost(assetId: string): () => Promise<void> {
  const open = async () => {
    await getBridge()?.retargetWindow.open(assetId)
  }
  useEffect(() => {
    if (!assetId) return
    const unregister = registerRetargetHost(assetId, open)
    const channel = openRetargetChannel(assetId)
    const projectPath = useProject.getState().project?.path ?? null
    const sameProject = () => (useProject.getState().project?.path ?? null) === projectPath
    let alive = true
    let busy = false
    const answered = new Set<string>()
    const snapshot = (): RetargetSnapshot | null => {
      const state = useCharacters.getState()
      const incarnation = characterStore.incarnationOf(state, assetId)
      if (!incarnation) return null
      const character = characterOf(state, assetId)
      return {
        assetId,
        name: assetsById(useAssets.getState()).get(assetId)?.name ?? assetId,
        revision: characterStore.revisionOf(state, assetId),
        incarnation,
        profiles: skeletonProfilesOf(useSkeletonProfiles.getState(), projectPath),
        rig: character.rig,
        bindings: character.autoRigBindings,
      }
    }
    let published: RetargetSnapshot | null = null
    // The rig and its weights are copied across on every post: an edit elsewhere on the
    // character only needs to tell the window it is behind.
    const publish = () => {
      const value = snapshot()
      const light =
        value && published && value.rig === published.rig && value.bindings === published.bindings
      channel.postMessage(
        !value
          ? { kind: 'gone' }
          : light
            ? { kind: 'changed', revision: value.revision, incarnation: value.incarnation }
            : { kind: 'snapshot', snapshot: value },
      )
      published = value
    }
    const isCurrent = (message: Extract<RetargetMessage, { kind: 'apply' }>) => {
      const value = snapshot()
      return (
        alive &&
        sameProject() &&
        value?.revision === message.revision &&
        value.incarnation === message.incarnation
      )
    }
    const persist = async (message: Extract<RetargetMessage, { kind: 'apply' }>) => {
      const saved = await saveCharacterMotion(
        assetId,
        message.name,
        message.glb,
        undefined,
        () => isCurrent(message),
        projectPath ?? undefined,
      )
      if (saved && projectPath)
        for (const profile of message.profiles ?? [])
          useSkeletonProfiles.getState().rememberSkeletonProfile(projectPath, profile)
      return saved
    }
    channel.onmessage = async event => {
      const message = retargetMessageOf(event.data)
      if (message?.kind === 'ask') {
        // A window that just opened heard none of what was published: it gets the whole snapshot.
        published = null
        publish()
      }
      if (message?.kind === 'editRig')
        await editRetargetRig(
          assetId,
          () => alive && sameProject() && snapshot()?.incarnation === message.incarnation,
        )
      if (message?.kind !== 'apply' || answered.has(message.requestId)) return
      const current = () => isCurrent(message)
      if (busy || !current()) {
        channel.postMessage({ kind: 'answer', requestId: message.requestId, ok: false })
        return
      }
      busy = true
      answered.add(message.requestId)
      try {
        const saved = await persist(message)
        if (alive)
          channel.postMessage({ kind: 'answer', requestId: message.requestId, ok: saved !== null })
      } catch {
        if (alive) channel.postMessage({ kind: 'answer', requestId: message.requestId, ok: false })
      } finally {
        busy = false
      }
    }
    let previous = characterOf(useCharacters.getState(), assetId)
    const unsubscribe = useCharacters.subscribe(state => {
      const next = characterOf(state, assetId)
      if (previous === next) return
      previous = next
      publish()
    })
    publish()
    return () => {
      unregister()
      alive = false
      unsubscribe()
      channel.postMessage({ kind: 'gone' })
      channel.close()
    }
  }, [assetId])
  return open
}
