import { STUDIO_METADATA_KEY } from '@shared/domain/document'
import { isOtioTimeline, otioStudioMetadata } from '@shared/domain/otio'
import { isRecord, readBoolean, readString } from '@shared/guards'

const COMPOSED_ROOT = new Set(['OTIO_SCHEMA', 'name', 'metadata', 'global_start_time', 'tracks'])
const COMPOSED_ITEMS = new Set(['Clip.1', 'Gap.1'])
const COMPOSED_EFFECT = 'LinearTimeWarp.1'
const HELD_LIMIT = 8

const childrenOf = (value: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(value.children) ? value.children.filter(isRecord) : []

const foreignMetadata = (value: Record<string, unknown>): string[] =>
  isRecord(value.metadata)
    ? Object.keys(value.metadata).filter(key => key !== STUDIO_METADATA_KEY)
    : []

function composedOver(item: Record<string, unknown>, composes?: 'range' | 'enabled'): string[] {
  const held = foreignMetadata(item).map(key => `metadata.${key}`)
  if (Array.isArray(item.markers) && item.markers.length > 0) held.push('markers')
  if (composes !== 'enabled' && !readBoolean(item, 'enabled', true)) held.push('enabled')
  if (composes !== 'range' && isRecord(item.source_range)) held.push('source_range')
  const effects = Array.isArray(item.effects) ? item.effects : []
  if (effects.some(one => !isRecord(one) || one.OTIO_SCHEMA !== COMPOSED_EFFECT))
    held.push('effects')
  return held
}

export function montageHoldsMore(payload: unknown): string[] {
  if (!isOtioTimeline(payload)) return []
  const held = new Set(Object.keys(payload).filter(key => !COMPOSED_ROOT.has(key)))
  for (const key of foreignMetadata(payload)) held.add(`metadata.${key}`)
  const stack = isRecord(payload.tracks) ? payload.tracks : {}
  for (const name of composedOver(stack)) held.add(name)
  for (const track of childrenOf(stack)) {
    for (const name of composedOver(track, 'enabled')) held.add(name)
    for (const item of childrenOf(track)) {
      if (held.size >= HELD_LIMIT) return [...held]
      const schema = readString(item, 'OTIO_SCHEMA', '')
      if (!COMPOSED_ITEMS.has(schema)) held.add(schema || 'children')
      else for (const name of composedOver(item, 'range')) held.add(name)
    }
  }
  return [...held]
}

export function montageRebuildsExtended(payload: unknown): boolean {
  if (!isOtioTimeline(payload)) return false
  const stack = isRecord(payload.tracks) ? payload.tracks : {}
  return childrenOf(stack).some(track =>
    childrenOf(track).some(
      item =>
        isRecord(item) &&
        item.OTIO_SCHEMA === 'Clip.1' &&
        Object.keys(otioStudioMetadata(item)).length > 0,
    ),
  )
}
