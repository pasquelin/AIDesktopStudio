import type { BrowserWindow } from 'electron'
import { COPIES_ROUTE } from '@shared/domain/fileCopies'
import { openAuxiliaryWindow } from './windows'

/**
 * What the open project holds twice, and what its rebuildable stores weigh — a diagnosis, read
 * on its own and never while working.
 *
 * Its own module rather than a tenth opener in `windows.ts`, which is at its size ceiling: the
 * welcome and the retarget windows already live apart for the same reason.
 *
 * As wide as the usage window, and for the same reason: a row is a path, a size and a store,
 * and a wrapped path is a path nobody can compare with the one under it.
 */
export function openCopiesWindow(): BrowserWindow {
  return openAuxiliaryWindow(COPIES_ROUTE, {
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 420,
  })
}
