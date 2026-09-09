import { localizedError } from '@shared/localizedError'
import { writePsd, type Layer } from 'ag-psd'
import {
  ORA_MERGED_PATH,
  type OraDocument,
  type OraLayer,
  type OraNode,
} from '@shared/domain/openRaster'
import { psdBlendOf } from '@shared/domain/psdBlend'
import { blendOfComposite } from '@shared/domain/canvasBlend'

/**
 * Composed HERE, unlike `.ora`: a PSD carries raw pixels, and only this side decodes a PNG.
 */

async function bitmapOf(png: Uint8Array): Promise<ImageBitmap> {
  // `slice`, so the blob owns bytes nothing else is about to reuse: the snapshots come off one
  // shared read-back buffer, and a blob over it decodes whatever the next layer wrote.
  return createImageBitmap(new Blob([png.slice()], { type: 'image/png' }))
}

/** A layer's pixels on a canvas of their own, which is what `ag-psd` takes. */
function canvasOf(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d')
  if (!context) throw localizedError('psdContextMissing')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

type FlatLayer = { layer: OraLayer; visible: boolean; opacity: number }

/**
 * Every layer of the tree, BOTTOM first and groups folded away — a group's own visibility and
 * opacity ride down onto its children, which is all siblings can keep of one.
 */
function flatLayers(nodes: readonly OraNode[], visible: boolean, opacity: number): FlatLayer[] {
  return [...nodes]
    .reverse()
    .flatMap(node =>
      node.kind === 'group'
        ? flatLayers(node.children, visible && node.visible, opacity * node.opacity)
        : [{ layer: node, visible: visible && node.visible, opacity: opacity * node.opacity }],
    )
}

/**
 * The bytes of a `.psd`. GROUPS flatten away, as the registry says: their children arrive as
 * siblings, rather than staying inside a group nothing here walks into.
 */
export async function psdBytesOf({ stack, surfaces }: OraDocument): Promise<Uint8Array> {
  const byPath = new Map(surfaces.map(one => [one.path, one.png]))

  const children = []
  for (const { layer, visible, opacity } of flatLayers(stack.nodes, true, 1)) {
    const png = byPath.get(layer.src)
    if (!png) continue

    children.push({
      name: layer.name,
      opacity,
      hidden: !visible,
      // The table answers a name of this very union; `shared/` spells it as text rather than
      // importing the package's type, which would tie the domain to the writer it feeds.
      blendMode: psdBlendOf(blendOfComposite(layer.composite)) as Layer['blendMode'],
      left: layer.x,
      top: layer.y,
      canvas: canvasOf(await bitmapOf(png)),
    })
  }

  // The flatten as the document's own composite. Without it `ag-psd` writes a field of zeros, and
  // every reader that shows the composite rather than re-compositing — Preview, Finder — is black.
  const merged = byPath.get(ORA_MERGED_PATH)

  return new Uint8Array(
    writePsd({
      width: stack.width,
      height: stack.height,
      children,
      ...(merged ? { canvas: canvasOf(await bitmapOf(merged)) } : {}),
    }),
  )
}
