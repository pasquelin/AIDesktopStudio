import { useTranslation } from 'react-i18next'
import { degreesOf, toRadians } from '@shared/domain/angles'
import type { DisplayUnit, Transform, Vector3 } from '@shared/domain/scene'
import { PropertySection } from '@/components/PropertySection'
import { TextField } from '@/components/TextField'
import { VectorField } from '@/components/VectorField'
import { batch, renameNode, setTransform, withAxisHeld } from '@/engines/scene/commands'
import {
  axisIsLocked,
  hasChildren,
  IDENTITY_TRANSFORM,
  rotationShows,
  type AxisLock,
  type SceneNode,
} from '@/engines/scene/sceneState'
import { displayStep, fromDisplayLength, shownLength } from '@shared/domain/units'
import { changedFields } from '@/helpers/objects'
import { HINT_LEFT } from '@/helpers/tooltip'
import type { SceneEdit } from '@/hooks/useSceneEdit'
import { useViewportSetting } from '@/hooks/useViewportSetting'

/** A field reports a whole vector; this is the axes of it that actually moved. */
type AxisPatch = { [K in keyof Transform]?: Partial<Vector3> }

const AXES: readonly (keyof Vector3)[] = ['x', 'y', 'z']

/** The axes a field reported, back in what the document holds. Only those, which is the point. */
function inMetres(shown: Partial<Vector3>, unit: DisplayUnit): Partial<Vector3> {
  const held: Partial<Vector3> = {}
  for (const axis of AXES) {
    const value = shown[axis]
    if (value !== undefined) held[axis] = fromDisplayLength(value, unit)
  }
  return held
}

function radiansOf(axes: Partial<Vector3>): Partial<Vector3> {
  const out: Partial<Vector3> = {}
  for (const axis of AXES) {
    const value = axes[axis]
    if (value !== undefined) out[axis] = toRadians(value)
  }
  return out
}

function patched(target: Transform, patch: AxisPatch): Transform {
  return {
    position: { ...target.position, ...patch.position },
    rotation: { ...target.rotation, ...patch.rotation },
    scale: { ...target.scale, ...patch.scale },
  }
}

export type TransformSectionProps = {
  /** The anchor: what the fields read out, and the only node the name applies to. */
  node: SceneNode
  /** Every node of the document: only they say whether anything hangs under the anchor. */
  nodes: readonly SceneNode[]
  /** What a moved axis writes to — the anchor included. */
  selection: readonly SceneNode[]
  /** The axes held still, across the whole document; the rows read the anchor's out of it. */
  lockedAxes: readonly AxisLock[] | undefined
  edit: SceneEdit
}

/**
 * Where the node is, how it is turned and how big it is — the section every node has, mesh or
 * light. A light without it could only be placed by dragging the gizmo, which is no way to put
 * a key light exactly where the last one stood.
 *
 * A typed value is absolute and lands on every selected node, but only on the axis touched: three
 * cubes given a height keep the columns they stand in. A gizmo drag is the relative gesture, and
 * it goes through the viewport rather than through here.
 */
export function TransformSection({
  node,
  nodes,
  selection,
  lockedAxes,
  edit,
}: TransformSectionProps) {
  const { t } = useTranslation()
  const { transform } = node
  const degrees = degreesOf(transform.rotation)
  const unit = useViewportSetting().view.units
  const shownPosition = shownLength(transform.position, unit)
  // Any node of the selection, not the anchor alone: with a cube picked after a sprite, deciding
  // on the anchor would take the row away from a cube a typed angle does turn.
  const turns = selection.some(candidate =>
    rotationShows(candidate, () => hasChildren(nodes, candidate.id)),
  )

  /**
   * The anchor's own locks: a padlock is per node, and the row reads out the anchor. Held through
   * `apply` rather than a command — see `DocumentEdit.apply`.
   */
  const heldOn = (channel: keyof Transform): readonly (keyof Vector3)[] =>
    AXES.filter(axis => axisIsLocked({ lockedAxes }, node.id, channel, axis))

  const holdOn =
    (channel: keyof Transform) =>
    (axis: keyof Vector3, held: boolean): void =>
      edit.apply(state => withAxisHeld(state, { nodeId: node.id, channel, axis }, held))

  const move = (patch: AxisPatch): void =>
    edit.run(
      batch('transform', selection, candidate =>
        setTransform(candidate.id, patched(candidate.transform, patch)),
      ),
    )

  return (
    <PropertySection title={t('inspector.transform')} scId="transform">
      <TextField
        label={t('inspector.name')}
        value={node.name}
        onChange={name => edit.run(renameNode(node.id, name))}
        scId="transform.name"
        {...edit.gesture}
      />

      {/* The one field of the studio holding a LENGTH of the scene, so the display unit lands
          here and nowhere else — a rotation is in degrees and a scale is a ratio. */}
      <VectorField
        // The unit rides in the label, which is where every other bounded field of the studio
        // carries its own. It is also the fold button's name, and that is the trade: a reader
        // who has chosen millimetres has to be told which unit the three figures are in.
        label={t('inspector.position', { unit: t(`environment.unit_${unit}`) })}
        value={shownPosition}
        step={displayStep(unit)}
        // Compared in the unit SHOWN, then converted — never the other way round. A round trip
        // through millimetres is not exact for about one double in forty, so comparing after it
        // marked untouched axes as changed, and a typed height moved three cubes onto one column.
        onChange={next => move({ position: inMetres(changedFields(shownPosition, next), unit) })}
        scId="transform.position"
        // In the unit SHOWN, like the value beside it — the identity being zero, the two agree
        // whatever the unit, and converting says so rather than leaving it to be noticed.
        defaults={shownLength(IDENTITY_TRANSFORM.position, unit)}
        heldAxes={heldOn('position')}
        onHoldAxis={holdOn('position')}
        {...edit.gesture}
      />

      {/* INERT where `rotationShows` refuses, no longer absent: the panel keeps its shape from
          one node to the next, so an attribute is found where it was last seen. The viewport
          still withholds the handle, and the command still refuses the write. */}
      <VectorField
        label={t('inspector.rotation')}
        value={degrees}
        step={1}
        disabled={!turns}
        hint={turns ? undefined : HINT_LEFT(t('inspector.rotationInert'))}
        // Diffed in degrees, which is the unit the field reports: converting back to radians
        // first leaves the untouched axes a few ulps off, and those would then be written —
        // as the anchor's own angle — onto every other node of the selection.
        onChange={next => move({ rotation: radiansOf(changedFields(degrees, next)) })}
        scId="transform.rotation"
        // In DEGREES, the unit this field reports — the identity being zero, the two agree.
        defaults={turns ? degreesOf(IDENTITY_TRANSFORM.rotation) : undefined}
        heldAxes={heldOn('rotation')}
        onHoldAxis={holdOn('rotation')}
        {...edit.gesture}
      />

      <VectorField
        label={t('inspector.scale')}
        value={transform.scale}
        step={0.1}
        onChange={next => move({ scale: changedFields(transform.scale, next) })}
        scId="transform.scale"
        defaults={IDENTITY_TRANSFORM.scale}
        heldAxes={heldOn('scale')}
        onHoldAxis={holdOn('scale')}
        // The one row a padlock belongs on: locking a position would drag the node along a
        // diagonal through the origin, which is not a gesture anyone reaches for.
        lockable
        {...edit.gesture}
      />
    </PropertySection>
  )
}
