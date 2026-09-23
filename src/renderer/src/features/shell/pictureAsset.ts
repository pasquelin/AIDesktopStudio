import { bytesToBase64 } from '@shared/base64'
import type { Asset } from '@shared/domain/asset'
import type { KnownFormat } from '@shared/domain/formatCapability'
import { ORA_MERGED_PATH } from '@shared/domain/openRaster'
import type { StudioBridge } from '@shared/ipc'
import type { DocumentDraft } from '@shared/domain/document'
import { oraStackFromContent } from '@/engines/canvas/oraDocument'

/**
 * What an editor handed over, less the title — `CapturedDraft` as `documentIoAdapters` names it.
 *
 * Spelt from the shared contract rather than imported back from the adapters: this module is
 * what they call to write a picture, and borrowing the name would close a cycle.
 */
type Captured = Omit<DocumentDraft, 'title'>

/** The file a picture is written to, and what the row it lands in is to say about itself. */
export type AssetTarget = {
  replaces?: string
  derivedFrom?: string
  name: string
  format: KnownFormat
  folder?: string
  /**
   * Which document these bytes ARE, when the file written is that document's destination — §2.6.
   * 🛑 Absent for a COPY, whose own id would otherwise be the open document's: two files, one id.
   */
  documentId?: string
}

/** The container, stack and surfaces alike — what a document holding layers is written as. */
export async function layeredAsset(
  captured: Captured,
  target: AssetTarget,
  bridge: StudioBridge,
): Promise<Asset | null> {
  const stack = oraStackFromContent(captured.content)
  if (!stack) return null

  return await bridge.assets.saveLayered({
    ...target,
    document: { stack, surfaces: captured.parts ?? [] },
  })
}

/** The flatten alone — the one encoder the studio owns, whatever format it was asked for. */
export async function flatAsset(
  captured: Captured,
  target: AssetTarget,
  bridge: StudioBridge,
): Promise<Asset | null> {
  const merged = captured.parts?.find(one => one.path === ORA_MERGED_PATH)
  if (!merged) return null

  return await bridge.assets.savePicture({ ...target, png: bytesToBase64(merged.png) })
}
