import { z } from 'zod'
import { GAME_VERSION, type GameManifest } from '@shared/domain/game'
import { MANIFEST_VERSION, type Manifest } from '@shared/domain/project'
import {
  CONTEXT_BODY_MAX,
  CONTEXT_CARDS_MAX,
  CONTEXT_PICTURES_MAX,
  CONTEXT_TITLE_MAX,
  CONTEXT_VERSION,
  type ContextCard,
  type ProjectContext,
} from '@shared/domain/projectContext'
import { assetId } from '@main/assets/validation'
import { withinCodePoints } from '@main/validation'

const manifest = z.object({
  version: z.number().int().min(1).max(MANIFEST_VERSION),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export function parseManifest(value: unknown): Manifest {
  return manifest.parse(value)
}

const contextCard = z.object({
  id: z.string().trim().min(1).refine(withinCodePoints(80)),
  title: z.string().trim().refine(withinCodePoints(CONTEXT_TITLE_MAX)),
  body: z.string().refine(withinCodePoints(CONTEXT_BODY_MAX)),
  active: z.boolean(),
  pictures: z.array(assetId).max(CONTEXT_PICTURES_MAX),
})

const projectContext = z.object({
  version: z.number().int().min(1).max(CONTEXT_VERSION),
  cards: z.array(contextCard).max(CONTEXT_CARDS_MAX),
})

export function parseProjectContext(value: unknown): ProjectContext {
  return projectContext.parse(value)
}

export function parseContextCards(value: unknown): ContextCard[] {
  return z.array(contextCard).max(CONTEXT_CARDS_MAX).parse(value)
}

const game = z.object({
  version: z.number().int().min(1).max(GAME_VERSION),
  scenes: z.array(z.string().min(1)).default([]),
  entryScene: z.string().min(1).nullable().default(null),
  scripts: z.array(z.object({ id: z.string().min(1), path: z.string().min(1) })).default([]),
  prefabs: z
    .array(z.object({ id: z.string().min(1), name: z.string(), document: z.string().min(1) }))
    .default([]),
  settings: z.object({ title: z.string().default('') }).default({ title: '' }),
})

export function parseGame(value: unknown): GameManifest {
  return game.parse(value)
}
