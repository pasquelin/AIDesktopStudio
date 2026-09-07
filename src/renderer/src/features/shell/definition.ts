import type { ComponentType } from 'react'

/**
 * What a panel publishes about itself. Here rather than beside the table that collects them:
 * that table imports every panel, so a panel reading the type off it closed a cycle.
 *
 * `ComponentType` rather than `FC` so a `lazy()` wrapper satisfies it: the table hands one down
 * for every panel, and none of them is evaluated before its half is opened.
 */
export type ToolDefinition = {
  Content: ComponentType
  /** Actions rendered in the title bar, on the same line as the panel name. */
  Actions?: ComponentType
}
