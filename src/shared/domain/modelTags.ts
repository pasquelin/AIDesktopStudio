import { saysPixelArt } from './pixelArtPrompt'

export const RETRO_NAMES: readonly string[] = ['8-bit', '16-bit']

/**
 * Whether a model says it draws pixel art. Used to PROMOTE, never to filter — a catalogue that
 * hides what it did not recognise is worse than one that shows everything in a plain order.
 *
 * 🛑 `image` alone, because the grid only ever reaches an image body: `EXTRAS` holds every other
 * family at `null`, so promoting a chiptune model would badge words that never travel.
 */
export function suitsPixelArt(model: {
  name: string
  family: string
  tags: readonly string[]
  description?: string
}): boolean {
  if (model.family !== 'image') return false

  const named = `${model.name} ${model.tags.join(' ')}`.toLowerCase()
  return (
    saysPixelArt(`${named} ${model.description ?? ''}`) ||
    RETRO_NAMES.some(word => named.includes(word))
  )
}

/**
 * The ones that draw pixel art first, the catalogue's own order kept inside each half.
 *
 * 🛑 A SORT and never a filter, and the guarantee is structural rather than promised: every model
 * handed in comes back out, so nothing is hidden by not being recognised.
 */
export function pixelArtFirst<T extends Parameters<typeof suitsPixelArt>[0]>(
  models: readonly T[],
): readonly T[] {
  const suited = new Set(models.filter(suitsPixelArt))
  return [...suited, ...models.filter(one => !suited.has(one))]
}

/**
 * Tags worth offering per family, taken from a count over the 640 public models rather than
 * invented. They cannot be read off the API: `GET /tags` answers with the caller's OWN tags —
 * measured: zero on a fresh account — and deriving them from the loaded page would make the
 * menu change while scrolling. Case matters: the API matches tags exactly.
 */
export const TAGS_BY_FAMILY = {
  image: [
    'Flux.1 LoRA',
    'Text to Image',
    'Image to Image',
    'editing',
    'Post Processing',
    'characters',
    'fantasy',
    'cartoon',
    'tool',
  ],
  video: [
    'Video',
    'T2V',
    'I2V',
    'V2V',
    'First Frame',
    'Last Frame',
    'Video Editing',
    'Post Processing',
  ],
  '3d': ['Image to 3D', 'Text to 3D', '3D to 3D', 'PBR', 'Multiview', 'Motion'],
  audio: ['Audio', 'TTS', 'Music', 'Text to Music', 'Text to Speech'],
  // Empty until the same count is run over the family: it was split out of `image` on its
  // capabilities, and borrowing that list would offer tags no material model may carry.
  material: [],
  // Empty like its publishers: Scenario's four panoramas leave a facet nothing to narrow.
  skybox: [],
  // Empty, and it cannot be otherwise: no catalogue lists a code model, so there is no listing
  // for a tag to narrow. The choice is a cloud or a model on this machine.
  code: [],
  upscale: [],
  'background-removal': [],
  vectorization: [],
  other: [],
}

/**
 * The i18n key naming each tag on screen, or `null` where the publisher's own word is what it
 * shows — the acronyms, and one product name, which a translation would only obscure.
 *
 * What a tag is CALLED is not what it is MATCHED as: the value above travels to the API exactly
 * as written, and this only names it. That is what lets a French studio read "Depuis un texte"
 * while the request still carries `Text to Image`.
 *
 * One record with a nullable value rather than two lists that answer each other, the shape
 * `NODE_LABEL_KEYS` settled on: two lists can disagree — name a tag and leave it alone at once —
 * and a tag added upstairs then has three places to be entered instead of one.
 *
 * The keys are written here rather than built from the value: `Flux.1 LoRA` holds a dot, and a
 * dot is how i18next spells a level of nesting.
 */
export const TAG_LABEL_KEYS: Record<string, string | null> = {
  'Text to Image': 'modelTags.textToImage',
  'Image to Image': 'modelTags.imageToImage',
  editing: 'modelTags.editing',
  'Post Processing': 'modelTags.postProcessing',
  characters: 'modelTags.characters',
  fantasy: 'modelTags.fantasy',
  cartoon: 'modelTags.cartoon',
  tool: 'modelTags.tool',
  Video: 'modelTags.video',
  'First Frame': 'modelTags.firstFrame',
  'Last Frame': 'modelTags.lastFrame',
  'Video Editing': 'modelTags.videoEditing',
  'Image to 3D': 'modelTags.imageTo3d',
  'Text to 3D': 'modelTags.textTo3d',
  '3D to 3D': 'modelTags.threeDToThreeD',
  Multiview: 'modelTags.multiview',
  Motion: 'modelTags.motion',
  Audio: 'modelTags.audio',
  Music: 'modelTags.music',
  'Text to Music': 'modelTags.textToMusic',
  'Text to Speech': 'modelTags.textToSpeech',
  'Flux.1 LoRA': null,
  T2V: null,
  I2V: null,
  V2V: null,
  PBR: null,
  TTS: null,
}

/** Every key the record names, for the guard that checks the bundles carry them. */
export const TAG_LABEL_KEY_LIST: readonly string[] = Object.values(TAG_LABEL_KEYS).flatMap(
  key => key ?? [],
)

/**
 * A tag's name on screen, given something that translates a key. The value stands in as its own
 * label wherever nobody named it, which is the one wording that is always true — and never a raw
 * key, which reads like a bug.
 */
export function tagLabel(value: string, translate: (key: string) => string): string {
  const key = TAG_LABEL_KEYS[value]
  return key === undefined || key === null ? value : translate(key)
}

/**
 * Who built the model, as a tag. NOT `authorId`: every public model carries the same opaque
 * one — Scenario's — and no endpoint resolves it to a name, so their own "Author" menu cannot
 * be reading it either. The publisher lives in the tags; filtering by one is an ordinary tag
 * filter, applied by the API.
 *
 * Split per family, and counted there: Kling and Vidu publish video, Tripo and Meshy publish
 * 3D. One flat list would offer, in the Image workspace, publishers that cannot match a single
 * image model — a menu entry whose only possible answer is "no result".
 */
export const PUBLISHERS_BY_FAMILY = {
  image: ['Deacon', 'Black Forest Labs', 'Recraft', 'Ideogram', 'Google', 'Qwen', 'Alibaba'],
  video: ['Kling', 'Vidu', 'Alibaba', 'Wan', 'Bytedance', 'Luma', 'Google', 'Grok'],
  '3d': ['Tripo', 'Tencent', 'Meshy', 'Hunyuan', 'Rodin'],
  audio: ['ElevenLabs', 'Google', 'Bytedance'],
  material: [],
  // Empty for the same reason as its tags: Scenario, BFL and Tencent publish one model each.
  skybox: [],
  // Empty: a cloud is the publisher, and it is already what the person picks.
  code: [],
  upscale: [],
  'background-removal': [],
  vectorization: [],
  other: [],
}

/**
 * How far back a listing reaches. A span rather than a date: the renderer would otherwise
 * rebuild an ISO string on every render, and every one of them would be a new cache key.
 */
