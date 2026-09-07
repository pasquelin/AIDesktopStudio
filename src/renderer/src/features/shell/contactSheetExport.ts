import { orElse } from '@shared/promises'
import { isLocalPicture, type Asset } from '@shared/domain/asset'
import { contactSheetPdf, type SheetPicture } from '@shared/domain/contactSheet'
import { bytesToBase64 } from '@shared/base64'
import { fetchAsset } from '@/helpers/assetFetch'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'

/** Three across on A4 is what a sheet is looked at: wider and a face is no longer a face. */
const COLUMNS = 3

/**
 * The longest side a picture is reduced to before it goes in. A sheet is for CHOOSING, so a cell
 * of a few hundred points needs no more — forty 4K frames unreduced is a file nobody can send.
 */
const LONGEST_SIDE = 640

/** Between size and weight, and it is a contact sheet: the artefacts of 0.8 are not what is judged. */
const JPEG_QUALITY = 0.8

/**
 * One picture, reduced and re-encoded as the JPEG a PDF carries untouched.
 *
 * Through a canvas because that is the only encoder a window has, and `image/jpeg` because a PDF
 * takes those bytes as its stream — a PNG would need zlib, which nothing here ships.
 */
async function reduced(asset: Asset): Promise<SheetPicture | null> {
  const bitmap = await createImageBitmap(await (await fetchAsset(asset.id)).blob())

  try {
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return null

    return {
      jpeg: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
      caption: asset.name,
    }
  } finally {
    bitmap.close()
  }
}

/**
 * The chosen pictures as one PDF, wherever the save dialog lands.
 *
 * Answers the path, or `null` when the dialog was dismissed or nothing among the chosen assets
 * was a picture — a video has no frame to put on a sheet without decoding one first.
 */
export async function exportContactSheet(
  assets: readonly Asset[],
  title: string,
): Promise<string | null> {
  const bridge = getBridge()
  if (!bridge) return null

  try {
    // 🛑 Taken as they come rather than looked up: `useAssets` is capped at two hundred rows and
    // nothing scrolls it since the remote browser stopped listing local lines — a project past
    // that answered with an empty sheet, no dialog and no journal line.
    //
    // `isLocalPicture` and not the type alone: a library picture has no file behind it here, and
    // `fetchAsset` answers 404 for one — which used to cost the WHOLE sheet rather than its cell.
    const chosen = assets.filter(isLocalPicture)

    // One at a time: a bitmap is the decoded picture, and forty 4K ones alive at once is what a
    // browser drops a live viewport's context to make room for. One that will not decode costs
    // its own cell and nothing else.
    const pictures: SheetPicture[] = []
    for (const asset of chosen) {
      const picture = await orElse(reduced(asset), null)
      if (picture) pictures.push(picture)
    }

    if (pictures.length === 0) return null

    return await bridge.dialog.exportPicture(
      `${title}.pdf`,
      bytesToBase64(contactSheetPdf(pictures, COLUMNS)),
    )
  } catch (error) {
    reportFailure('assets.contactSheet', title, error)
    return null
  }
}
