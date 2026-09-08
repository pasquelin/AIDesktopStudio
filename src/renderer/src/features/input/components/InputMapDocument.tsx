import { localizedError } from '@shared/localizedError'
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inputMapOf, type InputMap } from '@shared/domain/inputMap'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Chip'
import { getBridge } from '@/services/bridge'
import {
  inputMapsChanged,
  isDuplicateInputMapId,
  projectInputMaps,
} from '@/engines/code/projectInputMaps'
import {
  fileViewPanelId,
  registerFileViewSave,
  setDocumentTitle,
} from '@/features/shell/components/dockviewApi'
import { InputMapExpert } from './InputMapExpert'
import { InputMapJson } from './InputMapJson'
import { InputMapSimple } from './InputMapSimple'

type EditorMode = 'simple' | 'expert' | 'json'
type InputMapDocumentProps = { path: string }
const EDITOR_MODES: readonly EditorMode[] = ['simple', 'expert', 'json']

function formatted(map: InputMap): string {
  return JSON.stringify(map, null, 2)
}

export function InputMapDocument({ path }: InputMapDocumentProps) {
  const { t } = useTranslation()
  const [map, setMap] = useState<InputMap | null>(null)
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<EditorMode>('simple')
  const [modified, setModified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const loaded = await getBridge()?.inputMaps.read(path)
        if (!active) return
        if (!loaded) {
          setError(t('game.inputMap.loadFailed'))
          return
        }
        setMap(loaded)
        setSource(formatted(loaded))
      } catch {
        if (!active) return
        setError(t('game.inputMap.loadFailed'))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [path, t])

  useEffect(
    () => setDocumentTitle(fileViewPanelId(path), map?.id ?? '', modified),
    [map?.id, modified, path],
  )

  const changeMap = (next: InputMap): void => {
    revision.current += 1
    setMap(next)
    setSource(formatted(next))
    setModified(true)
    setError(null)
  }

  const changeMode = (nextMode: EditorMode): void => {
    if (mode === 'json' && nextMode !== 'json') {
      try {
        const next = inputMapOf(JSON.parse(source))
        setMap(next)
        setSource(formatted(next))
        setError(null)
      } catch {
        setError(t('game.inputMap.invalid'))
        return
      }
    }
    setMode(nextMode)
  }

  const duplicateOf = useCallback(
    async (id: string): Promise<string | null> => {
      // 🛑 Asked of THIS id: `inputMapIdConflict` answers the first repeat of the project, so a
      // second pair elsewhere hid the one the author had just written.
      return isDuplicateInputMapId(await projectInputMaps(), id)
        ? t('game.inputMap.duplicateId', { id })
        : null
    },
    [t],
  )

  const save = useCallback(async (): Promise<boolean> => {
    const savedRevision = revision.current
    try {
      const next = mode === 'json' ? inputMapOf(JSON.parse(source)) : inputMapOf(map)
      const written = await getBridge()?.inputMaps.write(path, next)
      if (!written) throw localizedError('writeRefused')
      inputMapsChanged()
      const unchanged = revision.current === savedRevision
      if (unchanged) {
        setMap(next)
        setSource(formatted(next))
        setModified(false)
      }
      // 🛑 Asked AFTER the write, from the disk: a second file carrying this context is what the
      // author has to read here and now — a Play is the only place that used to say it, and only
      // once it had already dropped every script of the project.
      setError(await duplicateOf(next.id))
      return unchanged
    } catch {
      setError(t('game.inputMap.invalid'))
      return false
    }
  }, [duplicateOf, map, mode, path, source, t])

  useEffect(() => registerFileViewSave(fileViewPanelId(path), save), [path, save])

  if (!map)
    return (
      <div role="status" className="text-muted flex size-full items-center justify-center text-xs">
        {error ?? t('game.inputMap.loading')}
      </div>
    )

  return (
    <div className="bg-surface text-text flex size-full min-h-0 flex-col">
      <header className="border-border bg-panel flex items-center gap-1.5 border-b p-(--sc-gutter)">
        {EDITOR_MODES.map(id => (
          <Chip
            key={id}
            label={t(`game.inputMap.mode.${id}`)}
            hint={t('game.inputMap.modeHint')}
            selected={mode === id}
            onClick={() => changeMode(id)}
          />
        ))}
        <span className="flex-1" />
        <Button variant="primary" onClick={() => void save()}>
          {t('game.inputMap.save')}
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-warning m-0 px-3 py-2 text-xs">
          {error}
        </p>
      )}
      {mode === 'simple' && <InputMapSimple map={map} onChange={changeMap} />}
      {mode === 'expert' && <InputMapExpert map={map} onChange={changeMap} />}
      {mode === 'json' && (
        <InputMapJson
          value={source}
          onChange={value => {
            revision.current += 1
            setSource(value)
            setModified(true)
            setError(null)
          }}
        />
      )}
    </div>
  )
}
