import { mdiUnfoldLessHorizontal, mdiUnfoldMoreHorizontal } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { ToolButton } from './ToolButton'

type TreeFoldButtonProps = {
  expanded: boolean
  onFold: () => void
  onUnfold: () => void
}

/** The same one-button fold gesture as the Inspector, for tree-shaped panels. */
export function TreeFoldButton({ expanded, onFold, onUnfold }: TreeFoldButtonProps) {
  const { t } = useTranslation()

  return (
    <ToolButton
      icon={expanded ? mdiUnfoldLessHorizontal : mdiUnfoldMoreHorizontal}
      label={t(expanded ? 'inspector.foldAll' : 'inspector.unfoldAll')}
      description={t(expanded ? 'inspector.foldAllHint' : 'inspector.unfoldAllHint')}
      tooltip={TIP_BOTTOM}
      variant="header"
      onClick={expanded ? onFold : onUnfold}
    />
  )
}
