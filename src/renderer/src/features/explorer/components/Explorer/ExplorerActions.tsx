import {
  mdiAlertOutline,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFileTreeOutline,
  mdiGamepadVariantOutline,
  mdiShapeOutline,
} from '@mdi/js'
import { INPUT_PRESET_IDS, type InputPresetId } from '@shared/domain/inputPresets'
import { useTranslation } from 'react-i18next'
import { MenuButton } from '@/components/MenuButton'
import { MenuRow } from '@/components/MenuRow'
import { ToolButton } from '@/components/ToolButton'
import { UiIcon } from '@/components/UiIcon'
import { HINT_LEFT, TIP_BOTTOM } from '@/helpers/tooltip'
import { createInputMapFromPreset } from '@/features/input/createInputMap'
import { useExplorerView } from '@/stores/explorerView'
import { useMedia } from '@/stores/media'
import { useTreeFolds } from '@/stores/treeFolds'
import { TreeFoldButton } from '@/components/TreeFoldButton'
import { reportFailure } from '@/services/diagnostics'

/**
 * The Explorer's own title row: how the folder is READ, and how much of it is shown.
 *
 * Three buttons and no more. The search bar rode here first, in the title row, and the screen
 * settled it: on the home's left column the field measured 76 px — « Rechercher… » cut to
 * « Rech… » — because the row already carries the panel's name, these three, and the way out.
 * It is the lesson the shelf carries in its own comment, a column further in: a bar belongs on
 * a title row only where that row is a band's, and this panel never lies in one.
 */
export function ExplorerActions() {
  const { t } = useTranslation()
  const ffmpeg = useMedia(state => state.capabilities.ffmpeg)
  const hidden = useExplorerView(state => state.hidden)
  const toggleHidden = useExplorerView(state => state.toggleExplorerHidden)
  const mode = useExplorerView(state => state.mode)
  const setMode = useExplorerView(state => state.setExplorerMode)
  const expanded = useTreeFolds(state => state.explorer.anyExpanded)
  const ask = useTreeFolds(state => state.ask)

  const createInputMap = async (preset: InputPresetId): Promise<void> => {
    try {
      await createInputMapFromPreset(preset)
    } catch (error) {
      reportFailure('document.save', preset, error)
    }
  }

  return (
    <>
      {/* An icon rather than the sentence, which is 65 characters and would chase the three
          readings out of the row; not a button, since nothing here can install ffmpeg. Focusable
          all the same: the tooltip is the only thing that shows the sentence. It followed the
          import here, the shelf's title row having lost it. */}
      {!ffmpeg && (
        <span
          role="img"
          tabIndex={0}
          className="text-warning inline-flex shrink-0 items-center rounded-(--radius-sc-sm)"
          {...TIP_BOTTOM(t('ingest.noFfmpeg'))}
        >
          <UiIcon path={mdiAlertOutline} size={14} />
        </span>
      )}
      <MenuButton
        icon={mdiGamepadVariantOutline}
        label={t('game.inputMap.create')}
        description={t('game.inputMap.createHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        rowCount={INPUT_PRESET_IDS.length}
        opensOnClick
        rows={close =>
          INPUT_PRESET_IDS.map(preset => (
            <MenuRow
              key={preset}
              label={t(`game.inputMap.preset.${preset}`)}
              tip={HINT_LEFT(t('game.inputMap.createHint'))}
              onSelect={() => {
                close()
                void createInputMap(preset)
              }}
            />
          ))
        }
      />
      {/* Two readings of one folder, and the pair is drawn as a pair: which one is on is what
          says the other exists at all. */}
      <ToolButton
        icon={mdiFileTreeOutline}
        label={t('explorer.byFolder')}
        description={t('explorer.byFolderHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={mode === 'folder'}
        accented={mode === 'folder'}
        onClick={() => setMode('folder')}
      />
      <ToolButton
        icon={mdiShapeOutline}
        label={t('explorer.byDomain')}
        description={t('explorer.byDomainHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={mode === 'domain'}
        accented={mode === 'domain'}
        onClick={() => setMode('domain')}
      />
      {/* The eye is the gesture every file browser draws for this, and what it reveals stays
          read-only: `.index/` and `.project.json` refuse every gesture, on both sides. */}
      <ToolButton
        icon={hidden ? mdiEyeOutline : mdiEyeOffOutline}
        label={t('explorer.hidden')}
        description={t('explorer.hiddenHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={hidden}
        onClick={toggleHidden}
      />
      {/* Last on purpose: the shell follows the actions with its separator and close button. */}
      <TreeFoldButton
        expanded={expanded}
        onFold={() => ask('explorer')}
        onUnfold={() => ask('explorer')}
      />
    </>
  )
}
