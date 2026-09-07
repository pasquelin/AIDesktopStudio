import type { Rect } from './canvasState'

type Pair = { x: number; y: number }

/** A node of the built tree, seen through what the engine is allowed to write on it. */
type Placed = {
  readonly children: Placed[]
  parent: Placed | null
  position: Pair
  scale: Pair
  pivot: Pair
  skew: Pair
  rotation: number
  visible: boolean
  renderable: boolean
  alpha: number
  blendMode: string
  label: string
  filters: object[]
  mask: object | null
  maskChannel: string
  size: { width: number; height: number } | null
  destroyed: boolean
  matrix: { a: number; b: number; c: number; d: number; tx: number; ty: number } | null
}

/** What the faked renderer hands back from an extraction: bytes, as the real one now does. */
const EXTRACTED = Uint8Array.from([137, 80, 78, 71])

const gpu: {
  renders: number
  /** How many passes were cut to a mask — what tells a paragraph's words from a point caption's. */
  masked: number
  texturesCreated: number
  texturesDestroyed: number
  /** Every attach and detach: the cost a restack pays, and the one a repaint must not. */
  mutations: number
  /** What the engine asked the renderer for, so the options it depends on can be asserted. */
  init: Record<string, unknown>
  /** Every sprite built, in the order they were built: one per paintable layer. */
  sprites: Placed[]
  /** Every container built, groups included — they are found back by their label. */
  containers: Placed[]
  /** The id of every texture a render was aimed at: which surface a stroke actually wrote to. */
  painted: number[]
  /** Every square the stamp drew, in order — what a stroke on a grid is made of. */
  stamps: Rect[]
  /** What the engine asked the asset loader for, so the parser it forces can be asserted. */
  loaded: { src: string; parser?: string }[]
  /** Set by the one test that needs a load to fail: an asset whose file is gone. */
  refuseLoad: boolean
  /** Every URL the loader was told to forget — a blob URL held for the session is a leak. */
  unloaded: string[]
  /** Set by the cases that need an extraction to fail: a canvas that hands back no blob. */
  refuseEncode: boolean
  /** Every extraction, so what a snapshot framed and at what scale can be asserted. */
  extracted: { frame?: unknown; resolution?: number }[]
  /** Every frame the eyedropper read, so what it sampled — and how much of it — can be asserted. */
  sampled: { x: number; y: number; width: number; height: number }[]
  /** What the renderer hands back, so a test can name the colour standing under the pointer. */
  pixels: number[]
  /** Every time the drawing buffer was asked to take its host's box — see `followHostSize`. */
  resizes: number
  /** Every texture built, with the sampling the engine wrote on it and whether it pushed it. */
  textures: { source: { scaleMode: string; style: { updates: number } } }[]
} = {
  renders: 0,
  masked: 0,
  texturesCreated: 0,
  texturesDestroyed: 0,
  mutations: 0,
  init: {},
  sprites: [],
  containers: [],
  painted: [],
  stamps: [],
  loaded: [],
  refuseLoad: false,
  unloaded: [],
  refuseEncode: false,
  extracted: [],
  sampled: [],
  pixels: [0, 0, 0, 0],
  resizes: 0,
  textures: [],
}

/** The six numbers of an affine map, which is all the engine ever builds one from. */
export { EXTRACTED, gpu }
export type { Pair, Placed }
