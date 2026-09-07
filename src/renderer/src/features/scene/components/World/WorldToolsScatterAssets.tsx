import { mdiClose } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { NumberField } from '@/components/NumberField'
import { PropertyLine } from '@/components/PropertyLine'
import { Row } from '@/components/Row'
import { ToolButton } from '@/components/ToolButton'
import { setScatterAssets } from '@/engines/scene/scatterCommands'
import { TIP_LEFT } from '@/helpers/tooltip'
import { useScenes } from '@/stores/scenes'
import type { ScatterLayer } from '@shared/domain/scene'

type Props = { documentId: string; scatter: ScatterLayer }

export function WorldToolsScatterAssets({ documentId, scatter }: Props) {
  const { t } = useTranslation()
  const run = useScenes.getState().runCommand

  return (
    <PropertyLine label={t('world.assets')} root="div">
      <div className="flex min-w-0 flex-col">
        {scatter.assets.map((entry, index) => (
          <Row
            key={entry.assetId}
            title={entry.assetId}
            actions={
              <NumberField
                label={entry.assetId}
                value={entry.weight}
                min={0}
                max={100}
                step={0.1}
                layout="inline"
                onChange={weight =>
                  run(
                    documentId,
                    setScatterAssets(
                      scatter.id,
                      scatter.assets.map((asset, at) =>
                        at === index ? { ...asset, weight } : asset,
                      ),
                    ),
                  )
                }
                actions={
                  <ToolButton
                    icon={mdiClose}
                    label={t('world.removeAsset')}
                    tooltip={TIP_LEFT}
                    onClick={() =>
                      run(
                        documentId,
                        setScatterAssets(
                          scatter.id,
                          scatter.assets.filter(asset => asset.assetId !== entry.assetId),
                        ),
                      )
                    }
                  />
                }
              />
            }
          />
        ))}
        <AssetDropTarget
          accepts={['mesh']}
          exclusive
          onDrop={asset =>
            run(
              documentId,
              setScatterAssets(scatter.id, [
                ...scatter.assets.filter(entry => entry.assetId !== asset.id),
                { assetId: asset.id, weight: 1 },
              ]),
            )
          }
          className="text-muted text-tiny min-w-0 rounded"
        >
          {t('world.dropAsset')}
        </AssetDropTarget>
      </div>
    </PropertyLine>
  )
}
