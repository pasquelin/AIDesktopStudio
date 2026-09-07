/**
 * What one call to `canvas.drawPixels` lays down. ONE action rather than four: four tools
 * differing by two fields make a model choose between near-duplicates, and `inputProblem`
 * already says « "toX" is wanted » in a sentence a caller can repair.
 *
 * `fill` covers a RECTANGLE of cells — the whole layer by default, or the marquee. Not a bucket
 * by contiguity: that one would have to read the pixels back off the card.
 */
export type PixelShape = 'points' | 'line' | 'rectangle' | 'fill'

export const PIXEL_SHAPES: readonly PixelShape[] = ['points', 'line', 'rectangle', 'fill']
