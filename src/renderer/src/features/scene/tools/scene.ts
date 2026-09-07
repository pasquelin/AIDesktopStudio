import type { ToolDefinition } from '@/features/shell/definition'
import { Scene } from '../components/Scene/Scene'
import { SceneActions } from '../components/Scene/SceneActions'

export const definition: ToolDefinition = { Content: Scene, Actions: SceneActions }
