import { z } from 'zod'
import {
  MODEL_FORMATS,
  MODEL_LOADERS,
  type LocalModel,
  type ProvenanceRank,
} from '@shared/domain/localModel'
import { LOCAL_MODALITIES } from '@shared/domain/localFields'
import { MODEL_FAMILIES } from '@shared/domain/model'

/**
 * A manifest as it comes back off the disk — the settings file holds the ones the person supplied,
 * and a settings file is user-editable territory.
 */
const modelFile = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  bytes: z.number().nonnegative(),
  sha256: z.string().min(1),
  revision: z.string().min(1).optional(),
  upstream: z.string().min(1).optional(),
})

export const localModelSchema: z.ZodType<LocalModel> = z.object({
  id: z.string().min(1),
  backendId: z.string().min(1).optional(),
  name: z.string().min(1),
  format: z.enum(MODEL_FORMATS),
  loader: z.enum(MODEL_LOADERS),
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]) satisfies z.ZodType<ProvenanceRank>,
  licence: z.string(),
  licenceUrl: z.string(),
  source: z.string(),
  files: z.array(modelFile),
  diskBytes: z.number().nonnegative(),
  contextTokens: z.number().positive().optional(),
  reservationBytes: z.number().nonnegative(),
  modality: z.enum(LOCAL_MODALITIES).optional(),
  // Declared, or STRIPPED: a zod object drops what it does not name, so a supplied model that
  // served a space would come back off the disk serving none — and vanish from every panel.
  family: z.enum(MODEL_FAMILIES).optional(),
  capabilities: z.array(z.string()).optional(),
  serves: z.array(z.string()).optional(),
  readsTorchWeights: z.boolean().optional(),
  distribution: z.enum(['bundled', 'direct-download', 'user-import']).optional(),
  licenceStatus: z
    .enum(['commercial', 'non-commercial', 'restricted', 'unsupported-region'])
    .optional(),
  runtimeStatus: z.enum(['supported', 'plugin-required', 'unsupported']).optional(),
  distributionStatus: z.enum(['public', 'blocked']).optional(),
  needsCuda: z.boolean().optional(),
  attaches: z
    .object({
      model: z.string().min(1),
      as: z.enum(['controlnet', 'ip-adapter']),
      subfolder: z.string().min(1).optional(),
      weightName: z.string().min(1).optional(),
    })
    .optional(),
  fieldOverrides: z
    .record(
      z.string(),
      z.object({
        default: z.unknown().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
  thumbnail: z.string().optional(),
  releasedAt: z.iso.date().optional(),
  featured: z.boolean().optional(),
  weightsPath: z.string().min(1).optional(),
  embedPrompts: z.object({ document: z.string(), query: z.string() }).optional(),
})
