import type { MaterialSettings, PbrChannel } from '@shared/domain/material'
import { replaceField, type Command } from '../core/history'
import type { ChannelMap, PreviewSettings, MaterialState } from './materialState'

/**
 * Material edits. Each captures what it needs to revert **as it is applied** rather than as it is
 * built, so a command survives being redone.
 *
 * The `id` is what the history coalesces on: every frame of one slider drag carries the same id
 * and collapses into a single undo entry, while moving to another slider starts a new one.
 */

/** One entry per setting, so dragging one slider does not swallow the previous one's entry. */
export function setMaterialSetting<K extends keyof MaterialSettings>(
  key: K,
  value: MaterialSettings[K],
): Command<MaterialState> {
  return replaceField(`material:${key}`, 'material', material => ({ ...material, [key]: value }))
}

/**
 * A whole material at once — what applying a saved style does.
 *
 * Keyed on the style rather than on the word "style": two styles applied in a row must leave two
 * undo entries, and one shared id would coalesce them into one that gives back neither.
 *
 * The channels are not touched, which is the whole reason a style applies to any material: it
 * says how to read the maps in front of it, never which maps to read.
 */
export function applyStyle(styleId: string, values: MaterialSettings): Command<MaterialState> {
  return replaceField(`material:style:${styleId}`, 'material', () => values)
}

export function setPreview<K extends keyof PreviewSettings>(
  key: K,
  value: PreviewSettings[K],
): Command<MaterialState> {
  return replaceField(`preview:${key}`, 'preview', preview => ({ ...preview, [key]: value }))
}

/** Puts a map in a channel, or takes it out. Coalesced per channel, never across two. */
export function setChannel(channel: PbrChannel, map: ChannelMap | null): Command<MaterialState> {
  return replaceField(`channel:${channel}`, 'channels', channels => {
    if (!map) {
      const remaining = { ...channels }
      delete remaining[channel]
      return remaining
    }
    return { ...channels, [channel]: map }
  })
}
