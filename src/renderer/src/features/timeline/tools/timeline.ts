import type { ToolDefinition } from '@/features/shell/definition'
import { TimelineActions } from '../components/Timeline/TimelineActions'
import { TimelinePanel } from '../components/Timeline/TimelinePanel'

export const definition: ToolDefinition = {
  Content: TimelinePanel,
  Actions: TimelineActions,
}
