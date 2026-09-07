import type { SceneNode, SceneState } from '@/engines/scene/sceneState'

export type SceneDocumentState = Omit<SceneState, 'nodes'>

export type SceneDocumentCodecRequest =
  | { id: number; operation: 'encodeStart'; state: SceneDocumentState; documentId: string }
  | {
      id: number
      operation: 'encodeNodes'
      index: number
      nodes: readonly SceneNode[]
      done: boolean
    }
  | { id: number; cancel: true }

export type SceneDocumentCodecResponse =
  | { id: number; done: false; index: number; content: string }
  | { id: number; done: true; ok: true; chunks: number; characters: number }
  | { id: number; done: true; ok: false; error: string }

export const isSceneDocumentCancel = (
  request: SceneDocumentCodecRequest,
): request is Extract<SceneDocumentCodecRequest, { cancel: true }> => 'cancel' in request
