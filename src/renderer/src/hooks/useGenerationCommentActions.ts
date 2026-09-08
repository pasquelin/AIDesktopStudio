import { useGeneratorCommentSubmission } from '@/hooks/useGeneratorCommentSubmission'
import { reportFailure } from '@/services/diagnostics'
import { useGenerationComments } from '@/stores/generationComments'
import type { GenerationCommentActions } from '@/features/image/generationComments'

/** Gathered out of the document, which sits at the size guard's ceiling. */
export function useGenerationCommentActions(documentId: string): GenerationCommentActions {
  const update = useGenerationComments(state => state.update)
  const rename = useGenerationComments(state => state.rename)
  const remove = useGenerationComments(state => state.remove)
  const submit = useGeneratorCommentSubmission()

  return {
    onChange: (id, text) => update(documentId, id, text),
    onRename: (id, title) => rename(documentId, id, title),
    onRemove: id => remove(documentId, id),
    onGenerate: submit ? id => void submitted(submit, documentId, id) : undefined,
  }
}

/** A generation launched from one note: it has nowhere to report to but the journal. */
async function submitted(
  submit: NonNullable<ReturnType<typeof useGeneratorCommentSubmission>>,
  documentId: string,
  commentId: string,
): Promise<void> {
  try {
    await submit(documentId, commentId)
  } catch (error) {
    reportFailure('canvas.edit', documentId, error)
  }
}
