import type {
  GeometrySimplification,
  TextureCompression,
  TextureReduction,
} from '@shared/domain/gameExport'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import type { ExportDialogState } from '@/hooks/useExportDialogState'

export function SceneGameExportDialogVisualOptions({ state }: { state: ExportDialogState }) {
  const { t, options, setOptions } = state
  return (
    <>
      <h4 className="font-semibold">{t('game.export.visualTitle')}</h4>
      <ToggleField
        label={t('game.export.generateLods')}
        value={options.generateLods}
        onChange={generateLods => setOptions(current => ({ ...current, generateLods }))}
      />
      <SelectField
        label={t('game.export.geometryLabel')}
        value={options.geometrySimplification}
        options={state.geometryOptions}
        scId="game.export.geometry"
        onChange={(geometrySimplification: GeometrySimplification) =>
          setOptions(current => ({ ...current, geometrySimplification }))
        }
      />
      <SelectField
        label={t('game.export.compressionLabel')}
        value={options.textureCompression}
        options={state.textureCompressionOptions}
        scId="game.export.compression"
        onChange={(textureCompression: TextureCompression) =>
          setOptions(current => ({ ...current, textureCompression }))
        }
      />
      <SelectField
        label={t('game.export.reductionLabel')}
        value={options.textureReduction}
        options={state.textureReductionOptions}
        scId="game.export.reduction"
        onChange={(textureReduction: TextureReduction) =>
          setOptions(current => ({ ...current, textureReduction }))
        }
      />
    </>
  )
}
