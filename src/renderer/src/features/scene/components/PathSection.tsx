import { mdiPlus } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { resetTo } from '@/helpers/resetTo'
import { bezierPathOf, DEFAULT_PATH, type PathDescriptor } from '@shared/domain/scene'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { SliderField } from '@/components/SliderField'
import { ToggleField } from '@/components/ToggleField'
import { ToolButton } from '@/components/ToolButton'
import type { GestureProps } from '@/components/styles'
import { withPointAtEnd } from '@/engines/scene/cameraPath'
import { TIP_LEFT } from '@/helpers/tooltip'

/** Zero is angular, one is as round as a Catmull-Rom curve gets. */
const MAX_TENSION = 1

export type PathSectionProps = {
  path: PathDescriptor
  onChange: (path: PathDescriptor) => void
  gesture: GestureProps
}

/**
 * The shape of a rail. Its points are not listed as fields — three numbers each in a column is a
 * table nobody can aim with; they are dragged in the viewport, and this only ever adds one.
 */
export function PathSection({ path, onChange, gesture }: PathSectionProps) {
  const { t } = useTranslation()

  return (
    <PropertySection title={t('inspector.rail')} scId="rail">
      {/* Two shapes, two controls: a smooth rail bends by ONE number, a Bézier one by the pair of
          tangents every anchor carries — and those are dragged in the viewport, never typed. */}
      <ToggleField
        label={t('inspector.fields.handles')}
        scId="rail.handles"
        value={path.kind === 'bezier'}
        onChange={handles =>
          onChange(
            handles
              ? bezierPathOf(path.points, path.closed)
              : { ...DEFAULT_PATH, points: path.points, closed: path.closed },
          )
        }
      />
      {path.kind === 'catmullrom' && (
        <SliderField
          label={t('inspector.fields.tension')}
          scId="rail.tension"
          value={path.tension}
          min={0}
          max={MAX_TENSION}
          step={0.05}
          onChange={tension => onChange({ ...path, tension })}
          onReset={resetTo(path.tension, DEFAULT_PATH.tension, tension =>
            onChange({ ...path, tension }),
          )}
          {...gesture}
        />
      )}
      <ToggleField
        label={t('inspector.fields.closed')}
        scId="rail.closed"
        value={path.closed}
        onChange={closed => onChange({ ...path, closed })}
      />
      <PropertyRow label={t('inspector.pathPoints')}>
        <ToolButton
          icon={mdiPlus}
          label={t('inspector.addPathPoint')}
          description={t('inspector.addPathPointHint')}
          tooltip={TIP_LEFT}
          variant="header"
          onClick={() => onChange(withPointAtEnd(path))}
        />
      </PropertyRow>
    </PropertySection>
  )
}
