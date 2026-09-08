/**
 * The model the gesture runs, on THIS machine and no other — `smartSelectionHost` loads this one
 * by name, so a cloud picked for the `background-removal/cutout` role never reaches it.
 *
 * 🛑 Named here because both sides need it: the main to load it, the window to know whether the
 * gesture can run at all. The window used to ask which model served the ROLE instead, which said
 * yes to a Scenario one and armed a tool the engine then refused.
 */
export const SMART_SELECTION_MODEL = 'efficient-sam-ti'

export type SmartSelectionPrompt =
  | { point: { x: number; y: number } }
  | { box: { x: number; y: number; width: number; height: number } }

export type SmartSelectionRequest = {
  id: string
  revision: string
  png: Uint8Array
  width: number
  height: number
  prompt: SmartSelectionPrompt
}

export type SmartSelectionResult = {
  width: number
  height: number
  alpha: Uint8Array
}
