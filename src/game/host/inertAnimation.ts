// SPDX-License-Identifier: MIT

import type { AnimationPort } from '../ports/animationPort'

/** No clip, nowhere to pose one, and no length to answer — a host that draws nothing. */
export function createInertAnimation(): AnimationPort {
  return { pose: () => {}, release: () => {}, releaseAll: () => {}, lengths: () => NO_LENGTHS }
}

const NO_LENGTHS: Readonly<Record<string, number>> = Object.freeze({})
