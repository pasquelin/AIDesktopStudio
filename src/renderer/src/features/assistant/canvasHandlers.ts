import { refused, type ActionOutcome } from '@shared/domain/assistant'
import type { Target } from '@shared/domain/target'
import {
  type LayerLocks,
  type Transform as LayerTransform,
  allLayers,
  layerById,
  canMoveLayer,
  GUIDE_AXES,
  type CanvasState,
  type Guide,
} from '@/engines/canvas/canvasState'
import type { Point } from '@/engines/core/geometry'
import {
  GENERATION_COMMENT_OUTLINE_MAX,
  GENERATION_COMMENT_TEXT_MAX,
} from '@shared/domain/generationComment'
import { isRecord } from '@shared/guards'
import { gridOf } from '@/engines/canvas/pixelGrid'
import {
  addGuide,
  cropToRect,
  flipImage,
  mergeDown,
  moveGuide,
  moveLayer,
  removeGuide,
  removeLayer,
  renameLayer,
  resizeCanvas,
  resizeImage,
  rotateImage,
  setLayerMask,
  setCanvasBitDepth,
  setCanvasColorMode,
  setCanvasDpi,
  ungroupLayer,
} from '@/engines/canvas/commands'
import type { Command } from '@/engines/core/history'
import { newId } from '@/helpers/ids'
import { turnPort } from '@/features/image/turnPort'
import { selectLayerIn } from '@/stores/canvases'
import type { ActionHandlers } from './actionHandler'
import { boolOf, numberOf, oneOf, textOf } from './actionInputs'
import {
  aimedLayer,
  editCanvas,
  editCanvasLayer,
  mountedCanvas,
  noSuchLayer,
  runCanvas,
  NO_IMAGE,
  type CanvasCommands,
} from './canvasHandlerContext'
import { CANVAS_LAYER_HANDLERS } from './canvasLayerHandlers'
import { CANVAS_PIXEL_HANDLERS } from './canvasPixelHandlers'
import { useGenerationComments, generationCommentsOf } from '@/stores/generationComments'
import { commentFor } from '@/features/image/generationComments'

/**
 * The layer stack, driven by value.
 *
 * Every one of these runs a command of `engines/canvas/commands.ts` — the same ones the panels
 * run, so an edit made from outside undoes exactly like one made with the mouse.
 */

/** Whether any of a layer's three locks is on — all three off is what a fresh layer holds. */
const anyLock = (locked: LayerLocks): boolean => locked.pixels || locked.position || locked.alpha

/** Whether a layer sits where a fresh one does: unmoved, unscaled, unturned, unskewed. */
const placedFlat = (transform: LayerTransform): boolean =>
  transform.x === 0 &&
  transform.y === 0 &&
  transform.scaleX === 1 &&
  transform.scaleY === 1 &&
  transform.rotation === 0 &&
  transform.skewX === 0 &&
  transform.skewY === 0

function readState(): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)

  const grid = gridOf(open.state)
  return {
    ok: true,
    data: {
      documentId: open.documentId,
      width: open.state.width,
      height: open.state.height,
      dpi: open.state.dpi,
      colorMode: open.state.colorMode,
      bitDepth: open.state.bitDepth,
      // Derived rather than stored, and the only thing a client needs in order to place a cell:
      // asked to work it out from a size and a cell, a model gets it wrong one time in three.
      ...(grid === null ? {} : { pixelArt: grid }),
      activeLayerId: open.state.activeLayerId,
      guides: open.state.guides,
      generationComments: generationCommentsOf(useGenerationComments.getState(), open.documentId),
      // Flattened: a client that had to walk a tree to find a layer id would walk it wrong the
      // first time a group was collapsed.
      /**
       * 🛑 A value AT ITS DEFAULT is left out, and absent reads as that default: a layer is drawn,
       * whole, unlocked, blended normally, uncut and untransformed. `resultLine` cuts by whole
       * members and `layers` is the last one, so a stack of four spent 290 characters a layer
       * saying « unchanged » and came back cut before the one a sentence named.
       */
      layers: allLayers(open.state.layers).map(layer => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        ...(layer.visible ? {} : { visible: false }),
        ...(layer.opacity === 1 ? {} : { opacity: layer.opacity }),
        // The three that were written and never read: a client could raise `fillOpacity`, lock a
        // layer and carve a mask, and had no way of learning that any of it had taken.
        ...(layer.fillOpacity === 1 ? {} : { fillOpacity: layer.fillOpacity }),
        ...(anyLock(layer.locked) ? { locked: layer.locked } : {}),
        ...(layer.mask ? { mask: layer.mask } : {}),
        ...(layer.blend === 'normal' ? {} : { blend: layer.blend }),
        ...(layer.clipped ? { clipped: true } : {}),
        ...(placedFlat(layer.transform) ? {} : { transform: layer.transform }),
        ...(layer.kind === 'text'
          ? {
              text: layer.text,
              size: layer.size,
              align: layer.align,
              box: layer.box,
              font: layer.font,
            }
          : {}),
        ...(layer.kind === 'adjustment' ? { adjustment: layer.adjustment } : {}),
        ...(layer.kind === 'shape'
          ? { shape: layer.shape, fill: layer.fill, stroke: layer.stroke }
          : {}),
      })),
    },
  }
}

function setDocumentProperties(input: Record<string, unknown>): ActionOutcome {
  const dpi = numberOf(input, 'dpi')
  const colorMode = oneOf(input, 'colorMode', ['rgb', 'grayscale'])
  const bitDepth = oneOf(input, 'bitDepth', [8, 16, 32])
  const named = dpi !== null || colorMode !== null || bitDepth !== null
  if (!named || (dpi !== null && dpi < 1))
    return refused('badInput', 'name at least one valid document property')

  return editCanvas(
    () => [
      ...(dpi === null ? [] : [setCanvasDpi(dpi)]),
      ...(colorMode === null ? [] : [setCanvasColorMode(colorMode)]),
      ...(bitDepth === null ? [] : [setCanvasBitDepth(bitDepth)]),
    ],
    'this call changes no document property',
  )
}

function pointOf(value: unknown): Point | null {
  if (!isRecord(value)) return null
  const x = value.x
  const y = value.y
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : null
}

function commentOutlineOf(input: Record<string, unknown>): readonly Point[] | null {
  const value = input.outline
  if (value === undefined) return null
  if (!Array.isArray(value)) return null
  const points = value.map(pointOf)
  if (
    points.length < 3 ||
    points.length > GENERATION_COMMENT_OUTLINE_MAX ||
    !points.every((point): point is Point => point !== null)
  ) {
    return null
  }
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return next ? sum + point.x * next.y - next.x * point.y : sum
  }, 0)
  return area === 0 ? null : points
}

function generationCommentInput(
  input: Record<string, unknown>,
  width: number,
  height: number,
): { at: Point; text: string; outline: readonly Point[] | null } | null {
  const x = numberOf(input, 'x')
  const y = numberOf(input, 'y')
  const text = textOf(input, 'text')?.trim() ?? ''
  const outline = commentOutlineOf(input)
  const inside = (point: Point): boolean =>
    point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height
  if (
    x === null ||
    y === null ||
    text.length === 0 ||
    text.length > GENERATION_COMMENT_TEXT_MAX ||
    !inside({ x, y }) ||
    (input.outline !== undefined && (!outline || !outline.every(inside)))
  ) {
    return null
  }
  return { at: { x, y }, text, outline }
}

function addGenerationComment(input: Record<string, unknown>): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)
  const comment = generationCommentInput(input, open.state.width, open.state.height)
  if (!comment) {
    return refused(
      'badInput',
      `x and y must sit inside the image, text must not be empty, and outline — when named — must enclose an area with 3 to ${GENERATION_COMMENT_OUTLINE_MAX} finite {x, y} points`,
    )
  }

  const namedLayerId = textOf(input, 'layerId')
  if (namedLayerId && !layerById(open.state, namedLayerId)) {
    return refused('notFound', noSuchLayer(namedLayerId))
  }
  const commentId = newId()
  useGenerationComments.getState().add(open.documentId, {
    ...commentFor(commentId, comment.at, namedLayerId),
    text: comment.text,
    ...(comment.outline ? { outline: comment.outline } : {}),
  })
  return { ok: true, data: { commentId } }
}

function updateGenerationComment(input: Record<string, unknown>): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)
  const commentId = textOf(input, 'commentId') ?? ''
  const text = textOf(input, 'text')?.trim() ?? ''
  const comments = generationCommentsOf(useGenerationComments.getState(), open.documentId)
  if (!comments.some(comment => comment.id === commentId)) {
    return refused('notFound', `no generation comment "${commentId}" in the image in front`)
  }
  if (text.length === 0 || text.length > GENERATION_COMMENT_TEXT_MAX) {
    return refused('badInput', `text must contain 1 to ${GENERATION_COMMENT_TEXT_MAX} characters`)
  }

  useGenerationComments.getState().update(open.documentId, commentId, text)
  return { ok: true }
}

function removeGenerationComment(input: Record<string, unknown>): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)
  const commentId = textOf(input, 'commentId') ?? ''
  const comments = generationCommentsOf(useGenerationComments.getState(), open.documentId)
  if (!comments.some(comment => comment.id === commentId)) {
    return refused('notFound', `no generation comment "${commentId}" in the image in front`)
  }

  useGenerationComments.getState().remove(open.documentId, commentId)
  return { ok: true }
}

function generationComment(input: Record<string, unknown>): ActionOutcome {
  switch (oneOf(input, 'action', ['add', 'update', 'remove'])) {
    case 'add':
      return addGenerationComment(input)
    case 'update':
      return updateGenerationComment(input)
    case 'remove':
      return removeGenerationComment(input)
    default:
      return refused('badInput', 'action wants one of: add, update, remove')
  }
}

export function layerTargets(): readonly Target[] {
  const open = mountedCanvas()
  if (!open) return []

  return allLayers(open.state.layers)
    .map((layer): Target => ({
      id: layer.id,
      kind: 'layer',
      name: layer.name,
      selected: layer.id === open.state.activeLayerId,
    }))
    .reverse()
}

export function selectLayer(input: Record<string, unknown>): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)

  const named = textOf(input, 'layerId')
  const layer = aimedLayer(open.state, named)
  if (!layer) return refused('notFound', noSuchLayer(named))

  // Not a command: arming a layer is a way of looking at the stack, not an edit of it.
  selectLayerIn(open.documentId, layer.id)
  return { ok: true }
}

function resize(input: Record<string, unknown>): ActionOutcome {
  const width = numberOf(input, 'width')
  const height = numberOf(input, 'height')
  if (width === null || height === null)
    return refused('badInput', '"width" and "height" are both wanted, in pixels')

  return editCanvas(
    () => [
      boolOf(input, 'scalePixels')
        ? resizeImage(width, height)
        : resizeCanvas(width, height, { x: 0, y: 0 }),
    ],
    'this size built no resize',
  )
}

function crop(input: Record<string, unknown>): ActionOutcome {
  const x = numberOf(input, 'x')
  const y = numberOf(input, 'y')
  const width = numberOf(input, 'width')
  const height = numberOf(input, 'height')
  if (x === null || y === null || width === null || height === null)
    return refused('badInput', '"x", "y", "width" and "height" are all wanted, in pixels')

  return editCanvas(() => [cropToRect({ x, y, width, height })], 'this rectangle built no crop')
}

/**
 * The four document-wide turns. A quarter turn takes the document it runs on, because it turns
 * the PIXELS through that document's engine — the mirrors do not, a negative scale being the
 * whole of what they change.
 */
const TURNS: Record<string, (documentId: string) => Command<CanvasState>> = {
  flipHorizontal: () => flipImage('horizontal'),
  flipVertical: () => flipImage('vertical'),
  rotateClockwise: documentId => rotateImage(true, turnPort(documentId)),
  rotateAnticlockwise: documentId => rotateImage(false, turnPort(documentId)),
}

// A layer wearing no mask is refused rather than given a record with no pixels behind it:
// carving one is the engine's, through `canvas.maskFromSelection`.
function mask(input: Record<string, unknown>): ActionOutcome {
  const remove = boolOf(input, 'remove')
  const named = ['enabled', 'linked'].some(key => input[key] !== undefined)
  // Taking a mask away and saying what it does are two different calls: one of them would be
  // written into a record the other has just dropped.
  if (remove && named)
    return refused(
      'badInput',
      '"remove" cannot travel with "enabled" or "linked" — take the mask off in one call, set what it does in another',
    )

  return editCanvasLayer(
    input,
    layer => {
      if (!layer.mask || (!remove && !named)) return []

      return [
        setLayerMask(
          layer.id,
          remove
            ? undefined
            : {
                enabled:
                  input.enabled === undefined ? layer.mask.enabled : boolOf(input, 'enabled'),
                linked: input.linked === undefined ? layer.mask.linked : boolOf(input, 'linked'),
              },
        ),
      ]
    },
    'this layer wears no mask, or the call named none of remove, enabled, linked — canvas.state answers "mask" on the layers that carry one, and a mask is carved from a selection in the app',
  )
}

/** The guide named, so an id nobody answers to is a refusal rather than a command that writes
 * nothing. */
function editGuide(
  input: Record<string, unknown>,
  build: (guide: Guide) => CanvasCommands,
  nothing: string,
): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)

  const named = textOf(input, 'guideId') ?? ''
  const guide = open.state.guides.find(held => held.id === named)
  return guide
    ? runCanvas(open.documentId, build(guide), nothing)
    : refused(
        'notFound',
        `no guide "${named}" in the image in front — canvas.state answers "guides" with their ids`,
      )
}

/**
 * The document's grid, set in CELLS. Without a count only the mode changes; with one the document
 * is resized to `columns × cell` so the artwork measures what was asked for.
 *
 * 🛑 A resize drops the pixel history: a patch names its rectangle in its own surface's
 * coordinates, and `resurface` cannot carry those. Said in the action's description too.
 */
export const CANVAS_HANDLERS: ActionHandlers = {
  ...CANVAS_LAYER_HANDLERS,
  ...CANVAS_PIXEL_HANDLERS,
  'canvas.state': readState,
  'canvas.setDocumentProperties': setDocumentProperties,
  'img.pin': generationComment,
  'canvas.resize': resize,
  'canvas.crop': crop,
  'canvas.flipOrRotate': input => {
    const turn = TURNS[textOf(input, 'turn') ?? '']
    return turn
      ? editCanvas((_state, documentId) => [turn(documentId)], 'that turn built no command')
      : refused('badInput', `"turn" wants one of: ${Object.keys(TURNS).join(', ')}`)
  },
  'layer.remove': input =>
    editCanvasLayer(input, layer => [removeLayer(layer.id)], 'that layer built no removal'),
  'layer.select': selectLayer,
  'layer.rename': input => {
    const name = textOf(input, 'name')
    return name === null
      ? refused('badInput', '"name" is required — the new name of the layer')
      : editCanvasLayer(input, layer => [renameLayer(layer.id, name)], 'that layer built no rename')
  },
  'layer.reorderInStack': input => {
    const index = numberOf(input, 'index')
    if (index === null)
      return refused(
        'badInput',
        '"index" is required — the place among the new siblings, counted from 0',
      )

    const parentId = textOf(input, 'parentId')
    // `moveLayer` refuses a parent that is not a group, the layer itself, or one of its own
    // descendants by handing the state back untouched — all three would read as done.
    return editCanvasLayer(
      input,
      (layer, state) =>
        canMoveLayer(state, layer.id, parentId) ? [moveLayer(layer.id, parentId, index)] : [],
      '"parentId" must name a group that is neither this layer nor one of its own children — canvas.state answers "layers" with each one\'s "kind"',
    )
  },
  'layer.ungroup': input =>
    editCanvasLayer(input, layer => [ungroupLayer(layer.id)], 'that layer built no ungroup'),
  'layer.mergeDown': input =>
    editCanvasLayer(input, layer => [mergeDown(layer.id)], 'that layer built no merge'),
  'layer.setMaskOptions': mask,

  'guide.add': input => {
    const open = mountedCanvas()
    const axis = oneOf(input, 'axis', GUIDE_AXES)
    if (!open) return refused('wrongSurface', NO_IMAGE)
    if (!axis) return refused('badInput', `"axis" wants one of: ${GUIDE_AXES.join(', ')}`)

    const guide = { id: newId(), axis, position: numberOf(input, 'position') ?? 0 }
    const outcome = runCanvas(open.documentId, [addGuide(guide)], 'that guide built no command')
    return outcome.ok ? { ok: true, data: { guideId: guide.id } } : outcome
  },

  'guide.move': input =>
    editGuide(
      input,
      guide => [moveGuide(guide.id, numberOf(input, 'position') ?? guide.position)],
      'that guide built no move',
    ),

  'guide.remove': input =>
    editGuide(input, guide => [removeGuide(guide.id)], 'that guide built no removal'),
}
