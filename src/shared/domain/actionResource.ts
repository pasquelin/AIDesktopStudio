export type ActionResource =
  | 'generationModelCandidates'
  | 'preparedGeneration'
  | 'projectAssetCandidates'
  | 'projectFilePaths'
  | 'settingsState'
  | 'cameraShots'

export type ActionReferenceKind = 'model' | 'asset' | 'node' | 'document' | 'job' | 'shot'

export type ActionResourceDescriptor = {
  reference?: { kind: ActionReferenceKind; key: string }
}

export const ACTION_RESOURCES: Record<ActionResource, ActionResourceDescriptor> = {
  generationModelCandidates: { reference: { kind: 'model', key: 'id' } },
  preparedGeneration: {},
  projectAssetCandidates: { reference: { kind: 'asset', key: 'id' } },
  projectFilePaths: {},
  settingsState: {},
  cameraShots: { reference: { kind: 'shot', key: 'shotId' } },
}
