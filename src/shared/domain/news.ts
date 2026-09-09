import type { ModelFamily } from './model'

/**
 * What the home's news band reads. Two sources, one shape: a headline, an address, a date.
 *
 * The studio holds no opinion on any of it — these are other people's models and other people's
 * articles, listed so that a person knows what is moving without leaving the window.
 */

/**
 * The Hugging Face pipeline tag each family is read from, and the map IS the list of tabs: a
 * family absent here has no tag on that side and is offered no tab, rather than a tab that
 * answers nothing.
 *
 * 🛑 Texture and Skybox are deliberately absent. Nothing publishes them as a pipeline — the
 * studio serves both with image models — so a tab for either would list the Image tab again
 * under another name. Measured 2026-08-24, against `?pipeline_tag=`.
 */
export const NEWS_TAGS_BY_FAMILY: Partial<Record<ModelFamily, readonly string[]>> = {
  image: ['text-to-image'],
  video: ['text-to-video'],
  '3d': ['image-to-3d', 'text-to-3d'],
  audio: ['text-to-audio', 'text-to-speech'],
}

/**
 * The families the band can list, in the order their chips stand. The cast is the one thing
 * `Object.keys` cannot say: the record above is keyed by `ModelFamily` and by nothing else.
 */
const NEWS_FAMILIES: readonly ModelFamily[] = Object.keys(NEWS_TAGS_BY_FAMILY) as ModelFamily[]

/**
 * What one chip asks for: a family of models, or the articles — which belong to no family.
 *
 * One axis rather than two rows of tabs. A source row above a family row spends a second line
 * of the heading on a nesting nobody reads, and the articles have no family to cross it with.
 */
export type NewsTopic = ModelFamily | 'articles'

export const ARTICLES_TOPIC = 'articles'

export const NEWS_TOPICS: readonly NewsTopic[] = [...NEWS_FAMILIES, ARTICLES_TOPIC]

/**
 * What the band opens on: the first family rather than a mixed list, five topics answered at once
 * being five requests for a band nobody has looked at yet. The `??` is what
 * `noUncheckedIndexedAccess` asks of a read the registry can never fail.
 */
export const OPENING_TOPIC: NewsTopic = NEWS_TOPICS[0] ?? ARTICLES_TOPIC

export function isNewsTopic(value: unknown): value is NewsTopic {
  return NEWS_TOPICS.some(topic => topic === value)
}

export type NewsItem = {
  /** The publisher's own id — `black-forest-labs/FLUX.1-dev`, or an article's link. */
  readonly id: string
  readonly title: string
  /** HTTPS, always: `openExternally` refuses anything else, silently. */
  readonly url: string
  /** ISO 8601, or `null` where the source stated no date. Never invented here. */
  readonly publishedAt: string | null
  /** What the publisher classes it as — its pipeline tag. Absent on an article. */
  readonly kind: string | null
  /** As the hub counts them. `null` on an article, which is not downloaded. */
  readonly downloads: number | null
  readonly likes: number | null
}

/** One topic's answer, with what the window needs to say why it is empty. */
export type NewsPage = {
  readonly topic: NewsTopic
  readonly items: readonly NewsItem[]
  /** When this was read, so the band can say how old it is rather than pretend it is live. */
  readonly readAt: string
}

/** How many rows one topic shows. Enough to be worth a look, short enough not to be a feed. */
export const NEWS_PAGE_SIZE = 8
