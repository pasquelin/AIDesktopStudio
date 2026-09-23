import type { BrowserWindow } from 'electron'
import { SHIPPED_ROUTE } from '@shared/domain/shippedResources'
import { openAuxiliaryWindow } from './windows'

/**
 * What the studio ships with, and how to put it in — read on its own, and rarely.
 *
 * Its own module rather than a tenth opener in `windows.ts`, which is at its size ceiling.
 * Narrower than the copies window: a row is a name and a thumbnail, never a path.
 */
export function openShippedWindow(): BrowserWindow {
  return openAuxiliaryWindow(SHIPPED_ROUTE, {
    width: 560,
    height: 640,
    minWidth: 420,
    minHeight: 360,
  })
}
