import type { ToolDefinition } from '@/features/shell/definition'
import { WorldActions } from '../components/World/WorldActions'
import { WorldPanel } from '../components/World/WorldPanel'

export const definition: ToolDefinition = { Content: WorldPanel, Actions: WorldActions }
