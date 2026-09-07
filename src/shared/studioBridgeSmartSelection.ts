import type { SmartSelectionRequest, SmartSelectionResult } from './domain/smartSelectionInference'

export type StudioBridgeSmartSelection = {
  smartSelection: {
    run: (request: SmartSelectionRequest) => Promise<SmartSelectionResult>
  }
}
