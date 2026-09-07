import { useEffect, useState } from 'react'
import type { RenderedAudio } from '@/engines/audio/audioRender'
import type { TakeChain } from '@/engines/audio/edits'
import { decodeAsset } from '@/helpers/audioDecode'
import { useAudioRenderer } from './useAudioRenderer'
import { writeTakeClip } from '@/stores/sequences'

type RenderAnswer = {
  rendered: RenderedAudio | null
  unreadable: boolean
}

type Options = {
  documentId: string
  assetId: string | null
  clipId: string | null
  chain: TakeChain
  inPoint: number
  sourceDuration: number
}

export function useRenderedTake(options: Options): RenderAnswer {
  const { documentId, assetId, clipId, chain, inPoint, sourceDuration } = options
  const renderer = useAudioRenderer()
  const [loaded, setLoaded] = useState<{ assetId: string; ok: boolean } | null>(null)
  const [output, setOutput] = useState<{
    clipId: string
    assetId: string
    bypassed: boolean
    audio: RenderedAudio | null
  } | null>(null)

  useEffect(() => {
    if (!assetId || !renderer) return
    let live = true
    const load = async (): Promise<void> => {
      try {
        const source = await decodeAsset(assetId)
        if (!live) return
        renderer.load(source)
        setLoaded({ assetId, ok: true })
      } catch {
        if (live) setLoaded({ assetId, ok: false })
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [assetId, renderer])

  const settled = loaded?.assetId === assetId ? loaded : null
  useEffect(() => {
    if (!renderer || !assetId || !clipId || settled?.ok !== true) return
    let live = true
    const render = async (): Promise<void> => {
      const bypassed = chain.bypassed
      const audio = await renderer.render(bypassed ? [] : chain.edits, inPoint, sourceDuration)
      if (live) setOutput({ clipId, assetId, bypassed, audio })
    }
    void render()
    return () => {
      live = false
    }
  }, [renderer, settled, assetId, clipId, inPoint, sourceDuration, chain.edits, chain.bypassed])

  const answered = output?.clipId === clipId && output.assetId === assetId ? output : null
  useEffect(() => {
    if (!answered || answered.bypassed || !chain.touched) return
    const shape = answered.audio?.shape
    if (clipId && shape) writeTakeClip(documentId, clipId, shape)
  }, [documentId, clipId, chain.touched, answered])

  return {
    rendered: answered?.audio ?? null,
    unreadable: settled?.ok === false || answered?.audio === null,
  }
}
