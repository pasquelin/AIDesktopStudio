import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from './windowSources'

/**
 * The builders that name an asset the PROJECT holds — the only URLs a ⌘S can rewrite behind.
 * `thumbnailUrl` is not one: it is keyed by a PATH and answers for files the catalogue has never
 * heard of, and `asset.ts` writes its own blind spot at its declaration.
 */
const BUILDERS = new Set(['assetUrl', 'assetMasterUrl'])

/** The one call that makes such a URL tell one version of a file from the next. */
const VERSIONED = 'versionedUrl'

/**
 * Where a bare asset URL is what happens today, one SITE each — the file and the line's own text,
 * not the file alone: exempting a whole module hides the next bare URL somebody adds to it.
 *
 * **A « hole » here is a DECLARED one, not an accepted one.** Written out rather than counted: a
 * count stays green the day one is closed while another opens.
 */
const ALLOWED = new Map<string, string>([
  [
    "engines/scene/clipSources.ts | return source.kind === 'asset' ? assetUrl(source.assetId) : null",
    'hole: a rewritten animation never reloads — clipSources keys on the bare URL',
  ],
  [
    'engines/canvas/CanvasViewport.ts | const url = assetUrl(assetId)',
    'the UNLOAD path: it frees exactly the key `loadInto` wrote, so it must not be versioned',
  ],
  [
    'engines/canvas/CanvasEditing.ts | void this.loadInto(key, assetUrl(layer.source)).catch(error =>',
    'hole: a layer reads its source once, at birth — and ⌘S writes the stale pixels back',
  ],
  [
    'engines/canvas/CanvasLayerDrawing.ts | await this.loadInto(layerId, assetUrl(source))',
    'hole: same, when the layer is born',
  ],
  [
    'helpers/assetFetch.ts | return fetchOver(assetUrl(assetId), assetId)',
    'hole: video, audio and peaks all read through here, unversioned',
  ],
  [
    'helpers/assetFetch.ts | return fetchOver(assetMasterUrl(assetId), assetId, signal)',
    'hole: the export path reads the original the same way',
  ],
  [
    'features/image/pictureSize.ts | const size = await measure(assetUrl(assetId))',
    'hole: measures the picture the browser cached, not the file — so the drift notice can lie',
  ],
  [
    'features/material/deriveChannel.ts | const picture = await derive({ channel, sourceUrl: assetUrl(sourceAssetId) })',
    'hole: derives a channel from whatever the browser already holds',
  ],
  [
    'features/material/unpackChannels.ts | const picture = await unpack({ channel, sourceUrl: assetUrl(asset.id) })',
    'hole: same, when a packed picture is split',
  ],
  [
    'features/material/measureSeam.ts | const ratio = await measure(assetUrl(source.assetId))',
    'hole: same, when a tile is measured',
  ],
  [
    'components/AssetDropField.tsx | <Thumbnail url={poster ?? assetUrl(assetId)} className={FIELD_THUMBNAIL} />',
    'hole: the fallback when a row carries no poster — a thumbnail, so it costs a stale tile',
  ],
  [
    'components/AssetDropList.tsx | <Thumbnail url={posters[assetId] ?? assetUrl(assetId)} className={FIELD_THUMBNAIL} />',
    'the same hole as the field beside it, for the same reason and the same cost',
  ],
  [
    'features/context/components/Context/ContextPictures.tsx | <Thumbnail url={assetUrl(id)} className={FIELD_THUMBNAIL} />',
    'hole: same, in the context strip',
  ],
  [
    'features/generation/components/Generator/GeneratorSources.tsx | <Thumbnail url={assetUrl(input.assetId)} />',
    'hole: same, in the generator',
  ],
  [
    'features/generation/components/Generator/GeneratorContext.tsx | <Thumbnail key={id} url={assetUrl(id)} className={FIELD_THUMBNAIL} />',
    'hole: same, in the generator',
  ],
  [
    'features/material/components/Material/MaterialDocument.tsx | const flatPoster = flat && ((flatAsset && posterUrl(flatAsset)) ?? assetUrl(flat.assetId))',
    'hole: same, the flat channel shown when a row carries no poster',
  ],
])

/**
 * The ANCESTRY, not the line: Prettier breaks at 100 columns, so a `versionedUrl(` wrapping an
 * `assetUrl(` two lines down reads as a violation to anything that looks at one line.
 */
function insideVersioned(node: ts.Node): boolean {
  for (let up = node.parent; up; up = up.parent) {
    if (
      ts.isCallExpression(up) &&
      ts.isIdentifier(up.expression) &&
      up.expression.text === VERSIONED
    )
      return true
  }
  return false
}

/** A site is its file and the text of the line it sits on — the key `ALLOWED` is written in. */
function siteOf(relative: string, source: ts.SourceFile, node: ts.Node): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
  return `${relative} | ${source.text.split('\n')[line]?.trim() ?? ''}`
}

function sitesIn(relative: string, code: string): string[] {
  // `setParentNodes`, because the rule is about a call's ANCESTRY rather than its shape.
  const source = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true)
  const found: string[] = []

  const walk = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      BUILDERS.has(node.expression.text) &&
      !insideVersioned(node)
    ) {
      found.push(siteOf(relative, source, node))
    }
    ts.forEachChild(node, walk)
  }

  walk(source)
  return found
}

/** Every bare site of the window, whether the table names it or not. */
function bareSites(): string[] {
  return Object.entries(WINDOW_SOURCES)
    .flatMap(([path, code]) => sitesIn(path.replace('./', ''), code))
    .sort()
}

describe('an asset URL carries the version of the file behind it', () => {
  it('is versioned everywhere the table does not name a site', () => {
    expect(bareSites().filter(site => !ALLOWED.has(site))).toEqual([])
  })

  /**
   * The table kept honest: a site it names that no longer exists is a hole somebody closed
   * without saying so, and the line would then cover whatever is written there next.
   */
  it('names no site that has stopped building one', () => {
    const live = new Set(bareSites())

    expect([...ALLOWED.keys()].filter(site => !live.has(site))).toEqual([])
  })
})
