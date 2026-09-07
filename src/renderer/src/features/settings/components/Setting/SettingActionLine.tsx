import { HINT_LEFT } from '@/helpers/tooltip'
import { WINDOW_HELP } from '@/components/windowStyles'
import { SettingLine } from './SettingLine'
import { WindowButton, type WindowButtonVariant } from '@/components/WindowButton'

/** What paints the button, where nothing is being confirmed. */
export type SettingActionTone = 'action' | 'quiet'

export type SettingActionLineProps = {
  title: string
  /** What there is to do right now — « nothing to merge », « twelve of them ». Already translated. */
  help: string
  /** The word on the button, already translated. */
  button: string
  disabled?: boolean
  /**
   * The sentence a destructive gesture asks first, ALREADY TRANSLATED like the three above —
   * a factory of this window takes words, never keys. Its presence is what paints the button.
   */
  confirm?: string
  tone?: SettingActionTone
  onRun: () => void
}

/**
 * A line that ACTS: a title, a sentence saying what there is to do, and one button.
 *
 * 🛑 The tooltip and the confirming are posed HERE, never left to the caller: of the three
 * writings this replaced, one carried a tooltip and two did not, and asking on both sides put
 * the same question up twice.
 */
export function SettingActionLine({
  title,
  help,
  button,
  disabled = false,
  confirm,
  tone = 'action',
  onRun,
}: SettingActionLineProps) {
  const variant: WindowButtonVariant = confirm ? 'danger' : tone === 'quiet' ? 'quiet' : 'primary'
  return (
    <SettingLine title={title} help={<p className={WINDOW_HELP}>{help}</p>}>
      <WindowButton
        // The help under the pointer too: a narrow window pushes the sentence beside the row out
        // of sight well before it takes the button with it.
        {...HINT_LEFT(help)}
        variant={variant}
        disabled={disabled}
        // Asked for once, plainly: what these erase no Cancel button covers.
        onClick={() => {
          if (confirm === undefined || window.confirm(confirm)) onRun()
        }}
      >
        {button}
      </WindowButton>
    </SettingLine>
  )
}
