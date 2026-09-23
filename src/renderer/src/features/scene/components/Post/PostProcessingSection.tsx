import { mdiCompare, mdiRhombus, mdiRhombusOutline } from '@mdi/js'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  effectsForEngine,
  POST_CATEGORIES,
  POST_EFFECTS,
  type PostEffectId,
  type PostStack,
} from '@shared/domain/postProcessing'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import { ToolButton } from '@/components/ToolButton'
import { EmptyState } from '@/components/EmptyState'
import { postEffectFields } from '@/engines/scene/propertyFields'
import { postAt } from '@/engines/scene/animationEval'
import {
  addPostEffect,
  applyPostStack,
  duplicatePostEffect,
  keyPostParam,
  postChannelOf,
  postSubjectOf,
  removePostEffectWholly,
  reorderPostEffects,
  resetPostEffect,
  setPostEffectEnabled,
  setPostEnabled,
  setPostParam,
  unkeyPostParam,
  type PostTargetRef,
} from '@/engines/scene/postCommands'
import { postChannelName } from '@/helpers/channelNames'
import { newId } from '@/helpers/ids'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import type { SceneEdit } from '@/hooks/useSceneEdit'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import { HINT_LEFT, TIP_LEFT } from '@/helpers/tooltip'
import { choicesOf } from '../../../shell/components/unionChoices'
import { DescriptorSection } from '../../../../components/DescriptorSection'
import { PostPresetField } from './PresetField/PostPresetField'
import { PostStackList } from './Stack/PostStackList'

export type PostProcessingSectionProps = {
  documentId: string
  /** Whose composition this is — the scene's, or a camera that overrides it. */
  target: PostTargetRef
  /** What the panel shows and edits. Read by the caller, which knows where it lives. */
  stack: PostStack
  edit: SceneEdit
  title: string
}

/**
 * Generated from the catalogue: the rows come from the stack, the controls from `POST_EFFECTS`.
 * Adding an effect to the union is all it takes for it to appear with its own knobs.
 */
export function PostProcessingSection({
  documentId,
  target,
  stack,
  edit,
  title,
}: PostProcessingSectionProps) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const engine = useScenes(state => sceneOf(state, documentId).world.engine)

  const selected = stack.effects.find(effect => effect.id === selectedId) ?? null
  const subject = postSubjectOf(target)
  // Read once for the whole render: three store reads and a snap, where each field asking for
  // itself paid them again.
  const keying = sceneKeyingAt(documentId)
  // Through the evaluator the viewport draws with, so a keyed parameter shows the number that is
  // on screen rather than the one the document stores — the rule `lensAt` already sets.
  const shown = postAt(stack, keying.state.animation, subject, keying.at)
  const live = selected ? (shown.effects.find(one => one.id === selected.id) ?? null) : null
  const fields = useMemo(() => (live ? postEffectFields(live) : []), [live])

  /** The channels of the SELECTED effect, in one pass over the band rather than one per field. */
  const channels = useMemo(() => {
    const found = new Map<string, ReturnType<typeof postChannelOf>>()
    if (!selected) return found
    for (const name of Object.keys(POST_EFFECTS[selected.effect].params)) {
      found.set(name, postChannelOf(keying.state, target, selected.id, name))
    }
    return found
  }, [keying.state, selected, target])

  /**
   * What this DOCUMENT can compose, which is not the whole catalogue: the two engines build
   * different passes, and offering one the chain would silently leave out is offering nothing.
   * The rows already in the stack are untouched — a document is never made wrong by an engine.
   *
   * 🛑 The document's engine and not the MOUNTED one: what a viewport ended up on is held in a
   * plain registry nothing re-renders from, so reading it here would freeze whatever it happened
   * to say on the first render. A machine with no WebGPU adapter therefore still lists the
   * Advanced effects, which its chain then leaves out — the fallback says so in the journal.
   */
  const effects = useMemo(() => {
    const ordered = [...effectsForEngine(engine)].sort(
      (left, right) =>
        POST_CATEGORIES.indexOf(POST_EFFECTS[left].category) -
        POST_CATEGORIES.indexOf(POST_EFFECTS[right].category),
    )
    const named = choicesOf(ordered, 'postfx.effect_', t)
    return {
      ...named,
      options: named.options.map(option => ({
        ...option,
        group: t(`postfx.category_${POST_EFFECTS[option.value].category}`),
      })),
    }
  }, [engine, t])

  const run = edit.run

  const applyStack = useCallback(
    (next: PostStack) => {
      run(applyPostStack(target, next))
      setSelectedId(null)
    },
    [run, target],
  )

  /** Stable, so `PostStackRow`'s memo can actually bail out on a stack of ten. */
  const onRemove = useCallback(
    (id: string) => {
      run(removePostEffectWholly(sceneKeyingAt(documentId).state, target, id))
      setSelectedId(held => (held === id ? null : held))
    },
    [documentId, run, target],
  )
  const onDuplicate = useCallback(
    (id: string) => run(duplicatePostEffect(target, id)),
    [run, target],
  )
  const onReset = useCallback((id: string) => run(resetPostEffect(target, id)), [run, target])
  const onToggle = useCallback(
    (id: string, enabled: boolean) => run(setPostEffectEnabled(target, id, enabled)),
    [run, target],
  )
  const onReorder = useCallback(
    (order: readonly string[]) => run(reorderPostEffects(target, order)),
    [run, target],
  )

  /** The diamond that opens a channel on one parameter, and the state it reports. */
  const keyAction = (name: string): ReactNode => {
    const spec = selected ? POST_EFFECTS[selected.effect].params[name] : undefined
    if (!selected || !spec?.animatable) return null

    const channel = channels.get(name)
    const keyed = channel?.keys.some(key => key.time === keying.at) ?? false
    const value = live?.params[name]

    return (
      <ToolButton
        icon={keyed ? mdiRhombus : mdiRhombusOutline}
        label={keyed ? t('postfx.unkey') : t('postfx.key')}
        tooltip={TIP_LEFT}
        variant="row"
        told={keyed}
        onClick={() => {
          // Read again at press time: the head runs on the wall clock during playback.
          const now = sceneKeyingAt(documentId)
          const command = keyed
            ? unkeyPostParam(now.state, target, selected.id, name, now.at)
            : typeof value === 'number'
              ? keyPostParam(
                  now.state,
                  target,
                  selected.id,
                  name,
                  now.at,
                  value,
                  postChannelName(t, selected.effect, name),
                )
              : null
          if (command) run(command)
        }}
      />
    )
  }

  return (
    <>
      <PropertySection title={title} scId="postfx">
        <ToggleField
          label={t('postfx.enabled')}
          scId="postfx.enabled"
          value={stack.enabled}
          onChange={enabled => run(setPostEnabled(target, enabled))}
          actions={
            <ToolButton
              icon={mdiCompare}
              label={t('postfx.bypass')}
              description={t('postfx.bypassHint')}
              tooltip={TIP_LEFT}
              variant="row"
              acts
              // Held rather than toggled, and it never reaches the document: § 2 asks for a look
              // at what is underneath, not an edit ⌘Z would have to take back.
              onPointerDown={() => sceneEngineOf(documentId)?.setPostBypassed(true)}
              onPointerUp={() => sceneEngineOf(documentId)?.setPostBypassed(false)}
              onPointerLeave={() => sceneEngineOf(documentId)?.setPostBypassed(false)}
            />
          }
        />

        <PostPresetField title={title} stack={stack} onApply={applyStack} />

        {/* In the label column like every other line of the section: a `Tree` set loose in the
            body was the one block with no name and no rule beside it, and the eye lost the
            column halfway down the panel. `shape="wrap"` because a list is taller than a line. */}
        <PropertyRow label={t('postfx.stack')} shape="wrap">
          {stack.effects.length === 0 ? (
            <EmptyState icon={mdiRhombusOutline} message={t('postfx.emptyHint')} />
          ) : (
            <PostStackList
              stack={stack}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={onReorder}
              onToggle={onToggle}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onReset={onReset}
            />
          )}
        </PropertyRow>

        <SelectField
          label={t('postfx.addEffect')}
          scId="postfx.add"
          value={null}
          unnamedLabel={t('postfx.addEffect')}
          options={effects.options}
          onChange={(effect: PostEffectId) => {
            const id = newId()
            run(addPostEffect(target, effect, id))
            setSelectedId(id)
          }}
          hint={HINT_LEFT(t('postfx.addEffectHint'))}
        />
      </PropertySection>

      {selected && (
        <DescriptorSection
          title={t(`postfx.effect_${selected.effect}`)}
          scId={`postfx.${selected.effect}`}
          fields={fields}
          labelPrefix="postfx.param_"
          actionFor={keyAction}
          onChange={(name, value) => run(setPostParam(target, selected.id, name, value))}
          gesture={edit.gesture}
        />
      )}
    </>
  )
}
