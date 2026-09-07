import { mdiFormatVerticalAlignBottom } from '@mdi/js'
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PANE_TOOLBAR_ASIDE } from '@/components/styles'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { tipFor } from '@/helpers/tooltip'
import { Separator } from '@/components/Separator'
import { ToggleMenu } from '@/components/ToggleMenu/ToggleMenu'
import { useSnapReading } from '@/hooks/useSnapReading'
import { useViewportSetting } from '@/hooks/useViewportSetting'
import { useSceneViews, sceneViewOf } from '@/stores/sceneViews'
import { SNAP_STEP_CONTROLS } from '../../sceneSnapControls'
import { SceneSnapPlay } from './SceneSnapPlay'
import { SceneSnapStepMenu } from './SceneSnapStepMenu'
import { SceneSnapSurfaceMenu } from './SceneSnapSurfaceMenu'
import { SceneSpeedControl } from '../SceneSpeedControl'

// The longest reading a control can show, so its box stops resizing under a dragged slider.
// By characters, which is exact here: every figure is drawn `tabular-nums`.
const widestOf = (labels: readonly string[]) =>
  labels.reduce((longest, label) => (label.length > longest.length ? label : longest), '')

export type SceneSnapBarProps = {
  documentId: string
  /** The session speed the wheel writes in flight, or `null` while nothing has moved it. */
  speed: number | null
  onSpeed: (speed: number) => void
}

/**
 * What one changes WHILE manipulating: how fast the camera moves, and what a drag lands on.
 *
 * Floating over the viewport rather than sitting on the tab strip: it belongs to the 3D document
 * and follows it from window to window, where the strip is the shell's and knows nothing of which
 * space is open. Same footing as `SceneCounters` and the navigation hint.
 */
export function SceneSnapBar({ documentId, speed, onSpeed }: SceneSnapBarProps) {
  const { t } = useTranslation()
  const { view, set } = useViewportSetting()
  const snapping = useSceneViews(state => sceneViewOf(state, documentId).snapping)

  const reading = useSnapReading(view.units)
  // 🛑 Held across renders: the step widths format every step of every kind — some thirty
  // readings — and a wheel notch or a dragged speed slider re-renders this bar at pointer rate.
  const stepped = useMemo(
    () =>
      SNAP_STEP_CONTROLS.map(control => ({
        control,
        widest: widestOf(
          [...control.steps, ...(control.divisions ?? [])].map(step =>
            reading(control.reads, step),
          ),
        ),
      })),
    [reading],
  )

  const toggle = (kind: keyof typeof snapping) =>
    useSceneViews.getState().setSceneSnap(documentId, kind, !snapping[kind])

  return (
    // The studio's own bar, laid horizontally — not a box of its own. Written by hand it had a
    // different radius, a different padding and no shadow, and read as a second kind of furniture
    // beside the tool column. Every control is two zones, so none of them is a `ToolbarItem`:
    // they all go through `extras`, which is what it is for.
    <Toolbar
      orientation="horizontal"
      label={t('snapBar.title')}
      className={PANE_TOOLBAR_ASIDE}
      extras={
        <>
          <SceneSpeedControl speed={speed} onSpeed={onSpeed} />

          <Separator />

          <ToggleMenu
            icon={mdiFormatVerticalAlignBottom}
            scId="snapBar.surface"
            label={t('snapBar.surface')}
            description={t('snapBar.surfaceHint')}
            tooltip={tipFor('horizontal')}
            pressed={snapping.surface}
            onToggle={() => toggle('surface')}
            value={t(view.snapSurfaceAlign ? 'snapBar.surfaceAligned' : 'snapBar.surfaceFlat')}
            widest={widestOf([t('snapBar.surfaceAligned'), t('snapBar.surfaceFlat')])}
            valueName={t('snapBar.surfaceSettings')}
            rowCount={2}
            rows={() => <SceneSnapSurfaceMenu view={view} onViewport={set} />}
          />

          {stepped.map(({ control, widest }) => (
            <Fragment key={control.kind}>
              <Separator />
              <ToggleMenu
                icon={control.icon}
                scId={`snapBar.${control.kind}`}
                label={t(control.labelKey)}
                description={t(control.descriptionKey)}
                tooltip={tipFor('horizontal')}
                pressed={snapping[control.kind]}
                onToggle={() => toggle(control.kind)}
                value={reading(control.reads, view[control.path])}
                widest={widest}
                valueName={t(control.stepsKey)}
                rowCount={control.steps.length}
                rows={close => (
                  <SceneSnapStepMenu
                    control={control}
                    unit={view.units}
                    value={view[control.path]}
                    // Arms it too: reaching for a step IS asking for that snap, and leaving the
                    // choice inert made every first use cost a second click. Arbitrage d'Alban —
                    // it is where this bar parts from Unreal, which leaves the toggle alone.
                    onChoose={step => {
                      set({ [control.path]: step })
                      useSceneViews.getState().setSceneSnap(documentId, control.kind, true)
                      close()
                    }}
                  />
                )}
              />
            </Fragment>
          ))}

          {/* Last, behind its own rule: starting a game is not one of the things one changes
              WHILE manipulating, and it is the only control of this bar that leaves the editor. */}
          <Separator />
          <SceneSnapPlay documentId={documentId} />
        </>
      }
    />
  )
}
