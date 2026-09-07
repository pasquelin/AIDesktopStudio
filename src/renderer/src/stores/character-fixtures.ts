import { characterStore } from './character'
import { useDocuments } from './documents'

/** Puts the store back as it was built, so a suite never inherits the previous one's. */
export function clearCharacters(): void {
  characterStore.resetForTests()
}

/**
 * A character tab in front, on the model an `assetId` names.
 *
 * Its own fixture rather than `installDocument`: that one reads the kind off the workspace, and
 * 3D opens three — a character would come back as a scene.
 */
export function installCharacterDocument(documentId: string, assetId: string): void {
  useDocuments.setState({
    documents: {
      [documentId]: {
        id: documentId,
        kind: 'character',
        workspace: '3d',
        title: assetId,
        // The model's own file, as `openCharacter` files it: this kind has none of its own.
        path: `Modelling/Models/${assetId}.glb`,
        sourceAssetId: assetId,
      },
    },
    activeId: documentId,
  })
}
