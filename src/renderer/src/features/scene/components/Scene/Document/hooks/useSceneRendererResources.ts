import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { useCheckerTextures } from '@/hooks/useCheckerTextures'
import { useMaterialRefresh } from '@/hooks/useMaterialRefresh'
import { useShelfRefresh } from '@/hooks/useShelfRefresh'
import { useShippedCharacter } from '@/hooks/useShippedCharacter'
import { useSkyRefresh } from '@/hooks/useSkyRefresh'

/**
 * `models: false` for a document that IS the source of the file the shelf announces: the model
 * tab reading its own save back would lose the pose in hand and the picked bone.
 */
export function useSceneRendererResources(
  engine: { current: SceneRenderer | null },
  { models = true }: { models?: boolean } = {},
): void {
  useShelfRefresh(() => {
    // Models first: a holder about to be reloaded is not worth dressing again.
    if (models) engine.current?.refreshModels()
    engine.current?.refreshTextures()
  })
  useMaterialRefresh(materialIds => engine.current?.dressModels(materialIds))
  useSkyRefresh(() => engine.current?.lightAgain())
  useCheckerTextures()
  useShippedCharacter()
}
