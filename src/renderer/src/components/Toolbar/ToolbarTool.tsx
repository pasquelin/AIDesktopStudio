import { useTranslation } from 'react-i18next'
import { HINT_RIGHT, type TooltipFactory } from '@/helpers/tooltip'
import { MenuButton } from '../MenuButton'
import { MenuRow, type MenuRowChoice } from '../MenuRow'
import type { ToolbarItem } from './tools'
export type ToolbarToolProps = {
  tool: ToolbarItem
  active: boolean
  tip: TooltipFactory
  onTool: (id: string) => void
  onMode?: (toolId: string, modeId: string) => void
}
export function ToolbarTool({ tool, active, tip, onTool, onMode }: ToolbarToolProps) {
  const { t } = useTranslation()
  const armed = tool.modes?.find(mode => mode.id === tool.activeMode)
  const description = armed?.descriptionKey ?? tool.descriptionKey
  const opensOnClick = (tool.modes?.length ?? 0) > 1 && tool.activeMode === undefined
  return (
    <MenuButton
      icon={armed?.icon ?? tool.icon}
      label={t(armed?.labelKey ?? tool.labelKey, tool.labelValues)}
      description={description ? t(description, tool.descriptionValues) : undefined}
      shortcut={tool.modes ? armed?.shortcut : tool.shortcut}
      tooltip={tool.tip ?? tip}
      active={active}
      variant={tool.variant}
      accented={active}
      acts={tool.acts === true || opensOnClick}
      disabled={tool.disabled}
      rowCount={tool.modes?.length ?? 0}
      opensOnClick={opensOnClick}
      onClick={opensOnClick ? undefined : () => onTool(tool.id)}
      rows={close =>
        tool.modes?.map(mode => {
          const choice: MenuRowChoice =
            tool.activeMode === undefined
              ? {}
              : { checked: tool.activeMode === mode.id, tick: 'one-of' }
          return (
            <MenuRow
              key={mode.id}
              label={t(mode.labelKey)}
              icon={mode.icon}
              shortcut={mode.shortcut}
              disabled={mode.disabled}
              {...choice}
              tip={HINT_RIGHT(t(mode.descriptionKey))}
              onSelect={() => {
                onMode?.(tool.id, mode.id)
                close()
              }}
            />
          )
        })
      }
    />
  )
}
