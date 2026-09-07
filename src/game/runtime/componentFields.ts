// SPDX-License-Identifier: MIT

import type { Component, JsonValue } from '@shared/domain/component'

/**
 * What a system reads off a component, held to the type the descriptor declares — `null` included.
 * The registry refuses a bad value when one is WRITTEN, but a `.gltf` can come from elsewhere.
 */
export function numberOf(component: Component | null, key: string, fallback: number): number {
  const value = component?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function textOf(component: Component | null, key: string, fallback: string): string {
  const value = component?.[key]
  return typeof value === 'string' ? value : fallback
}

export function flagOf(component: Component | null, key: string, fallback: boolean): boolean {
  const value = component?.[key]
  return typeof value === 'boolean' ? value : fallback
}

/**
 * A `choiceField` read back as one of its OWN choices, so a caller can switch on it exhaustively
 * and a hand-edited `.gltf` cannot smuggle a fourth mode past the three a system knows.
 *
 * The fallback is the descriptor's default, passed as the plain string it is typed as; a default
 * that is not itself a choice answers the first one rather than escaping the union.
 */
export function choiceOf<T extends string>(
  component: Component | null,
  key: string,
  choices: readonly [T, ...T[]],
  fallback: string,
): T {
  const value = component?.[key]
  return choices.find(one => one === value) ?? choices.find(one => one === fallback) ?? choices[0]
}

/**
 * A bag of plain settings, which is what a `Script` carries beside the file it names.
 *
 * Filtered rather than trusted: a `.gltf` can come from elsewhere, and what the sandbox is handed
 * has to be JSON it can serialize — a nested object here would cross the bridge for nothing.
 */
export function settingsOf(component: Component | null, key: string): Record<string, JsonValue> {
  const value = component?.[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const held: Record<string, JsonValue> = {}
  for (const [name, one] of Object.entries(value)) {
    if (typeof one === 'string' || typeof one === 'number' || typeof one === 'boolean') {
      held[name] = one
    }
  }
  return held
}
