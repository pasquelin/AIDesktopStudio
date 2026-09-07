import { mdiPuzzleOutline, mdiPuzzlePlusOutline, mdiTrashCanOutline } from '@mdi/js'
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ComponentType, JsonValue } from '@shared/domain/component'
import { COMPONENT_TYPES, descriptorOf } from '@shared/domain/componentRegistry'
import { PropertyLine } from '@/components/PropertyLine'
import { MenuButton } from '@/components/MenuButton'
import { MenuRow } from '@/components/MenuRow'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { ToolButton } from '@/components/ToolButton'
import { attachComponent, detachComponent, setComponentField } from '@/engines/scene/commands'
import { pickableNodesOf } from '@/engines/scene/playerModule'
import type { SceneNode } from '@/engines/scene/sceneState'
import { PANEL_GROUP_LABEL_WIDE } from '@/components/styles'
import { resetTo } from '@/helpers/resetTo'
import { HINT_RIGHT, TIP_BOTTOM, TIP_LEFT } from '@/helpers/tooltip'
import type { SceneEdit } from '@/hooks/useSceneEdit'
import { ComponentField } from './ComponentField'
import { ScriptProps } from './ScriptProps'

export type ComponentsSectionProps = {
  node: SceneNode
  /** The whole scene: a field that NAMES a node is offered the ones it may actually resolve to. */
  nodes: readonly SceneNode[]
  edit: SceneEdit
}

/**
 * What the selected object DOES while the game runs, as opposed to what it draws.
 *
 * Every row is derived from the descriptor that declares the component — nothing here knows what
 * a `Health` is. A component added to the registry appears in this panel without a line being
 * written, which is invariant 5 applied to gameplay.
 */
export function ComponentsSection({ node, nodes, edit }: ComponentsSectionProps) {
  const { t } = useTranslation()
  const held = node.components ?? []
  // 🛑 Memoised, and built ONLY where a field asks for a node: composed inline it walked every node
  // of the scene on each frame of a drag, for any object selected. Its own name is left out — an
  // arm filming itself frames nothing.
  const named = useMemo(() => {
    const asks = (node.components ?? []).some(one =>
      descriptorOf(one.type).fields.some(field => field.picks === 'node'),
    )
    if (!asks) return []
    return pickableNodesOf(nodes, node.id)
      .filter(one => one.id !== node.id)
      .map(one => one.name)
  }, [node.components, nodes, node.id])

  const available = COMPONENT_TYPES.filter(type => !held.some(one => one.type === type))

  const add = (type: ComponentType): void => edit.run(attachComponent(node.id, type))

  return (
    <PropertySection
      title={t('game.section.title')}
      scId="components"
      actions={
        <MenuButton
          icon={mdiPuzzlePlusOutline}
          label={t('game.section.add')}
          description={t('game.section.addHint')}
          tooltip={TIP_BOTTOM}
          variant="header"
          disabled={available.length === 0}
          rowCount={available.length}
          opensOnClick
          rows={close =>
            available.map(type => (
              <MenuRow
                key={type}
                label={t(descriptorOf(type).titleKey)}
                icon={mdiPuzzleOutline}
                tip={HINT_RIGHT(t(descriptorOf(type).descriptionKey))}
                onSelect={() => {
                  add(type)
                  close()
                }}
              />
            ))
          }
        />
      }
    >
      {held.length === 0 && (
        <>
          <QuietNote>{t('game.section.empty')}</QuietNote>
          <QuietNote>{t('game.section.emptyHint')}</QuietNote>
        </>
      )}

      {held.map(component => {
        const descriptor = descriptorOf(component.type)
        return (
          <Fragment key={component.type}>
            {/* The end column every other line of the panel keeps, so the detach button stands
              where a reset stands rather than wherever the name happens to end. */}
            <PropertyLine
              label={t(descriptor.titleKey)}
              root="div"
              name="none"
              className="mt-1"
              actions={
                <ToolButton
                  icon={mdiTrashCanOutline}
                  label={t('game.section.remove')}
                  description={t('game.section.removeHint')}
                  tooltip={TIP_LEFT}
                  variant="row"
                  onClick={() => edit.run(detachComponent(node.id, component.type))}
                />
              }
            >
              <span className={PANEL_GROUP_LABEL_WIDE}>{t(descriptor.titleKey)}</span>
            </PropertyLine>

            {descriptor.fields.map(field => {
              const fallback = descriptor.defaults[field.key]
              return (
                <ComponentField
                  key={field.key}
                  value={component[field.key]}
                  label={t(field.labelKey)}
                  field={field}
                  named={named}
                  fallback={fallback}
                  gesture={edit.gesture}
                  scId={`components.${component.type}.${field.key}`}
                  onReset={resetTo<JsonValue | undefined>(component[field.key], fallback, value =>
                    edit.run(
                      setComponentField(
                        node.id,
                        component.type,
                        field.key,
                        value ?? fallback ?? null,
                      ),
                    ),
                  )}
                  onChange={value =>
                    edit.run(setComponentField(node.id, component.type, field.key, value))
                  }
                />
              )
            })}

            {component.type === 'Script' && (
              <ScriptProps
                component={component}
                gesture={edit.gesture}
                onChange={props => edit.run(setComponentField(node.id, 'Script', 'props', props))}
              />
            )}
          </Fragment>
        )
      })}
    </PropertySection>
  )
}
