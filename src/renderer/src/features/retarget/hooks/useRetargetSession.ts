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
        setGone(true)
        setStatus('failed')
      }
      if (message?.kind === 'snapshot') {
        setLatest(message.snapshot)
        setSnapshot(current => current ?? message.snapshot)
      }
      if (message?.kind === 'answer' && message.requestId === pending.current) {
        pending.current = null
        setStatus(message.ok ? 'saved' : 'failed')
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
    refresh: () => {
      setSnapshot(latest)
      setStatus('idle')
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
      pending.current = requestId
      setStatus('saving')
      channel.current.postMessage(message)
    },
  }
}
