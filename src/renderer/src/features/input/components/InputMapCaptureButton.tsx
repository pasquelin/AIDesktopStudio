// SPDX-License-Identifier: MIT
import { mdiRecordCircle, mdiRecordCircleOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { ToolButton } from '@/components/ToolButton'
import { TIP_LEFT } from '@/helpers/tooltip'
import type { InputCapture } from '@/hooks/useInputCapture'

export type InputMapCaptureButtonProps = { capture: InputCapture; onArm: () => void }

/**
 * « Press what you want » beside a binding field — armed, it disarms; the two expert rows say the
 * same two words, and said them apart until they could differ.
 *
 * 🛑 A GLYPH, in the end column every property line keeps: that column is two controls wide, so a
 * labelled button spilled left over the field it stands beside and cut the value being typed. Its
 * words move to the accessible name and the tip, which is where a row's buttons say them.
 */
export function InputMapCaptureButton({ capture, onArm }: InputMapCaptureButtonProps) {
  const { t } = useTranslation()
  return (
    <ToolButton
      icon={capture.capturing ? mdiRecordCircle : mdiRecordCircleOutline}
      label={capture.capturing ? t('game.inputMap.capturing') : t('game.inputMap.capture')}
      description={t('game.inputMap.captureHint')}
      tooltip={TIP_LEFT}
      variant="header"
      // Armed, it is a control that is ON — and the one thing on screen waiting for a gesture.
      accented={capture.capturing}
      onClick={() => (capture.capturing ? capture.cancel() : onArm())}
    />
  )
}
