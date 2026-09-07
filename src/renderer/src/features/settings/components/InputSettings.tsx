// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WINDOW_CAPTION, WINDOW_GROUP_LABEL, WINDOW_ROW } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'

function connectedGamepads(): Gamepad[] {
  if (typeof navigator.getGamepads !== 'function') return []
  return Array.from(navigator.getGamepads()).filter(
    (gamepad): gamepad is Gamepad => gamepad?.connected === true,
  )
}

export function InputSettings() {
  const { t } = useTranslation()
  const [gamepads, setGamepads] = useState(connectedGamepads)

  useEffect(() => {
    const refresh = (): void => setGamepads(connectedGamepads())
    window.addEventListener('gamepadconnected', refresh)
    window.addEventListener('gamepaddisconnected', refresh)
    return () => {
      window.removeEventListener('gamepadconnected', refresh)
      window.removeEventListener('gamepaddisconnected', refresh)
    }
  }, [])

  return (
    <section className="mt-5" aria-labelledby="input-devices-title">
      <h3 id="input-devices-title" className={WINDOW_GROUP_LABEL}>
        {t('settings.inputDevices.title')}
      </h3>
      <ul className="m-0 list-none p-0">
        <li className={WINDOW_ROW}>{t('settings.inputDevices.keyboard')}</li>
        <li className={WINDOW_ROW}>{t('settings.inputDevices.mouse')}</li>
        {gamepads.map(gamepad => (
          <li key={gamepad.index} className={WINDOW_ROW}>
            {gamepad.id}
            {/* 🛑 Listed and inert otherwise: every reader of a pad answers zero for a mapping it
                cannot name, so a controller shown here did nothing and said nothing. */}
            {gamepad.mapping !== 'standard' && (
              <span className={cn(WINDOW_CAPTION, 'ml-2')}>
                {t('settings.inputDevices.gamepadUnsupported')}
              </span>
            )}
          </li>
        ))}
      </ul>
      {gamepads.length === 0 && (
        <>
          <p className={cn(WINDOW_CAPTION, 'mt-2')}>{t('settings.inputDevices.noGamepad')}</p>
          {/* 🛑 An empty list is the NORMAL state of a plugged-in gamepad nobody has pressed yet:
              the browser hides it until then, and without this line it reads as a breakage. */}
          <p className={cn(WINDOW_CAPTION, 'mt-1')}>{t('settings.inputDevices.gamepadSleeps')}</p>
        </>
      )}

      {/* This page and a game's keys wear the same word in everyday speech. Saying where the
          other one lives is what stops a search for a setting that was never here. */}
      <h3 className={cn(WINDOW_GROUP_LABEL, 'mt-5')}>{t('settings.gameControls.title')}</h3>
      <p className={WINDOW_CAPTION}>{t('settings.gameControls.help')}</p>
    </section>
  )
}
