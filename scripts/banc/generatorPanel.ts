import type { FieldDescriptor } from '@shared/domain/model'
import { partsOfRole, type AiRoleId } from '@shared/domain/aiRole'

import { registerGenerator, type GeneratorBridge } from '@/features/assistant/generatorBridge'
import { withBodyExtras } from '@/generation/bodyExtras'
import {
  landingChoiceOf,
  landingCreatesOf,
  landingSiblingsOf,
  type ArmedLanding,
} from '@/generation/landingChoice'
import { referencePictures } from '@/helpers/dynamicForm'
import { resolveModelForCapability } from '@/helpers/modelForCapability'
import { useAiModels } from '@/stores/aiModels'
import { useDocuments } from '@/stores/documents'
import { roleFolderOf, useFolderRoles } from '@/stores/folderRoles'
import { useGeneration } from '@/stores/generation'
import { claimOnSubmit, documentAwaits } from '@/stores/generationClaims'
import { useJobs } from '@/stores/jobs'
import { useModels } from '@/stores/models'
import { useSettings } from '@/stores/settings'

/**
 * What the generator PANEL does, for a studio with no window — a stand-in for a surface, never
 * for a rule. Without it every generation refuses `generatorClosed`, and the whole of sections
 * 20 to 22 is scored on a studio nobody asked to generate.
 */
export function installGeneratorPanel(
  schemaOf: (modelId: string) => FieldDescriptor[],
  noteReferences: (assetIds: readonly string[]) => void,
): () => void {
  const armed = (): { modelId: string; values: Record<string, unknown> } | null => {
    const role = useGeneration.getState().forcedCapability
    if (!role) return null

    const models = useModels.getState()
    const modelId = resolveModelForCapability(
      role,
      models.selected[role],
      useAiModels.getState().overview,
    )
    if (!modelId) return null

    // 🛑 Through `withBodyExtras`, as the real panel does: what the WORKSPACE adds is not in the
    // preset, and a stand-in that skipped it would score a generation the studio never sends —
    // with the model's own fields, since which one holds the prompt is its schema to say.
    return {
      modelId,
      values: withBodyExtras(role, models.preset[role] ?? {}, { fields: schemaOf(modelId) }),
    }
  }

  const references = (): string[] => {
    const body = armed()
    return body ? referencePictures(schemaOf(body.modelId), body.values) : []
  }

  /**
   * 🛑 The studio's OWN composition, never a second copy: which file a script lands in is what
   * sections 66 score, and a bench that recomputed it could score a destination the panel would
   * not have chosen.
   */
  const landing = (role: AiRoleId): ArmedLanding => {
    const documents = useDocuments.getState()
    const chosen = landingChoiceOf(
      role,
      documents,
      useSettings.getState().settings.generation.landing,
      documentAwaits(),
    )
    const folder = roleFolderOf(useFolderRoles.getState(), 'script')
    return {
      ...chosen,
      creates: landingCreatesOf(role, landingSiblingsOf(role, documents, folder)),
    }
  }

  const panel: GeneratorBridge = {
    body: armed,

    armed: () => {
      const body = armed()
      const role = useGeneration.getState().forcedCapability
      if (!body || !role) return null

      return {
        modelId: body.modelId,
        operation: role,
        family: partsOfRole(role)?.family ?? null,
        // No workspace draws sources without a window: the bench arms the form itself.
        sources: [],
        landing: landing(role),
        parameters: body.values,
      }
    },

    submit: async into => {
      const body = armed()
      if (!body) return null

      // Noted at the submit, by the panel's own reading of the schema: what « comme référence »
      // is scored on, and the one place that knows which fields hold a picture.
      noteReferences(references())
      const claim = claimOnSubmit(into, useGeneration.getState().forcedCapability)
      const job = await useJobs.getState().submit({ id: body.modelId }, body.values)
      claim(job)
      return job
    },

    references,
  }

  return registerGenerator(panel)
}
