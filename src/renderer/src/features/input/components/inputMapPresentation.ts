// SPDX-License-Identifier: MIT
import type { InputBinding } from '@shared/domain/inputMap'

export function inputBindingLabel(binding: InputBinding): string {
  if (binding.device === 'keyboard') return binding.code
  return binding.control
}
