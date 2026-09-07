import { useMemo } from 'react'
import type { FieldDescriptor } from '@shared/domain/model'
import { generationCanvasSource } from '@shared/domain/generationComment'
import { fillEditFields, fillSourceFields } from '@/features/image/components/aiFields'
import {
  supportsGenerationComments,
  writtenGenerationComments,
} from '@/features/image/generationComments'
import type { GenerationInput } from '@/generation/generationInputs'
import type { FormValues } from '@/helpers/dynamicForm'
import { activeImageId, useDocuments } from '@/stores/documents'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'

export function useCommentedImageSources(
  fields: readonly FieldDescriptor[],
  inputs: readonly GenerationInput[],
): FormValues {
  const documentId = useDocuments(activeImageId)
  const annotated = useGenerationComments(
    state => writtenGenerationComments(generationCommentsOf(state, documentId)).length > 0,
  )
  const source = annotated && documentId ? generationCanvasSource(documentId) : null

  return useMemo(
    () => ({
      ...fillSourceFields(fields, inputs),
      ...(source && supportsGenerationComments(fields)
        ? fillEditFields(fields, { image: source })
        : {}),
    }),
    [fields, inputs, source],
  )
}
