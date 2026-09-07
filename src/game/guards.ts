// SPDX-License-Identifier: MIT

/**
 * `typeof null === 'object'`, so a bare `typeof value === 'object'` hands `null` through. Written
 * here rather than read from `@shared/guards`: this tree ships MIT inside an exported game and
 * takes no value from the studio's, which is under other terms.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
