import { useMemo } from 'react'
import type { DocumentKind } from '@shared/domain/document'
import type { LinkOption } from '@/components/LinkField/linkOption'
import { documentsOfKind, useDocuments } from '@/stores/documents'

/**
 * What a slot OFFERS among the project's documents of one kind — the folder AND the tabs, so a
 * document saved but not open is offered.
 *
 * Selected APART and joined in a memo: a selector building the list would hand zustand a fresh
 * array on every notification, which is a render loop.
 */
export function useDocumentOptions(kind: DocumentKind): readonly LinkOption[] {
  const stored = useDocuments(state => state.stored)
  const open = useDocuments(state => state.documents)

  return useMemo(
    () =>
      documentsOfKind({ stored, documents: open }, kind).map(one => ({
        id: one.id,
        name: one.title,
      })),
    [stored, open, kind],
  )
}
