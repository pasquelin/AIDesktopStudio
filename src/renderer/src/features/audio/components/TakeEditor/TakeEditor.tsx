import { mdiMusicNoteOutline, mdiPause, mdiPlay } from '@mdi/js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset, AssetType } from '@shared/domain/asset'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { EmptyState } from '@/components/EmptyState'
import { MonitorFrame } from '@/components/MonitorFrame'
import { TOOLBAR_LABEL } from '@/components/styles'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { durationOf } from '@/engines/audio/audioData'
import {
  chainOf,
  clampRegion,
  cropBounds,
  EMPTY_TAKE_CHAIN,
  pushEdit,
  takeSliceOf,
  withChain,
  type AudioEdit,
  type Region,
} from '@/engines/audio/edits'
import { formatDuration } from '@/engines/timeline/timecode'
import { SECOND, trackOfClip, type Us } from '@/engines/timeline/timelineState'
import { cn } from '@/helpers/cn'
import { getBridge } from '@/services/bridge'
import { assetsById, useAssets } from '@/stores/assets'
import { audioEditsOf, useAudioEdits } from '@/stores/audioEdits'
import { flattenTakeClip, sequenceOf, trimTakeClip, useSequences } from '@/stores/sequences'
import { AUDIO_TOOLS, isAudioTool, type AudioToolId } from './audioTools'
import { loadTake } from './loadTake'
import { useWaveSurfer } from '@/hooks/useWaveSurfer'
import { useRenderedTake } from '@/hooks/useRenderedTake'

export type TakeEditorProps = { documentId: string }

/** What a fade tool lays down when no region says otherwise. */
const DEFAULT_FADE: Us = SECOND

const TAKES: readonly AssetType[] = ['audio']

/**
 * One take, edited — the source half of the pair.
 *
 * Nothing is written to disk until "apply" or "save as". A sound tool appends a step to the
 * chain, and what is heard is the chain replayed over the block's slice of the decoded take —
 * that is what makes undo free and A/B a boolean rather than a second copy of the audio. The two
 * tools that CUT append nothing: they move the block's own bounds, on the montage's history.
 */
export function TakeEditor({ documentId }: TakeEditorProps) {
  const { t } = useTranslation()
  // State rather than a ref, because the surface below is mounted only once a take is loaded:
  // a ref read on the first render is null and never announces its own arrival, which left the
  // waveform blank on every path that loads a take AFTER the editor is on screen.
  const [surface, setSurface] = useState<HTMLDivElement | null>(null)

  const sequence = useSequences(current => sequenceOf(current, documentId))
  const edits = useAudioEdits(current => audioEditsOf(current, documentId))
  const byId = useAssets(assetsById)

  /**
   * The block the montage has selected — the same derivation the Video workspace's source
   * monitor makes, and for the same reason: what one selected is what one is looking at.
   *
   * Sound blocks only. The tools below rebuild samples, and a picture clip has none to rebuild;
   * an Audio montage holds nothing else today, and this says so rather than relying on it.
   */
  const clip = selectedTake(sequence)
  const clipId = clipIdOf(clip)
  const chain = chainOf(edits, clipId)

  /**
   * What the chain is replayed over: the block's slice of its take, never the whole file.
   *
   * Two NUMBERS rather than one object, so that the effect below depends on VALUES. The write-back
   * mints a new clip object with the same bounds, and a render asked for by reference was then
   * asked for twice — half a second of worker to answer exactly what the first one had.
   *
   * The memo is around the DURATION alone, and its shape is not a matter of taste: React's
   * compiler assumes a function it cannot see into may mutate what it is handed, so
   * `takeSliceOf(clip)` called bare marks the clip mutable and every manual memo of this
   * component stops being preservable — `pnpm lint` says so and is right. Inside a memo the
   * mutation is bounded; `inPoint` needs none, being a field read.
   */
  const { inPoint, sourceDuration } = takeBounds(clip)

  const { assetId, asset } = takeAsset(clip, byId)
  const { rendered, unreadable } = useRenderedTake({
    documentId,
    assetId,
    clipId,
    chain,
    inPoint,
    sourceDuration,
  })

  const onRegionChange = (region: Region | null): void => {
    if (!clipId) return
    const store = useAudioEdits.getState()
    const current = audioEditsOf(store, documentId)
    store.replace(documentId, withChain(current, clipId, { ...chainOf(current, clipId), region }))
  }

  const player = useWaveSurfer({
    container: surface,
    rendered,
    owner: `audio:${documentId}`,
    onRegionChange,
  })

  const run = (edit: AudioEdit): void => {
    if (!clipId) return
    useAudioEdits.getState().runCommand(documentId, pushEdit(clipId, edit))
  }

  /**
   * What "apply" leaves behind, once the block points at the flattened file: the chain is IN
   * those bytes, so the chain has to go. Replaying it over them would lay every fade and gain
   * down a second time — and the block below, which carries them too, a third.
   *
   * The history goes with it, and it is the DOCUMENT's: a step undone after "apply" would
   * describe a take the block no longer holds, and history cannot be unwound for one block only.
   * The other blocks keep their chains — only their undo goes. This is the one irreversible
   * button of the editor, and it says so.
   */
  const applied = (): void => {
    const store = useAudioEdits.getState()
    const current = audioEditsOf(store, documentId)
    const kept = clipId ? withChain(current, clipId, EMPTY_TAKE_CHAIN) : current
    store.drop(documentId)
    store.replace(documentId, kept)
  }

  /**
   * Both buttons write a DERIVED asset and neither touches the source, which is what "apply" now
   * differs on: it used to replace the file under its own id. A take is one asset behind however
   * many blocks — in this montage and in every other document open on the project — and rewriting
   * it moved every one of them at once, silently, to bytes only this block had asked for.
   *
   * "Apply" then repoints THIS block at what it just wrote, laid flat; "save as" leaves the
   * montage exactly as it was and only adds to the shelf.
   */
  const save = async (flatten: boolean): Promise<void> => {
    const bridge = getBridge()
    if (!bridge || !rendered || !asset) return

    const written = await bridge.assets.saveAudio({
      derivedFrom: asset.id,
      name: t('audio.copyName', { name: asset.name }),
      // Already encoded, by the worker that replayed the chain.
      wav: rendered.wav,
    })
    await useAssets.getState().refresh()
    if (!flatten || !clipId) return

    flattenTakeClip(documentId, clipId, written.id, durationOf(rendered.data))
    applied()
  }

  // What the tools will act on, and what the bar says they will: read through one clamp rather
  // than two, so a range the take no longer holds — a crop having shortened it under a selection
  // laid before — cannot be announced as one and ignored as another.
  const region = selectedRegion(rendered, chain.region)

  /**
   * The two tools that CUT, which is a montage gesture wherever it is made from: they land on
   * the block's own bounds, through the sequence's history, and never on the chain. A step that
   * cut was replayed over the slice it had just produced, and ate into it again on every render.
   *
   * Both are expressed against `slice`, and that is what makes them exact: the region and the
   * silence are measured on the rendered take, which begins where the block begins.
   */
  const cutTo = (from: Us, to: Us): void => {
    const slice = { inPoint, duration: sourceDuration }
    if (clipId) trimTakeClip(documentId, clipId, cropBounds(slice, from, to))
  }

  const fade = (edge: 'in' | 'out'): void =>
    run({ kind: 'fade', edge, length: region ? region.to - region.from : DEFAULT_FADE })
  const trimSilence = (): void => {
    if (!rendered) return
    const { head, tail } = rendered.silence
    if (tail > head) cutTo(head, tail)
  }
  const compare = (): void => {
    if (!clipId) return
    const store = useAudioEdits.getState()
    const current = audioEditsOf(store, documentId)
    const heard = chainOf(current, clipId)
    store.replace(documentId, withChain(current, clipId, { ...heard, bypassed: !heard.bypassed }))
  }
  const actions: Record<AudioToolId, () => void> = {
    crop: () => region && cutTo(region.from, region.to),
    fadeIn: () => fade('in'),
    fadeOut: () => fade('out'),
    normalize: () => run({ kind: 'normalize', targetLufs: -14 }),
    trimSilence,
    compare,
    apply: () => void save(true),
    saveAs: () => void save(false),
  }

  // This half takes a drop, empty or not: dropping a take onto the editor lays it on the montage
  // and selects it, which is what brings it here.
  const takeDrop = (dropped: Asset): void => loadTake(documentId, dropped)

  // A take that cannot be read lands here too, and it is why the drop target wraps both: an
  // editor that only says "undecodable" is a half with no way out — the gesture that would
  // replace the take is the very one it stopped accepting.
  if (!clip || unreadable) {
    return (
      <AssetDropTarget accepts={TAKES} onDrop={takeDrop} outlined={false} className="flex flex-1">
        <MonitorFrame role={t('audio.takeRole')} toolbar={null}>
          <EmptyState
            icon={mdiMusicNoteOutline}
            message={t(unreadable ? 'audio.unreadable' : 'audio.noClip')}
          />
        </MonitorFrame>
      </AssetDropTarget>
    )
  }

  return (
    <AssetDropTarget
      accepts={TAKES}
      onDrop={takeDrop}
      // No frame: see `ImageDocument`.
      outlined={false}
      className="flex min-h-0 flex-1"
    >
      <MonitorFrame
        role={t('audio.takeRole')}
        toolbar={takeToolbar({ player, chain, actions, region, rendered }, t)}
      >
        {/* `sc-wave` is what paints the selection's edges in the accent, from `index.css`: they
            live in wavesurfer's shadow tree, where only `::part` reaches them. */}
        <div ref={setSurface} className="sc-wave absolute inset-0" />
        {!rendered && <EmptyState icon={mdiMusicNoteOutline} message={t('collection.loading')} />}
      </MonitorFrame>
    </AssetDropTarget>
  )
}

function selectedTake(sequence: ReturnType<typeof sequenceOf>) {
  if (!sequence.selectedId) return null
  const holder = trackOfClip(sequence, sequence.selectedId)
  if (holder?.kind !== 'audio') return null
  return holder.clips.find(one => one.id === sequence.selectedId) ?? null
}

function clipIdOf(clip: ReturnType<typeof selectedTake>): string | null {
  return clip?.id ?? null
}

function takeBounds(clip: ReturnType<typeof selectedTake>) {
  if (!clip) return { inPoint: 0, sourceDuration: 0 }
  return { inPoint: clip.inPoint, sourceDuration: takeSliceOf(clip).duration }
}

function takeAsset(clip: ReturnType<typeof selectedTake>, byId: ReadonlyMap<string, Asset>) {
  if (!clip) return { assetId: null, asset: null }
  return { assetId: clip.assetId, asset: byId.get(clip.assetId) ?? null }
}

function selectedRegion(
  rendered: ReturnType<typeof useRenderedTake>['rendered'],
  region: Region | null,
) {
  if (!rendered || !region) return null
  return clampRegion(region, rendered.data)
}

type TakeToolbarProps = {
  player: ReturnType<typeof useWaveSurfer>
  chain: ReturnType<typeof chainOf>
  actions: Record<AudioToolId, () => void>
  region: Region | null
  rendered: ReturnType<typeof useRenderedTake>['rendered']
}

function takeToolbar(
  { player, chain, actions, region, rendered }: TakeToolbarProps,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const transport = player.playing
    ? { id: 'transport', labelKey: 'transport.pause', icon: mdiPause }
    : { id: 'transport', labelKey: 'transport.play', icon: mdiPlay }
  return (
    <Toolbar
      orientation="horizontal"
      tools={[transport, ...AUDIO_TOOLS]}
      activeTool={chain.bypassed ? 'compare' : undefined}
      onTool={id => (id === 'transport' ? player.toggle() : isAudioTool(id) && actions[id]())}
      extras={takeToolbarStatus({ player, region, rendered }, t)}
    />
  )
}

function takeToolbarStatus(
  { player, region, rendered }: Pick<TakeToolbarProps, 'player' | 'region' | 'rendered'>,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const selection = region
    ? t('audio.selection', { from: formatDuration(region.from), to: formatDuration(region.to) })
    : t('audio.noSelection')
  const duration = rendered ? ` / ${formatDuration(durationOf(rendered.data))}` : ''
  return (
    <>
      <span className={TOOLBAR_LABEL}>{selection}</span>
      <span className={cn(TOOLBAR_LABEL, 'font-mono')}>
        {formatDuration(player.currentTime)}
        {duration}
      </span>
    </>
  )
}
