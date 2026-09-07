import { mdiPineTree, mdiPlus, mdiTerrain, mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { MenuButton } from '@/components/MenuButton'
import { MenuRow } from '@/components/MenuRow'
import { ToolButton } from '@/components/ToolButton'
import {
  addTerrain,
  addTerrainEdit,
  removeTerrain,
  removeTerrainEdit,
} from '@/engines/scene/reliefCommands'
import { addScatter, removeScatter } from '@/engines/scene/scatterCommands'
import { newId } from '@/helpers/ids'
import { HINT_RIGHT, TIP_BOTTOM } from '@/helpers/tooltip'
import { activeSceneId, useDocuments } from '@/stores/documents'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

/**
 * Add and delete, drawn on the panel's own title bar. Like the panel itself, it follows the
 * active tab; the stack is split off so its hooks never run without one.
 */
export function WorldActions() {
  const { t } = useTranslation()
  const documentId = useDocuments(activeSceneId)
  const armed = useSceneViews(state =>
    documentId ? sceneViewOf(state, documentId).armedWorld : null,
  )

  if (!documentId) return null

  const run = useScenes.getState().runCommand
  const arm = useSceneViews.getState().setArmedWorld

  const createTerrain = (): void => {
    const id = newId()
    run(documentId, addTerrain({ assetId: '' }, id))
    arm(documentId, { kind: 'relief', id, editId: 'sculpt' })
  }

  const createScatter = (): void => {
    const id = newId()
    run(documentId, addScatter(id))
    arm(documentId, { kind: 'scatter', id })
  }

  const createEdit = (): void => {
    if (armed?.kind !== 'relief') return
    const id = newId()
    run(documentId, addTerrainEdit(armed.id, id))
    arm(documentId, { kind: 'relief', id: armed.id, editId: id })
  }

  const remove = (): void => {
    if (!armed) return
    if (armed.kind === 'scatter') {
      run(documentId, removeScatter(armed.id))
      arm(documentId, null)
      return
    }
    if (armed.editId) run(documentId, removeTerrainEdit(armed.id, armed.editId))
    else run(documentId, removeTerrain(armed.id))
    const layers = sceneOf(useScenes.getState(), documentId).world.layers
    const still = layers.find(layer => layer.kind === 'relief' && layer.id === armed.id)
    if (armed.editId && still) arm(documentId, { kind: 'relief', id: armed.id, editId: null })
    else arm(documentId, null)
  }

  return (
    <>
      <MenuButton
        icon={mdiPlus}
        label={t('world.add')}
        description={t('world.addHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        rowCount={2}
        opensOnClick
        rows={close => (
          <>
            <MenuRow
              label={t('world.addTerrain')}
              icon={mdiTerrain}
              tip={HINT_RIGHT(t('world.addTerrainHint'))}
              onSelect={() => {
                createTerrain()
                close()
              }}
            />
            <MenuRow
              label={t('world.addScatter')}
              icon={mdiPineTree}
              tip={HINT_RIGHT(t('world.addScatterHint'))}
              onSelect={() => {
                createScatter()
                close()
              }}
            />
          </>
        )}
      />
      <ToolButton
        icon={mdiPlus}
        label={t('world.addEdit')}
        description={t('world.addEditHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        disabled={armed?.kind !== 'relief'}
        onClick={createEdit}
      />
      <ToolButton
        icon={mdiTrashCanOutline}
        label={t('world.remove')}
        description={t('world.removeHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        disabled={armed === null}
        onClick={remove}
      />
    </>
  )
}
