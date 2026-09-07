import type { AiOverview } from '@shared/domain/aiOverview'

export const EMPTY_AI_OVERVIEW: AiOverview = {
  roles: [],
  machine: { physicalBytes: 0, availableBytes: 0, diskFreeBytes: null, gpu: null, vram: null },
  projectPath: null,
  installing: null,
  loading: null,
  loadFailure: null,
  installFailure: null,
  ollama: { ready: false, installed: false, names: [], progress: null, failed: false },
  engine: { known: false, missing: [], progress: null, failed: false },
}
