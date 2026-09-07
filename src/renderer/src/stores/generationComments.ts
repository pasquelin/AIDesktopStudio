import { create } from 'zustand'
import type { GenerationComment } from '@/features/image/generationComments'

type GenerationCommentsState = {
  comments: Record<string, readonly GenerationComment[]>
  add: (documentId: string, comment: GenerationComment) => void
  update: (documentId: string, id: string, text: string) => void
  remove: (documentId: string, id: string) => void
  removeSubmitted: (documentId: string, comments: readonly GenerationComment[]) => void
  clear: (documentId: string) => void
}

const NO_COMMENTS: readonly GenerationComment[] = []

export function generationCommentsOf(
  state: Pick<GenerationCommentsState, 'comments'>,
  documentId: string | null,
): readonly GenerationComment[] {
  return documentId === null ? NO_COMMENTS : (state.comments[documentId] ?? NO_COMMENTS)
}

export const useGenerationComments = create<GenerationCommentsState>()(set => ({
  comments: {},
  add: (documentId, comment) =>
    set(state => ({
      comments: {
        ...state.comments,
        [documentId]: [...(state.comments[documentId] ?? []), comment],
      },
    })),
  update: (documentId, id, text) =>
    set(state => ({
      comments: {
        ...state.comments,
        [documentId]: (state.comments[documentId] ?? []).map(comment =>
          comment.id === id ? { ...comment, text } : comment,
        ),
      },
    })),
  remove: (documentId, id) =>
    set(state => ({
      comments: {
        ...state.comments,
        [documentId]: (state.comments[documentId] ?? []).filter(comment => comment.id !== id),
      },
    })),
  removeSubmitted: (documentId, submitted) => {
    const removed = new Set(submitted)
    set(state => ({
      comments: {
        ...state.comments,
        [documentId]: (state.comments[documentId] ?? []).filter(comment => !removed.has(comment)),
      },
    }))
  },
  clear: documentId =>
    set(state => ({ comments: { ...state.comments, [documentId]: NO_COMMENTS } })),
}))
