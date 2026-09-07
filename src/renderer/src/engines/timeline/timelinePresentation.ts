import { Texture } from 'pixi.js'
import type { Size } from '../core/geometry'
import { clipEnd, type Clip, type SequenceState, type Track, type Us } from './timelineState'

export function clipAt(track: Track, time: Us): Clip | null {
  return track.clips.find(clip => time >= clip.start && time < clipEnd(clip)) ?? null
}

export function reusePaintedSource(
  source: string | null,
  trackId: string,
  stable: (assetId: string) => boolean,
  painted: ReadonlyMap<string, string>,
): boolean {
  return source !== null && stable(source) && painted.get(trackId) === source
}

export function spritesOffFrame<T>(
  sprites: ReadonlyMap<string, T>,
  painting: readonly Track[],
): T[] {
  const inFrame = new Set(painting.map(track => track.id))
  return [...sprites].filter(([trackId]) => !inFrame.has(trackId)).map(([, sprite]) => sprite)
}

export function videoTracksByDepth(state: SequenceState): Track[] {
  return state.tracks
    .filter(track => track.kind === 'video')
    .sort((left, right) => left.index - right.index)
}

export function swapTexture(target: { texture: Texture }, next: Texture): void {
  const previous = target.texture
  target.texture = next
  if (previous !== Texture.EMPTY) previous.destroy(true)
}

export type Placement = { x: number; y: number; scale: number }

export function fitInside(source: Size, frame: Size): Placement {
  const usable = source.width > 0 && source.height > 0 && frame.width > 0 && frame.height > 0
  if (!usable) return { x: 0, y: 0, scale: 0 }

  const scale = Math.min(frame.width / source.width, frame.height / source.height)
  return {
    x: (frame.width - source.width * scale) / 2,
    y: (frame.height - source.height * scale) / 2,
    scale,
  }
}
