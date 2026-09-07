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
