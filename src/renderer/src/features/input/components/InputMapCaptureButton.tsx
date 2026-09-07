// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { HINT_LEFT } from '@/helpers/tooltip'
import type { InputCapture } from '@/hooks/useInputCapture'

export type InputMapCaptureButtonProps = { capture: InputCapture; onArm: () => void }

/**
 * « Press what you want » beside a binding field — armed, it disarms; the two expert rows say the
 * same two words, and said them apart until they could differ.
 */
export function InputMapCaptureButton({ capture, onArm }: InputMapCaptureButtonProps) {
  const { t } = useTranslation()
  return (
    <Button
      onClick={() => (capture.capturing ? capture.cancel() : onArm())}
      {...HINT_LEFT(t('game.inputMap.captureHint'))}
    >
      {capture.capturing ? t('game.inputMap.capturing') : t('game.inputMap.capture')}
    </Button>
  )
}
