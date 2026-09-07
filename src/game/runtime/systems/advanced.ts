// SPDX-License-Identifier: MIT

import { clamp } from '../../numeric'

export const WAYPOINT_MODES: readonly ['once', 'loop', 'pingPong'] = ['once', 'loop', 'pingPong']

export type WaypointMode = (typeof WAYPOINT_MODES)[number]

/** Where something is along a run of waypoints: which one it wants, which way, whether it is done. */
export type WaypointCursor = { at: number; forward: boolean; done: boolean }

/** `once` stops at the far end; the two others fold the run back, by wrapping or by walking it back. */
export function advanced(cursor: WaypointCursor, count: number, mode: WaypointMode): void {
  if (mode === 'once') {
    if (cursor.at + 1 >= count) cursor.done = true
    else cursor.at += 1
    return
  }
  if (mode === 'loop') {
    cursor.at = (cursor.at + 1) % count
    return
  }

  if (cursor.forward && cursor.at + 1 >= count) cursor.forward = false
  else if (!cursor.forward && cursor.at === 0) cursor.forward = true
  cursor.at = clamp(cursor.at + (cursor.forward ? 1 : -1), 0, count - 1)
}
