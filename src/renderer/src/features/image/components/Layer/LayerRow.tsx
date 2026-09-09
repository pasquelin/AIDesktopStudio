import { mdiLockOpenVariantOutline, mdiLockOutline, mdiTrashCanOutline } from '@mdi/js'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuButton } from '@/components/MenuButton'
import { MenuRow } from '@/components/MenuRow'
import { Row } from '@/components/Row'
import { ToolButton } from '@/components/ToolButton'
import type { CanvasState, Layer } from '@/engines/canvas/canvasState'
import { removeLayer, renameLayer, setLayerLocks } from '@/engines/canvas/commands'
import type { Command } from '@/engines/core/history'
import { HINT_RIGHT, TIP_RIGHT } from '@/helpers/tooltip'
import { InlineRename } from '@/components/InlineRename'
import { ROW_WRAPPER } from '@/components/styles'
import { LAYER_LOCKS } from './layerLocks'
import { useCanvases } from '@/stores/canvases'

/**
 * Resolved by the list rather than per row — see `LayerList`. The eye's three are not here: it
 * lives in the tree's pinned column now, and the list hands them straight to it.
 */
type LayerRowLabels = {
  locks: string
  locksHint: string
  rename: string
  remove: string
  removeHint: string
}

export type LayerRowProps = {
  documentId: string
  layer: Layer
  labels: LayerRowLabels
  /**
   * False when the stack would keep nothing to paint on once this row leaves — its whole subtree,
   * for a group. Handed down rather than read here: it is a fact about the stack, and a row that
   * subscribed to it would re-render on every command, which is what the memo below avoids.
   */
  canRemove: boolean
  /** The name is being typed over. Held by the list: the menu that opens a rename sits there. */
  renaming: boolean
  onRename: () => void
  onRenamed: () => void
}

/**
 * Memoized, as `SceneNodeRow` is: layer identity survives every command that does not touch it,
 * so hiding one re-renders one row instead of the whole stack.
 *
 * The chevron and the indent belong to `Tree`, which owns the geometry of every stack in the
 * studio — this draws what is inside the row and nothing around it.
 */
export const LayerRow = memo(function LayerRow({
  documentId,
  layer,
  labels,
  canRemove,
  renaming,
  onRename,
  onRenamed,
}: LayerRowProps) {
  const { t } = useTranslation()
  const run = (command: Command<CanvasState>): void =>
    useCanvases.getState().runCommand(documentId, command)

  const locked = layer.locked.pixels || layer.locked.position || layer.locked.alpha

  return (
    // On the name and its buttons, never on the chevron or the eye — both of those sit outside
    // this element, and a double click meant for either is not a rename. One div, as
    // `SceneNodeRow` has: the wrapper around it lost its second child when the eye left the line.
    <div className={ROW_WRAPPER} onDoubleClick={onRename}>
      {renaming ? (
        <InlineRename
          value={layer.name}
          label={labels.rename}
          onCommit={name => {
            onRenamed()
            if (name !== layer.name) run(renameLayer(layer.id, name))
          }}
        />
      ) : (
        <Row
          title={layer.name}
          muted={!layer.visible}
          actions={
            <>
              <ToolButton
                icon={mdiTrashCanOutline}
                label={labels.remove}
                description={labels.removeHint}
                tooltip={TIP_RIGHT}
                variant="row"
                // The command does not refuse the last paintable layer — `deserializeCanvas`
                // rejects the empty stack that would follow — so the refusal is here, as it is
                // on the panel's own delete button.
                disabled={!canRemove}
                // Both, as `VisibilityToggle` does: `Tree` arms a row on POINTER DOWN, which
                // fires before the click — stopping the click alone would have let the delete
                // arm the row it is about to remove, moving the brush off whatever the user
                // was painting on.
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation()
                  run(removeLayer(layer.id))
                }}
              />
              <MenuButton
                icon={locked ? mdiLockOutline : mdiLockOpenVariantOutline}
                label={labels.locks}
                description={labels.locksHint}
                tooltip={TIP_RIGHT}
                variant="row"
                active={locked}
                // One button rather than three on the line: the row is 24 px tall in compact.
                rowCount={LAYER_LOCKS.length}
                opensOnClick
                rows={() =>
                  LAYER_LOCKS.map(padlock => (
                    <MenuRow
                      key={padlock.key}
                      label={t(padlock.labelKey)}
                      icon={padlock.iconFor(layer.locked[padlock.key])}
                      checked={layer.locked[padlock.key]}
                      tick="on-off"
                      tip={HINT_RIGHT(t(`${padlock.labelKey}Hint`))}
                      onSelect={() =>
                        run(
                          setLayerLocks(layer.id, {
                            ...layer.locked,
                            [padlock.key]: !layer.locked[padlock.key],
                          }),
                        )
                      }
                    />
                  ))
                }
              />
            </>
          }
        />
      )}
    </div>
  )
})
