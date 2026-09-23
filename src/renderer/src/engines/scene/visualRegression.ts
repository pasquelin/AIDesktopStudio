export type VisualFrame = { width: number; height: number; pixels: Uint8Array }

export type VisualRegressionOptions = {
  channelTolerance: number
  maximumChangedPixelRatio: number
}

export type VisualRegressionResult = {
  changedPixels: number
  changedPixelRatio: number
  maximumChannelDifference: number
  equivalent: boolean
}

export function compareVisualFrames(
  original: VisualFrame,
  optimized: VisualFrame,
  options: VisualRegressionOptions,
): VisualRegressionResult {
  validateOptions(options)
  if (!sameDimensions(original, optimized) || !completeFrame(original) || !completeFrame(optimized))
    throw new Error('Visual frames must have equal non-empty RGBA dimensions')

  const { changedPixels, maximumChannelDifference } = differencesOf(
    original,
    optimized,
    options.channelTolerance,
  )
  const pixels = original.width * original.height
  const changedPixelRatio = changedPixels / pixels
  return {
    changedPixels,
    changedPixelRatio,
    maximumChannelDifference,
    equivalent: changedPixelRatio <= options.maximumChangedPixelRatio,
  }
}

function validateOptions(options: VisualRegressionOptions): void {
  const validChannel =
    Number.isInteger(options.channelTolerance) &&
    options.channelTolerance >= 0 &&
    options.channelTolerance <= 255
  const validRatio =
    Number.isFinite(options.maximumChangedPixelRatio) &&
    options.maximumChangedPixelRatio >= 0 &&
    options.maximumChangedPixelRatio <= 1
  if (!validChannel || !validRatio)
    throw new Error('Visual regression tolerances are outside their valid range')
}

function differencesOf(
  original: VisualFrame,
  optimized: VisualFrame,
  tolerance: number,
): Pick<VisualRegressionResult, 'changedPixels' | 'maximumChannelDifference'> {
  let changedPixels = 0
  let maximumChannelDifference = 0
  for (let offset = 0; offset < original.pixels.length; offset += 4) {
    const differences = [0, 1, 2, 3].map(channel =>
      Math.abs(
        (original.pixels[offset + channel] ?? 0) - (optimized.pixels[offset + channel] ?? 0),
      ),
    )
    maximumChannelDifference = Math.max(maximumChannelDifference, ...differences)
    if (differences.some(difference => difference > tolerance)) changedPixels += 1
  }
  return { changedPixels, maximumChannelDifference }
}

function sameDimensions(original: VisualFrame, optimized: VisualFrame): boolean {
  return original.width === optimized.width && original.height === optimized.height
}

function completeFrame(frame: VisualFrame): boolean {
  return (
    frame.width > 0 && frame.height > 0 && frame.pixels.length === frame.width * frame.height * 4
  )
}

/**
 * Whether a frame holds more than one colour.
 *
 * 🛑 What every visual comparison needs beside its ratio: two BLANK frames compare perfectly, so
 * a side that drew nothing reads as a side that drew the same thing. Alpha is out of it — a frame
 * read off an opaque target carries 255 everywhere and would never vary.
 */
export function hasPixelVariation(pixels: Uint8Array): boolean {
  for (let offset = 4; offset < pixels.length; offset += 4) {
    if (
      pixels[offset] !== pixels[0] ||
      pixels[offset + 1] !== pixels[1] ||
      pixels[offset + 2] !== pixels[2]
    )
      return true
  }
  return false
}
