// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inputMapOf, type InputMap } from '@shared/domain/inputMap'
import { FileEditor } from '@/components/FileEditor/FileEditor'
import { JsonSource } from '@/components/JsonSource'
import { getBridge } from '@/services/bridge'
import {
  inputMapsChanged,
  isDuplicateInputMapId,
  projectInputMaps,
} from '@/engines/code/projectInputMaps'
import { useFileDocument } from '@/hooks/useFileDocument'
import { InputMapExpert } from './InputMapExpert'
import { InputMapSimple } from './InputMapSimple'

export type InputMapView = 'simple' | 'expert' | 'json'
type InputMapDocumentProps = { path: string }

/** Read by the translation guard, which checks each view was given both its word and its line. */
export const INPUT_MAP_VIEWS: readonly InputMapView[] = ['simple', 'expert', 'json']

const readInputMap = async (path: string): Promise<InputMap | null> =>
  (await getBridge()?.inputMaps.read(path)) ?? null

const writeInputMap = async (path: string, map: InputMap): Promise<boolean> => {
  const written = await getBridge()?.inputMaps.write(path, map)
  // 🛑 The bridge has no change event, so without this a rebound `studio` map would only reach
  // the studio's own gamepad navigation once the project had been closed and opened again.
  if (written) inputMapsChanged()
  return written === true
}

export function InputMapDocument({ path }: InputMapDocumentProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<InputMapView>('simple')

  const duplicateOf = useCallback(
    async (map: InputMap): Promise<string | null> => {
      // 🛑 Asked of THIS id: `inputMapIdConflict` answers the first repeat of the project, so a
      // second pair elsewhere hid the one the author had just written. And asked AFTER the write,
      // from the disk — a Play is the only place that used to say it, and only once it had
      // already dropped every script of the project.
      return isDuplicateInputMapId(await projectInputMaps(), map.id)
        ? t('game.inputMap.duplicateId', { id: map.id })
        : null
    },
    [t],
  )

  const file = useFileDocument<InputMap>({
    path,
    read: readInputMap,
    write: writeInputMap,
    parse: inputMapOf,
    messages: {
      loadFailed: t('game.inputMap.loadFailed'),
      invalid: t('game.inputMap.invalid'),
      writeFailed: t('game.inputMap.writeFailed'),
    },
    afterSave: duplicateOf,
  })

  const map = file.value
  if (!map)
    return (
      <div role="status" className="text-muted flex size-full items-center justify-center text-xs">
        {file.error ?? t('game.inputMap.loading')}
      </div>
    )

  return (
    <FileEditor
      description={t('game.inputMap.documentDescription')}
      viewsLabel={t('game.inputMap.views')}
      views={INPUT_MAP_VIEWS.map(id => ({
        id,
        label: t(`game.inputMap.mode.${id}`),
        hint: t(`game.inputMap.viewHint.${id}`),
      }))}
      view={view}
      // What was typed becomes a value before the forms are asked to draw it; a text that parses
      // to nothing keeps the reader where the mistake is rather than showing a stale form.
      onView={next => (next === 'json' || file.adopt() ? setView(next) : undefined)}
      error={file.error}
      scId="input.view"
    >
      {view === 'simple' && <InputMapSimple map={map} onChange={file.change} />}
      {view === 'expert' && <InputMapExpert map={map} onChange={file.change} />}
      {view === 'json' && (
        <JsonSource
          value={file.source}
          label={t('game.inputMap.jsonLabel')}
          scId="input.source"
          onChange={file.changeSource}
        />
      )}
    </FileEditor>
  )
}
