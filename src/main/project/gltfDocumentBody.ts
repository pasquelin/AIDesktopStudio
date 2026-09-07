import {
  DOCUMENT_ID_KEY,
  DOCUMENT_KIND_KEY,
  STUDIO_METADATA_KEY,
  type DocumentFile,
} from '@shared/domain/document'
import { defaultSceneIndex, gltfStudioMetadata } from '@shared/domain/gltf'
import { isRecord } from '@shared/guards'

export function studioStamp(
  held: Record<string, unknown>,
  document: DocumentFile,
): Record<string, unknown> {
  return {
    ...held,
    ...(document.id ? { [DOCUMENT_ID_KEY]: document.id } : {}),
    [DOCUMENT_KIND_KEY]: document.kind,
  }
}

function studioExtrasFirst(held: unknown, studio: unknown): Record<string, unknown> {
  const extras: Record<string, unknown> = { [STUDIO_METADATA_KEY]: studio }
  for (const [key, value] of Object.entries(isRecord(held) ? held : {})) {
    if (key !== STUDIO_METADATA_KEY) extras[key] = value
  }
  return extras
}

function markedAsset(held: unknown, document: DocumentFile): Record<string, unknown> {
  return {
    ...(isRecord(held) ? held : {}),
    extras: studioExtrasFirst(isRecord(held) ? held.extras : undefined, studioStamp({}, document)),
  }
}

export function gltfBody(parsed: Record<string, unknown>, document: DocumentFile): string {
  const scenes: unknown[] = Array.isArray(parsed.scenes) ? parsed.scenes : []
  const at = defaultSceneIndex(parsed)
  const held = scenes[at]
  if (!isRecord(held)) return JSON.stringify(parsed)
  const { extras: heldExtras, ...restOfScene } = held
  const body: Record<string, unknown> = {
    asset: markedAsset(parsed.asset, document),
    scene: parsed.scene,
    scenes: scenes.map((other, index) =>
      index === at
        ? {
            extras: studioExtrasFirst(
              heldExtras,
              studioStamp(gltfStudioMetadata(parsed), document),
            ),
            ...restOfScene,
            ...(document.title ? { name: document.title } : {}),
          }
        : other,
    ),
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.hasOwn(body, key)) body[key] = value
  }
  return JSON.stringify(body)
}
