import { mdiTerrain } from '@mdi/js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { Tree } from '@/components/Tree'
import { VisibilityToggle } from '@/features/scene/components/VisibilityToggle'
import {
  reorderTerrainEdits,
  reorderTerrains,
  setTerrainEditEnabled,
  setTerrainEnabled,
} from '@/engines/scene/reliefCommands'
import { setScatterEnabled } from '@/engines/scene/scatterCommands'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { WorldRow } from './WorldRow'
import { worldNodeId, worldNodes } from './worldNodes'

export function WorldList({ documentId }: { documentId: string }) {
  const { t } = useTranslation()
  const layers = useScenes(state => sceneOf(state, documentId).world.layers)
  const armed = useSceneViews(state => sceneViewOf(state, documentId).armedWorld)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  const known = useRef(new Set<string>())

  const nodes = useMemo(() => worldNodes(layers), [layers])

  useEffect(() => {
    const fresh = layers.filter(layer => !known.current.has(layer.id))
    if (fresh.length === 0) return
    for (const layer of fresh) known.current.add(layer.id)
    setExpandedIds(current => new Set([...current, ...fresh.map(layer => layer.id)]))
  }, [layers])

  const labels = useMemo(
    () => ({
      visible: t('world.visible'),
      show: t('world.showHint'),
      hide: t('world.hideHint'),
      rename: t('world.rename'),
      locks: t('world.locks'),
      locksHint: t('world.locksHint'),
      lockSculpt: t('world.lockSculpt'),
      lockSculptHint: t('world.lockSculptHint'),
      lockPlacement: t('world.lockPlacement'),
      lockPlacementHint: t('world.lockPlacementHint'),
      lockEdit: t('world.lockEdit'),
      lockEditHint: t('world.lockEditHint'),
    }),
    [t],
  )

  if (layers.length === 0) {
    return <EmptyState icon={mdiTerrain} message={t('world.empty')} />
  }

  const run = useScenes.getState().runCommand
  const selectedId = armed
    ? armed.kind === 'relief'
      ? worldNodeId(armed.id, armed.editId)
      : armed.id
    : null

  const move = (id: string, parentId: string | null, index: number): void => {
    const node = nodes.find(one => one.id === id)
    if (!node) return
    if (node.kind === 'terrain' || node.kind === 'scatter') {
      if (parentId !== null) return
      const layerId = node.kind === 'scatter' ? node.scatter?.id : node.terrain?.id
      if (!layerId) return
      const order = layers.map(layer => layer.id).filter(one => one !== layerId)
      order.splice(index, 0, layerId)
      run(documentId, reorderTerrains(order))
      return
    }
    const edit = node.edit
    const terrain = node.terrain
    if (!edit || !terrain || parentId !== terrain.id) return
    const order = terrain.edits.map(one => one.id).filter(editId => editId !== edit.id)
    order.splice(index, 0, edit.id)
    run(documentId, reorderTerrainEdits(terrain.id, order))
  }

  return (
    <Tree
      nodes={nodes}
      label={t('panels.world')}
      selectedIds={selectedId ? [selectedId] : []}
      expandedIds={expandedIds}
      expandable={node => node.kind === 'terrain' && (node.terrain?.edits.length ?? 0) > 0}
      onToggle={id =>
        setExpandedIds(current => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
      onSelect={ids => {
        const id = ids.at(-1)
        const node = id ? nodes.find(one => one.id === id) : undefined
        const views = useSceneViews.getState()
        if (!node) {
          views.setArmedWorld(documentId, null)
          return
        }
        if (node.kind === 'scatter' && node.scatter) {
          views.setArmedWorld(documentId, { kind: 'scatter', id: node.scatter.id })
          return
        }
        if (node.terrain) {
          views.setArmedWorld(documentId, {
            kind: 'relief',
            id: node.terrain.id,
            editId: node.edit?.id ?? null,
          })
        }
      }}
      droppable={() => false}
      onInsert={(ids, parentId, index) => ids.forEach(id => move(id, parentId, index))}
      renderTrailing={row => {
        const enabled = row.node.edit
          ? row.node.edit.enabled
          : (row.node.scatter?.enabled ?? row.node.terrain?.enabled ?? true)
        return (
          <VisibilityToggle
            visible={enabled}
            label={labels.visible}
            description={enabled ? labels.hide : labels.show}
            onToggle={() => {
              if (row.node.edit && row.node.terrain) {
                run(
                  documentId,
                  setTerrainEditEnabled(
                    row.node.terrain.id,
                    row.node.edit.id,
                    !row.node.edit.enabled,
                  ),
                )
                return
              }
              if (row.node.scatter) {
                run(documentId, setScatterEnabled(row.node.scatter.id, !row.node.scatter.enabled))
                return
              }
              if (row.node.terrain) {
                run(documentId, setTerrainEnabled(row.node.terrain.id, !row.node.terrain.enabled))
              }
            }}
          />
        )
      }}
      renderRow={row => (
        <WorldRow
          documentId={documentId}
          node={row.node}
          labels={labels}
          renaming={renaming === row.node.id}
          onRename={() => setRenaming(row.node.id)}
          onRenamed={() => setRenaming(null)}
        />
      )}
    />
  )
}
