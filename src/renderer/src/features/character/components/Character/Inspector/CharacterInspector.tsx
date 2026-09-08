import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HUMANOID_ROLES, isHumanoidRole, type HumanoidRole } from '@shared/domain/humanoid'
import type { DisplayUnit } from '@shared/domain/scene'
import { degreesOf, toRadians } from '@shared/domain/angles'
import { displayStep, fromDisplayLength, shownLength } from '@shared/domain/units'
import { IDENTITY_TRANSFORM, type Transform, type Vector3 } from '@shared/domain/transform'
import { Button } from '@/components/Button'
import { InlineRename } from '@/components/InlineRename'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { SelectField } from '@/components/SelectField'
import { VectorField } from '@/components/VectorField'
import {
  addCharacterBone,
  addCharacterHands,
  addCharacterIkChain,
  removeCharacterBone,
  removeCharacterIkChain,
  renameCharacterBone,
  setCharacterBoneRest,
  setCharacterBoneRole,
} from '@/engines/character/characterCommands'
import { restWithin } from '@/engines/character/boneRest'
import { rigHandBones } from '@/engines/scene/rigHandBones'
import type { MeshSample } from '@/engines/scene/rigSnap'
import { CharacterInspectorFit } from './CharacterInspectorFit'
import { CharacterInspectorMorphs } from './CharacterInspectorMorphs'
import { CharacterMotionSection } from '../Motion/CharacterMotionSection'
import { saveWorkshopMotion } from '@/character/characterMotion'
import { CharacterInspectorSockets } from './CharacterInspectorSockets'
import { characterOf, useCharacters } from '@/stores/character'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useViewportSetting } from '@/hooks/useViewportSetting'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { workshopIdOf } from '@shared/domain/character'
import { CharacterInspectorModel } from './CharacterInspectorModel'

export type CharacterInspectorProps = { assetId: string }

/**
 * What this character is made of — its bones, their roles, what reaches for what.
 *
 * Nothing of a scene: no transform, no shadow, no environment. That separation is the whole
 * reason a model opens on a tab of its own.
 *
 * 🛑 Takes the asset alone and reads the rest: the dock mounts this OUTSIDE the tab holding the
 * engine, so what only an engine can answer is asked of the registry — never handed down.
 */
export function CharacterInspector({ assetId }: CharacterInspectorProps) {
  const { t } = useTranslation()
  const documentId = workshopIdOf(assetId)
  const nodeId = useScenes(state => sceneOf(state, documentId).nodes[0]?.id) ?? ''
  const character = useCharacters(state => characterOf(state, assetId))
  const view = useCharacterView(state => characterViewOf(state, assetId))
  const picked = view.pickedBone
  const heldAxes = view.heldAxes
  const sample = view.sample
  const holdAxis = useCharacterView(state => state.holdCharacterAxis)
  const run = useCharacters(state => state.runCommand)
  const [renaming, setRenaming] = useState(false)
  // The studio's own unit, exactly as a scene's transform section reads it: a joint measured in
  // metres in one window and in centimetres in the other is two answers to one question.
  const unit = useViewportSetting().view.units

  const rig = character.rig
  const reaching = rig?.ik?.find(chain => chain.effector === picked)

  /** The same holds the gizmo obeys: what a padlock refuses, a keystroke must refuse too. */
  const restedAt = (next: Partial<Transform>): void => {
    if (!picked || !rig) return

    const rested = restOf(rig.bones, picked)
    const within = restWithin(rested, { ...rested, ...next }, heldAxes)
    run(assetId, setCharacterBoneRest(picked, within))
  }

  const moveBone = (shown: Vector3): void => restedAt({ position: inMetres(shown, unit) })
  const turnBone = (rotation: Vector3): void => restedAt({ rotation: radiansOf(rotation) })

  return (
    // On Tailwind's own scale rather than a number invented here, and wide enough for the one
    // row that decides it: three axis fields, their letters and the end column. At 320 px a
    // joint's offset read `-0` — the value cut, not the field.
    <>
      <CharacterInspectorModel
        assetId={assetId}
        documentId={documentId}
        nodeId={nodeId}
        sample={view.sample}
        unit={unit}
      />

      <PropertySection title={t('character.skeleton')} scId="character.skeleton">
        {!rig && <QuietNote>{t('inspector.rigStatus_staticMesh')}</QuietNote>}
        {rig && <QuietNote>{t('inspector.rigReady')}</QuietNote>}
        <CharacterInspectorFit
          assetId={assetId}
          documentId={documentId}
          nodeId={nodeId}
          sample={sample}
          hasRig={Boolean(rig)}
        />

        {rig && picked && (
          <>
            {/* Edited where it is read, on a double-click — the gesture every other name of
                  this studio answers, and the shape `AssetInspector` gives it.

                  🛑 Never a `TextField`, which is what a scene gives a NODE: a node is addressed
                  by its id, so renaming it on every keystroke is harmless, where a bone is
                  addressed by its NAME — the first letter typed renamed `Hips` to `H` and the
                  panel lost the joint it was editing. */}
            <PropertyRow label={t('inspector.boneName')}>
              {renaming ? (
                <InlineRename
                  value={picked}
                  label={t('inspector.boneName')}
                  gauge="inline"
                  onCommit={to => {
                    setRenaming(false)
                    run(assetId, renameCharacterBone(picked, to))
                  }}
                />
              ) : (
                // The hint explains rather than repeats — the name is already on screen, and
                // what is not is that a double-click opens it.
                <span
                  className="block w-full truncate"
                  onDoubleClick={() => setRenaming(true)}
                  {...HINT_LEFT(t('inspector.boneNameHint'))}
                >
                  {picked}
                </span>
              )}
            </PropertyRow>

            {/* The joint's own place and turn, in its parent's frame — the same fields a
                  scene gives a node, padlock and reset included: a knee put right by eye is a
                  knee nobody can put back, and a joint dragged freely drifts on every axis. */}
            <VectorField
              label={t('inspector.position', { unit: t(`environment.unit_${unit}`) })}
              value={shownLength(restOf(rig.bones, picked).position, unit)}
              step={displayStep(unit)}
              onChange={next => moveBone(next)}
              defaults={IDENTITY_TRANSFORM.position}
              heldAxes={heldAxes}
              onHoldAxis={(axis, held) => holdAxis(assetId, axis, held)}
              scId="character.bonePosition"
            />

            <VectorField
              label={t('inspector.rotation')}
              value={degreesOf(restOf(rig.bones, picked).rotation)}
              onChange={next => turnBone(next)}
              defaults={IDENTITY_TRANSFORM.rotation}
              heldAxes={heldAxes}
              onHoldAxis={(axis, held) => holdAxis(assetId, axis, held)}
              scId="character.boneRotation"
            />

            {/* The roles keep the standard's own spelling, untranslated: these are the
                  identifiers of the Mixamo set, and the mapping screen shows them as such. */}
            <SelectField
              label={t('inspector.boneRole')}
              value={roleOf(rig.bones, picked) ?? ''}
              options={[
                { value: '', label: t('inspector.boneNoRole') },
                ...HUMANOID_ROLES.map(role => ({ value: role, label: role })),
              ]}
              onChange={role => run(assetId, setCharacterBoneRole(picked, roleRead(role)))}
              scId="character.boneRole"
            />

            <Button onClick={() => run(assetId, addCharacterBone(picked))}>
              {t('inspector.addBone')}
            </Button>
            <Button onClick={() => run(assetId, removeCharacterBone(picked))}>
              {t('inspector.removeBone')}
            </Button>

            {/* A handle the joint reaches for: the bones above it turn to follow, which is what
                  puts a foot on the ground and a hand on a grip. */}
            {characterHandle(
              reaching?.id ?? null,
              () => run(assetId, removeCharacterIkChain(reaching?.id ?? '')),
              () => run(assetId, addCharacterIkChain(picked)),
              t,
            )}
          </>
        )}

        {characterHands(
          rig?.bones,
          () => run(assetId, addCharacterHands(measured(documentId, nodeId))),
          t,
        )}
      </PropertySection>

      <CharacterInspectorSockets assetId={assetId} rig={rig} />
      <CharacterInspectorMorphs assetId={assetId} documentId={documentId} nodeId={nodeId} />

      <CharacterMotionSection
        assetId={assetId}
        documentId={documentId}
        nodeId={nodeId}
        onSave={asNew => saveWorkshopMotion(assetId, asNew)}
      />
    </>
  )
}

function characterHandle(
  reachingId: string | null,
  remove: () => void,
  add: () => void,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return reachingId ? (
    <Button onClick={remove}>{t('inspector.removeHandle')}</Button>
  ) : (
    <Button onClick={add}>{t('inspector.addHandle')}</Button>
  )
}

function characterHands(
  bones: Parameters<typeof rigHandBones>[0] | undefined,
  add: () => void,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (!bones || !rigHandBones(bones)) return null
  return <Button onClick={add}>{t('inspector.addHands')}</Button>
}

function roleOf(
  bones: readonly { name: string; role?: HumanoidRole }[],
  bone: string,
): HumanoidRole | undefined {
  return bones.find(one => one.name === bone)?.role
}

/** Cast-free: an empty option means « fills none », and anything else is one of the fifty-two. */
function roleRead(value: string): HumanoidRole | null {
  return isHumanoidRole(value) ? value : null
}

/** Where a bone rests, or the identity for a name the rig has not got. */
function restOf(bones: readonly { name: string; rest: Transform }[], bone: string): Transform {
  return bones.find(one => one.name === bone)?.rest ?? IDENTITY_TRANSFORM
}

function inMetres(vector: Vector3, unit: DisplayUnit): Vector3 {
  return {
    x: fromDisplayLength(vector.x, unit),
    y: fromDisplayLength(vector.y, unit),
    z: fromDisplayLength(vector.z, unit),
  }
}

function radiansOf(vector: Vector3): Vector3 {
  return { x: toRadians(vector.x), y: toRadians(vector.y), z: toRadians(vector.z) }
}

/** What the mesh measures RIGHT NOW: a model that carries bones stopped being measured at load. */
function measured(documentId: string, nodeId: string): MeshSample | null {
  return nodeId ? (sceneEngineOf(documentId)?.meshSample(nodeId) ?? null) : null
}
