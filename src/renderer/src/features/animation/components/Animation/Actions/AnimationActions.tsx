import { mdiRecordCircleOutline, mdiRepeat } from '@mdi/js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { secondsToUs, usToSeconds, type Us } from '@shared/domain/time'
import { NumberField } from '@/components/NumberField'
import { SelectField } from '@/components/SelectField'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { ToolButton } from '@/components/ToolButton'
import { setTimelineSettings } from '@/engines/scene/animationCommands'
import { selectedNodes } from '@/engines/scene/sceneState'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { bonesOfNode, useModelFiles } from '@/stores/modelFiles'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneFrameHead, useSceneViews } from '@/stores/sceneViews'
import { TimelineTransport } from '../../../../timeline/components/Timeline/TimelineTransport'
import { AnimationActionsRenderButton } from './AnimationActionsRenderButton'
import { animationTools, runAnimationTool } from './animationTools'

export type AnimationActionsProps = {
  documentId: string
  /**
   * Whether this band writes a film. A workshop scene holds one character and nothing else — no
   * camera can be put in it — so the button would stand grey for ever rather than offer anything.
   */
  filmable?: boolean
}

/** What a band may be asked to last, in seconds — a frame at the low end, an hour at the top. */
const MIN_DURATION = 0.1
const MAX_DURATION = 3_600

const MIN_FPS = 1
const MAX_FPS = 120

/**
 * The transport and the settings of a scene's animation, drawn on the panel's own title bar —
 * the same place the montage puts its tools, and for the same reason: a band is short, and a
 * row of controls above it costs a row of keys.
 */
export function AnimationActions({ documentId, filmable = true }: AnimationActionsProps) {
  const { t } = useTranslation()
  const timeline = useScenes(state => sceneOf(state, documentId).animation)
  const nodes = useScenes(state => sceneOf(state, documentId).nodes)
  const selectedIds = useScenes(state => sceneOf(state, documentId).selectedIds)
  // Two narrow reads and the head at the FRAME: `setPlayhead` replaces the whole view sixty times
  // a second, and the timecode under it counts frames — 25 of them a second, not 60.
  const picked = useSceneViews(state => sceneViewOf(state, documentId).pickedBone)
  const playing = useSceneViews(state => sceneViewOf(state, documentId).playing)
  const head = useSceneFrameHead(documentId, timeline.fps)
  const autoKey = useAnimationViews(state => animationViewOf(state, documentId).autoKey)
  const looping = useAnimationViews(state => animationViewOf(state, documentId).looping)

  const anchor = selectedNodes(nodes, selectedIds).at(-1) ?? null
  const bones = useModelFiles(state => bonesOfNode(state, documentId, anchor?.id ?? ''))
  const [chosen, setChosen] = useState('')

  // The pose mode decides when it has picked one: clicking a bone in the viewport is a clearer
  // statement of intent than a picker two panels away, so it wins over what was chosen there.
  const bone = picked?.nodeId === anchor?.id ? (picked?.bone ?? chosen) : chosen

  const write = (settings: Partial<{ duration: Us; fps: number }>): void =>
    useScenes.getState().runCommand(documentId, setTimelineSettings(settings))

  // Typing is one gesture: a rate written digit by digit must cost one undo, not one per
  // keystroke — which is what the field's own comment promises.
  const gesture = {
    onGestureStart: () => useScenes.getState().beginGesture(documentId),
    onGestureEnd: () => useScenes.getState().endGesture(documentId),
  }

  // No box of its own: `PanelHeader` already lays its actions out — same gutter, same alignment,
  // and it is the one that knows whether this panel's row may take the free width (`fillActions`).
  // A second flex row inside it was what let this bar space its buttons three times wider than
  // the montage's, on controls of the very same gauge.
  return (
    <>
      <TimelineTransport
        playing={playing}
        time={head}
        fps={timeline.fps}
        onRewind={() => useSceneViews.getState().setPlayhead(documentId, 0)}
        onToggle={() => {
          const views = useSceneViews.getState()
          const view = sceneViewOf(views, documentId)
          // Rewound first when the head is already at the end: pressing Play there would stop on
          // the very frame it started, which reads as a button that does nothing.
          if (!view.playing && view.playhead >= timeline.duration) {
            views.setPlayhead(documentId, 0)
          }
          views.setPlaying(documentId, !view.playing)
        }}
      />
      <ToolButton
        icon={mdiRepeat}
        label={t('animation.loop')}
        description={t('animation.loopHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={looping}
        onClick={() => useAnimationViews.getState().setLooping(documentId, !looping)}
      />
      <ToolButton
        icon={mdiRecordCircleOutline}
        label={t('animation.autoKey')}
        description={t('animation.autoKeyHint')}
        tooltip={TIP_BOTTOM}
        variant="header"
        active={autoKey}
        onClick={() => useAnimationViews.getState().setAutoKey(documentId, !autoKey)}
      />
      {/* Bare, as the montage's own bar is: `PanelHeader` lays these actions out already, and a
          second furniture surface inside it draws a bar on the title row. */}
      <Toolbar
        orientation="horizontal"
        label={t('animation.tools')}
        className="border-none bg-transparent p-0 shadow-none"
        tools={animationTools({ nodes, selectedIds, animation: timeline })}
        onTool={id => runAnimationTool(documentId, id)}
      />

      <div className="flex-1" />

      {bones.length > 0 && (
        <SelectField
          layout="inline"
          label={t('animation.bone')}
          scId="animation.bone"
          value={bone}
          options={[
            { value: '', label: t('animation.wholeModel') },
            ...bones.map(name => ({ value: name, label: name })),
          ]}
          onChange={setChosen}
          className="max-w-32"
        />
      )}

      <div className="flex w-24 shrink-0 items-center">
        <NumberField
          label={t('animation.duration')}
          scId="animation.duration"
          value={usToSeconds(timeline.duration)}
          min={MIN_DURATION}
          max={MAX_DURATION}
          step={0.1}
          layout="inline"
          onChange={seconds => write({ duration: secondsToUs(seconds) })}
          {...gesture}
        />
      </div>
      <div className="flex w-24 shrink-0 items-center">
        <NumberField
          label={t('animation.fps')}
          scId="animation.fps"
          value={timeline.fps}
          min={MIN_FPS}
          max={MAX_FPS}
          step={1}
          layout="inline"
          onChange={fps => write({ fps })}
          {...gesture}
        />
      </div>

      {filmable && <AnimationActionsRenderButton documentId={documentId} />}
    </>
  )
}
