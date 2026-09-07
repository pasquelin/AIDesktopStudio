import { useCallback, useMemo, useRef, useState } from 'react'
import { setTransform } from '@/engines/scene/commands'
import { paintTerrainEditMask, sculptRelief } from '@/engines/scene/reliefCommands'
import { paintScatterMask } from '@/engines/scene/scatterCommands'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { EMPTY_STATS, sameStats, type SceneStats } from '@/engines/scene/sceneStats'
import { assetVersionOf } from '@/stores/assets'
import { livePreviewOf } from '@/stores/livePreviews'
import { useModelFiles } from '@/stores/modelFiles'
import { useProject } from '@/stores/project'
import { selectIn, useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { skeletonProfilesOf, useSkeletonProfiles } from '@/stores/skeletonProfiles'
import { environmentDressOf } from '@/features/skybox/components/environmentDress'
import {
  extractedModelDress,
  prepareExtractedModelDress,
  wornModelDress,
} from '@/features/material/modelDress'
import type { ScreenBox } from '@/engines/scene/marqueeSelection'
import {
  addPathPoint,
  appendPathPoint,
  editPath,
  movePathPoint,
  openNodeMenu,
  openPointMenu,
  recordTransform,
} from '../sceneRuntimeActions'
import { useMountedSceneRenderer, type RuntimeSetters } from './useMountedSceneRenderer'
import { loadGroundPaint, saveGroundPaint } from '@/features/scene/groundPaintAsset'
import type { GroundPaint } from '@shared/domain/groundPaint'

function sceneRendererFor(documentId: string, set: RuntimeSetters): SceneRenderer {
  const projectPath = useProject.getState().project?.path ?? null
  let pendingGroundPaint: { terrainId: string; paint: GroundPaint } | null = null
  let groundSave: Promise<boolean> = Promise.resolve(true)
  return new SceneRenderer({
    onSelect: (ids, mode) => selectIn(documentId, ids, mode),
    onTransform: moves => recordTransform(documentId, moves),
    onReliefSculpt: (terrainId, editId, chunks) =>
      useScenes.getState().runCommand(documentId, sculptRelief(terrainId, editId, chunks)),
    onReliefMask: (terrainId, editId, chunks) =>
      useScenes.getState().runCommand(documentId, paintTerrainEditMask(terrainId, editId, chunks)),
    onScatterMask: (scatterId, chunks) =>
      useScenes.getState().runCommand(documentId, paintScatterMask(scatterId, chunks)),
    onGroundPaint: (terrainId, paint) => {
      pendingGroundPaint = { terrainId, paint }
    },
    loadGroundPaint: terrainId => loadGroundPaint(documentId, terrainId),
    onReliefStrokeStart: () => useScenes.getState().beginGesture(documentId),
    onReliefStrokeEnd: () => {
      useScenes.getState().endGesture(documentId)
      if (!pendingGroundPaint) return
      const saved = pendingGroundPaint
      pendingGroundPaint = null
      groundSave = saveGroundAfter(groundSave, documentId, saved)
    },
    onClips: (id, clips, lengths) =>
      useModelFiles.getState().report(documentId, id, clips, lengths),
    onRig: (id, rig) => useModelFiles.getState().reportRig(documentId, id, rig),
    onCharacter: (id, _rig, extras) =>
      useModelFiles.getState().reportSockets(documentId, id, extras?.sockets ?? []),
    onMaterials: (id, count, names, parts, hasFileTextures, sourceIndices) =>
      useModelFiles
        .getState()
        .reportMaterials(documentId, id, count, names, parts, hasFileTextures, sourceIndices),
    profiles: skeletonProfilesOf(useSkeletonProfiles.getState(), projectPath),
    onProfile: profile =>
      projectPath && useSkeletonProfiles.getState().rememberSkeletonProfile(projectPath, profile),
    onClipFit: (id, key, fit) => useModelFiles.getState().reportClipFit(documentId, id, key, fit),
    onSelectBone: picked => useSceneViews.getState().setPickedBone(documentId, picked),
    onSelectPathPoint: picked => useSceneViews.getState().setPickedPathPoint(documentId, picked),
    onPathPoint: (picked, point) => movePathPoint(documentId, picked, point),
    onAddPathPoint: (id, index) => addPathPoint(documentId, id, index),
    onAppendPathPoint: (id, point) => appendPathPoint(documentId, id, point),
    onClosePath: id => editPath(documentId, id, path => ({ ...path, closed: true })),
    onCameraMoved: (id, transform) =>
      useScenes.getState().runCommand(documentId, setTransform(id, transform)),
    onContextMenu: id => openNodeMenu(documentId, id),
    onPathPointMenu: () => openPointMenu(documentId),
    onStats: (scene, selected) =>
      set.stats(held =>
        sameStats(held.scene, scene) && sameStats(held.selected, selected)
          ? held
          : { scene, selected },
      ),
    onMarquee: set.marquee,
    onNavigatingChange: set.navigating,
    onFlySpeedChange: set.flySpeed,
    onView: placement => useSceneViews.getState().setCamera(documentId, placement),
    onPane: pane => useSceneViews.getState().setActivePane(documentId, pane),
    assetVersion: assetVersionOf,
    livePreview: livePreviewOf,
    wornDress: wornModelDress,
    defaultModelDress: extractedModelDress,
    prepareModelDress: prepareExtractedModelDress,
    environmentDress: environmentDressOf,
  })
}

async function saveGroundAfter(
  previous: Promise<boolean>,
  documentId: string,
  saved: { terrainId: string; paint: GroundPaint },
): Promise<boolean> {
  await previous
  return await saveGroundPaint(documentId, saved.terrainId, saved.paint)
}

/** Owns the imperative renderer and translates its callbacks into document/view stores. */
export function useSceneRuntime(documentId: string) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<SceneRenderer | null>(null)
  const [live, setLive] = useState<SceneRenderer | null>(null)
  const [navigating, setNavigating] = useState(false)
  const [marquee, setMarquee] = useState<ScreenBox | null>(null)
  const [flySpeed, setFlySpeed] = useState<number | null>(null)
  const [stats, setStats] = useState<{ scene: SceneStats; selected: SceneStats }>({
    scene: EMPTY_STATS,
    selected: EMPTY_STATS,
  })

  const setters = useMemo(
    () => ({
      stats: setStats,
      marquee: setMarquee,
      navigating: setNavigating,
      flySpeed: setFlySpeed,
    }),
    [],
  )
  useMountedSceneRenderer(documentId, host, engine, setLive, setters, sceneRendererFor)

  const paneInHand = useCallback(() => engine.current?.activePane() ?? 0, [])
  const canAdd = useCallback(() => !engine.current?.flightHeld, [])
  return {
    host,
    engine,
    live,
    navigating,
    setNavigating,
    marquee,
    flySpeed,
    stats,
    paneInHand,
    canAdd,
  }
}
