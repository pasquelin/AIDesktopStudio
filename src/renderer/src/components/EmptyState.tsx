import { Button } from './Button'
import { UiIcon } from './UiIcon'
import { HINT_TOP } from '@/helpers/tooltip'

/** A way out of an empty panel: what it says, and what it does. */
type EmptyStateAction = {
  label: string
  /** What the label does not say — required, so a way out is never a word on its own. */
  hint: string
  onClick: () => void
}

export type EmptyStateProps = {
  icon: string
  message: string
  /** The way out, for a panel whose emptiness the user can act on. */
  action?: EmptyStateAction
  /**
   * A second way out, for an emptiness that has two — no project is either one to open or one
   * to make, and offering only the first is the half that was missing. Both wear the same
   * button: neither is the lesser, and a third would be a menu rather than an empty state.
   */
  secondary?: EmptyStateAction
  /**
   * What the machine said, under the sentence the studio wrote. A named reason still does not say
   * WHICH file or which server, and for a failure nothing recognised it is all there is to show.
   * Left as it came — it is quoted, not written.
   */
  detail?: string
}

/**
 * Message for a panel with no content. An unexplained empty dock reads as a bug.
 *
 * The actions are labels and callbacks rather than free nodes: every panel offers its way out
 * the same way, and a node would let each one grow its own button.
 */
export function EmptyState({ icon, message, action, secondary, detail }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <UiIcon path={icon} size={32} className="text-muted/40" />
      <p className="text-muted max-w-56 text-xs leading-relaxed">{message}</p>

      {detail !== undefined && detail !== '' && (
        <pre className="text-muted text-tiny m-0 max-w-72 break-words whitespace-pre-wrap">
          {detail}
        </pre>
      )}

      {(action || secondary) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button {...HINT_TOP(action.hint)} onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondary && (
            <Button {...HINT_TOP(secondary.hint)} onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
