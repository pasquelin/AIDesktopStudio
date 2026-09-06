import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import { useEffect, useRef, useState } from 'react'
import { retargetSessionOf } from '@shared/domain/retargetWindow'
import { openRetargetChannel, retargetMessageOf, type RetargetSnapshot } from '../retargetChannel'

export function useRetargetSession() {
  const [snapshot, setSnapshot] = useState<RetargetSnapshot | null>(null)
  const [latest, setLatest] = useState<RetargetSnapshot | null>(null)
  const [gone, setGone] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const channel = useRef<BroadcastChannel | null>(null)
  const pending = useRef<string | null>(null)
  const latestRef = useRef<RetargetSnapshot | null>(null)
  const applied = useRef(false)
  useEffect(() => {
    const id = retargetSessionOf(window.location.hash)
    if (!id) {
      setGone(true)
      return
    }
    const port = openRetargetChannel(id)
    channel.current = port
    port.onmessage = event => {
      const message = retargetMessageOf(event.data)
      if (message?.kind === 'gone') {
        applied.current = false
        latestRef.current = null
        setGone(true)
        setSnapshot(null)
        setLatest(null)
        if (pending.current) setStatus('failed')
        pending.current = null
      }
      if (message?.kind === 'changed') {
        const next = (current: RetargetSnapshot | null) =>
          current && { ...current, revision: message.revision, incarnation: message.incarnation }
        setLatest(current => {
          const value = next(current)
          latestRef.current = value
          return value
        })
        if (applied.current) setSnapshot(current => next(current))
      }
      if (message?.kind === 'snapshot') {
        setGone(false)
        latestRef.current = message.snapshot
        setLatest(message.snapshot)
        setSnapshot(current => current ?? message.snapshot)
      }
      if (message?.kind === 'answer' && message.requestId === pending.current) {
        pending.current = null
        applied.current = message.ok
        setStatus(message.ok ? 'saved' : 'failed')
        if (message.ok && latestRef.current) setSnapshot(latestRef.current)
      }
    }
    port.postMessage({ kind: 'ask' })
    return () => {
      channel.current = null
      port.close()
    }
  }, [])
  const stale = Boolean(
    snapshot &&
    latest &&
    (snapshot.revision !== latest.revision || snapshot.incarnation !== latest.incarnation),
  )
  return {
    snapshot,
    gone,
    stale,
    status,
    editRig: () => {
      if (!snapshot || gone) return
      channel.current?.postMessage({ kind: 'editRig', incarnation: snapshot.incarnation })
    },
    refresh: () => {
      applied.current = false
      setSnapshot(latest)
      setStatus('idle')
    },
    idle: () => {
      applied.current = false
      setStatus(current => (current === 'saved' || current === 'failed' ? 'idle' : current))
    },
    apply: (name: string, glb: Uint8Array, profiles?: readonly SkeletonProfile[]) => {
      if (!snapshot || stale || gone || pending.current || !channel.current) return
      const requestId = crypto.randomUUID()
      const message = retargetMessageOf({
        kind: 'apply',
        requestId,
        revision: snapshot.revision,
        incarnation: snapshot.incarnation,
        name,
        glb,
        profiles,
      })
      if (!message) {
        setStatus('failed')
        return
      }
      applied.current = false
      pending.current = requestId
      setStatus('saving')
      channel.current.postMessage(message)
    },
  }
}
