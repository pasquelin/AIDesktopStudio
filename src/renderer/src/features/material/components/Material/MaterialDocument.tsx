import { mdiTextureBox } from '@mdi/js'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { assetUrl, PICTURES, posterUrl, type Asset } from '@shared/domain/asset'
import type { CommandId } from '@shared/domain/command'
import { runMaterialCommand } from './materialCommands'
import { type MaterialExportTarget } from '@shared/domain/materialExport'
import { activation } from '@/helpers/activation'
import { cn } from '@/helpers/cn'
import { editPixelsOf } from '@/helpers/openAsset'
import { TIP_TOP } from '@/helpers/tooltip'
import { useExportMenu } from '@/hooks/useExportMenu'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useDocumentIsInFront } from '@/stores/documents'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { EmptyState } from '@/components/EmptyState'
import { loadTexture } from '@/engines/scene/textureCache'
import { MaterialRenderer } from '@/engines/material/MaterialRenderer'
import { inspectedChannel, useMaterialViews } from '@/stores/materialViews'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { isMaterialDirty, materialOf, useMaterials } from '@/stores/materials'
import { placeMaterialChannel } from '../placeChannel'
import { materialExportFiles } from '../../materialExportFiles'
import { MaterialToolbar } from './MaterialToolbar'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { useSettings } from '@/stores/settings'
import { customFrom, schemeFor } from '@shared/domain/navigationPreset'
import { useShelfRefresh } from '@/hooks/useShelfRefresh'
import { useSkyRefresh } from '@/hooks/useSkyRefresh'
import { useMountedEngine } from '@/hooks/useMountedEngine'
import { runDocumentExport } from '@/features/shell/components/documentExport'
import { assetsById, assetVersionOf, useAssets } from '@/stores/assets'
import { livePreviewOf } from '@/stores/livePreviews'
import { environmentDressOf } from '@/features/skybox/components/environmentDress'

/**
 * A material handed to an engine, from the row of the native menu that was picked.
 *
 * The port is reached through `import()` rather than at the top of this file. Not for the first
 * screen — `eager-graph.test.ts` says this component is not in the opening chunk — but for the
 * one after it: statically imported, `GLTFExporter` would be downloaded by anyone who opens a
 * material tab, and it is only ever read by somebody who exports one.
 */
async function exportMaterial(documentId: string, target: MaterialExportTarget): Promise<void> {
  await runDocumentExport(
    documentId,
    { kind: 'material', scope: 'material.export', label: target },
    // The baking is `materialExportFiles`, which the outside door shares — including its refusal
    // of a material with no channel, which throws before any dialog is raised.
    async (bridge, watch) =>
      bridge.material.export(await materialExportFiles(documentId, target, watch)),
  )
}

/**
 * The subject, under light, and nothing else. Every setting it shows lives in the inspector — the
 * shape it sits on and the sky that lights it included: a studio is where colours and finishes are
 * judged, and a control floating over the material is a control in the way of it.
 */
export function MaterialDocument({ documentId }: { documentId: string }) {
  const { t } = useTranslation()

  const texture = useMaterials(state => materialOf(state, documentId))
  const inspected = useMaterialViews(state => inspectedChannel(state, documentId))
  const active = useDocumentIsInFront(documentId)

  useDocumentTitle(
    documentId,
    useMaterials(state => isMaterialDirty(state, documentId)),
  )

  useRestoredDocument(documentId)

  // Channels and styles both push onto `useMaterials`, and until now nothing could pop it: no
  // scope, no key, no menu row — while the manual already promised ⌘Z on an applied style.
  const onCommand = useCallback(
    (command: CommandId): boolean => runMaterialCommand(documentId, command),
    [documentId],
  )

  useShortcuts({ scope: 'material', enabled: active, documentId, onCommand })

  useExportMenu(active, bridge =>
    bridge.menu.onMaterialExport(({ target }) => {
      void exportMaterial(documentId, target)
    }),
  )

  const { host, engine } = useMountedEngine(
    documentId,
    () =>
      new MaterialRenderer({
        loadTexture,
        assetVersion: assetVersionOf,
        livePreview: livePreviewOf,
        environmentDress: environmentDressOf,
      }),
    texture,
  )

  // The preview turns like the scene does: two rules in one window is what the setting's help
  // promises it is not — see `MaterialRenderer.setNavigationScheme`.
  const three = useSettings(state => state.settings.three)
  useEffect(() => {
    engine.current?.setNavigationScheme(schemeFor(three.navigationPreset, customFrom(three)))
    // `documentId` too: the engine is rebuilt when it changes, and the new one would open on
    // the studio's gestures while the scene turns by the chosen scheme.
  }, [documentId, engine, three])

  useShelfRefresh(() => engine.current?.refreshMaps())
  // The sky the preview NAMES moved: no asset id changed, so the shelf says nothing.
  useSkyRefresh(() => engine.current?.lightAgain())

  /**
   * A picture dropped on the viewport becomes the base colour. It is the one channel a texture
   * cannot be judged without, and the strip of the other seven is what the next step brings.
   */
  const onDrop = (asset: Asset): void => {
    placeMaterialChannel(documentId, asset)
  }

  const flat = inspected ? texture.channels[inspected] : undefined
  // One look-up for both the picture and the gesture over it: two subscriptions to a single
  // catalogue row are two re-renders of a viewport.
  const flatAsset = useAssets(state => (flat ? assetsById(state).get(flat.assetId) : undefined))
  const flatPoster = flat && ((flatAsset && posterUrl(flatAsset)) ?? assetUrl(flat.assetId))
  // Not this space: a texture is assembled here and painted in Images. Absent leaves the picture
  // there to be looked at and nothing more — an asset off the shelf, or one not on this disk.
  const editPixels = editPixelsOf(flatAsset)?.run

  return (
    <AssetDropTarget
      accepts={PICTURES}
      onDrop={onDrop}
      // No frame: see `ImageDocument`. The CHANNEL slots keep theirs — there the frame IS the
      // answer, because it says which of seven places the drop would land in.
      outlined={false}
      className="relative size-full"
    >
      {/* The renderer makes its own canvas in here — see `ViewportEngine.mount`. */}
      <div ref={host} className="absolute inset-0" />

      {/* Laid over the viewport rather than unmounting it: a WebGL context does not survive being
          rebuilt for a glance at a normal map, and the engine would reload all eight channels. */}
      {flat && (
        // A button rather than a frame: the picture on show is one double-click from the space
        // that repaints it, which is the last step of « take a model's texture out, edit it, and
        // the model follows ». The same gesture the shelf offers, so it is the same two words.
        <button
          type="button"
          disabled={!editPixels}
          {...TIP_TOP(t('assets.editPixels'), false, t('assets.editPixelsHint'))}
          {...(editPixels ? activation(editPixels) : {})}
          className={cn(
            'bg-viewport absolute inset-0 flex items-center justify-center border-none p-4',
            'cursor-pointer disabled:cursor-default',
          )}
        >
          <img
            src={flatPoster}
            alt=""
            // `pixelated`: a normal or a height map is inspected to be read, and a browser's
            // smoothing hides exactly the noise one is looking for.
            className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
          />
        </button>
      )}

      {!texture.channels.baseColor && !flat && (
        <div className="pointer-events-none absolute inset-0">
          <EmptyState icon={mdiTextureBox} message={t('material.dropSource')} />
        </div>
      )}

      {/* Last, so it stands over the flat channel above it: that one fills the viewport, and a
          bar drawn before it would be a bar nobody can reach while inspecting a map. */}
      <MaterialToolbar documentId={documentId} onFrame={() => engine.current?.resetView()} />
    </AssetDropTarget>
  )
}
