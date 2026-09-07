import { mdiClose } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { IconButtonProps } from '@pasquelin/panels'
import { ToolButton } from '@/components/ToolButton'
import { TIP_BOTTOM, TIP_RIGHT } from '@/helpers/tooltip'

/**
 * The button the chassis draws — a rail icon, or a panel's close — in the studio's own language.
 *
 * The library hands it `IconButtonProps` and knows nothing of tooltips; this is where the rule
 * that every button explains its action is met. `acts` is what tells the two apart: a rail icon
 * toggles a panel and tips to its right, a close button acts and tips below.
 */
export function ShellPanelButton({
  icon,
  label,
  active,
  accented,
  acts,
  onClick,
  // The ghost the drag carries is `aria-hidden`, and the chassis takes its button out of the tab
  // order for it. Dropped, the reader tabs into a button nobody can see.
  tabIndex,
}: IconButtonProps) {
  const { t } = useTranslation()

  return (
    <ToolButton
      // `mdiClose` rather than the glyph the library draws for itself: the studio spends one
      // shape per meaning, and this one is already the close of every dialog and every tab.
      icon={acts === true ? mdiClose : undefined}
      label={acts === true ? t('actions.removeTool') : label}
      tooltip={acts === true ? TIP_BOTTOM : TIP_RIGHT}
      variant={acts === true ? 'header' : 'bar'}
      active={active}
      accented={accented}
      acts={acts}
      onClick={onClick}
      tabIndex={tabIndex}
      iconSize={acts === true ? undefined : 22}
      className={acts === true ? undefined : 'size-(--sc-rail-button) rounded-(--radius-sc-md)'}
    >
      {acts === true ? undefined : icon}
    </ToolButton>
  )
}
