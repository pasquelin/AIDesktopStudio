import type { ReliefExtent } from '@shared/domain/relief'
import type { TerrainEditLayer } from '@shared/domain/scene'

export type ReliefGeometryData = {
  column: number
  row: number
  position: Float32Array
  normal: Float32Array
  uv: Float32Array
  index: Uint16Array
}

export type ReliefBuildRequest = {
  id: number
  width: number
  height: number
  values: Float32Array
  extent: ReliefExtent
  grain: number
  edits: readonly TerrainEditLayer[]
}

export type ReliefBuildIncoming = ReliefBuildRequest | { id: number; cancel: true }

export type ReliefBuildResponse =
  | { id: number; done: false; progress: number }
  | { id: number; done: true; ok: true; chunks: ReliefGeometryData[] }
  | { id: number; done: true; ok: false; error: string }

export const isReliefBuildCancel = (
  message: ReliefBuildIncoming,
): message is { id: number; cancel: true } => 'cancel' in message
