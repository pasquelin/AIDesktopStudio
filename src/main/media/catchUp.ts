import type { Asset, MediaProbe } from '@shared/domain/asset'
import { hasWaveform, needsProxy, type DeriveRequest } from './service'

/**
 * Whether a take in the catalogue is missing something the pipeline owes it.
 *
 * Two ways in. The first is `probe`: it is what ffprobe answers, so a timed row without one has
 * not been read by the tool — exactly the state a studio whose ffmpeg is not resolved yet leaves
 * every generated take in. It SETTLES, because the pass below writes it down before deriving:
 * once the tool is there, a take is caught up once and never again.
 *
 * It used to be `hash`, and that stopped being true the day an import started fingerprinting the
 * file it wrote: `hashOrNull` is plain `node:fs` and answers whether or not ffmpeg exists, so a
 * rush generated without the tool was stamped as one the pipeline had been through — and skipped
 * for good once the tool arrived. Reading `peaksPath` ALONE would not settle either: a silent
 * rush legitimately has no waveform, and would be picked up on every project opened, for ever.
 * The second way in below is that reading, made to settle by asking the probe what is owed.
 */
export function needsDeriving(asset: Asset): boolean {
  const timed = asset.type === 'video' || asset.type === 'audio'
  if (!timed || asset.location !== 'local' || !asset.path) return false
  return asset.probe ? owesDerivedFile(asset, asset.probe) : true
}

/**
 * A row whose probe says a proxy or a waveform is DUE, and which names neither.
 *
 * The second way in, and the reason it is safe where reading `peaksPath` alone never was: the
 * PROBE is what tells « none was ever made » from « none is owed ». A silent rush has no
 * `sampleRate`, so it owes no waveform and is not picked up again; a rush WebCodecs reads owes
 * no proxy. Only a row that owes one and has none comes back.
 *
 * What empties those two columns is the named cache purge, which throws the files away in the
 * same gesture — so this settles at the next opening rather than at every one. It does not
 * settle on a machine where the derivation itself keeps failing, which is already true of the
 * probe half above and is the honest answer: the work is genuinely still owed.
 */
function owesDerivedFile(asset: Asset, probe: MediaProbe): boolean {
  return (needsProxy(probe) && !asset.proxyPath) || (hasWaveform(probe) && !asset.peaksPath)
}

/** How many rows a page of the catalogue holds — its own default, stated rather than inherited. */
export const CATCH_UP_PAGE = 200

export type CatchUpDeps = {
  /**
   * One page of the timed assets the project holds, oldest-first order left to the catalogue.
   *
   * Paged rather than asked whole: a search with no limit answers its own default of 200, so a
   * project holding more takes than that would catch up the newest 200 and never reach the
   * rest — they gain no hash, the same window comes back on every open, and nothing else would
   * ever go looking for them.
   */
  list: (offset: number, limit: number) => Promise<Asset[]>
  /** Absolute path of an asset's own file, or null when the catalogue points at nothing. */
  fileOf: (asset: Asset) => string | null
  /** `null` when ffprobe is missing or refuses the file. */
  probeFile: (path: string) => Promise<MediaProbe | null>
  /** Awaited: `derive` reads the row back, and a stale read drops what was just written. */
  save: (assetId: string, fields: Partial<Asset>) => Promise<void>
  derive: (request: DeriveRequest) => Promise<void>
  /**
   * Whether the project this run started on is still the one in front.
   *
   * Checked between takes because `derive` resolves the project folder when it RUNS: a run left
   * going after another project opened wrote one project's stills, proxies and waveforms into
   * the other, under ids its catalogue has never heard of.
   */
  stillOpen: () => boolean
}

/**
 * Brings the takes a project already holds up to what a montage now expects of them: a length,
 * a still, a waveform, a proxy.
 *
 * Every one of these arrived before the pipeline ran on downloads, so a project opened after
 * the fix would otherwise show exactly what it showed before it — grey tiles, five-second
 * clips, flat rectangles where a waveform belongs. A correction nobody's own files benefit
 * from is a correction nobody believes.
 *
 * One at a time on purpose. This is background work behind a project that has just opened, and
 * a burst of ffprobes would compete with the import the user may be starting in the same
 * second — `derive` bounds its own ffmpeg, `probeFile` bounds nothing.
 */
export async function catchUpMedia(deps: CatchUpDeps): Promise<number> {
  let done = 0

  for (let offset = 0; ; offset += CATCH_UP_PAGE) {
    const page = await deps.list(offset, CATCH_UP_PAGE)

    for (const asset of page.filter(needsDeriving)) {
      if (!deps.stillOpen()) return done

      const path = deps.fileOf(asset)
      if (!path) continue

      const probe = asset.probe ?? (await deps.probeFile(path))
      // Nothing to derive from, and nothing to write down: without a length there is no bucket
      // count for a waveform and no offset for a still. Left as it is, tried again next time.
      if (!probe) continue
      // Awaited, and before the derive that follows it: both read the row and write it back,
      // and a probe still in flight would commit a copy taken before the derive landed —
      // dropping the very hash that keeps this take from being caught up again for ever.
      if (!asset.probe) await deps.save(asset.id, { probe })

      await deps.derive({
        assetId: asset.id,
        path,
        kind: asset.type,
        probe,
        // A generation came down with the library's own still, which is a picture of the take
        // rather than a frame of it. Only a row that has none gets one grabbed.
        poster: !asset.posterPath,
        // Maintenance, not an import: these rows would read as files the user never picked.
        announce: false,
      })
      done += 1
    }

    // A short page is the last one. Filtering happens after, so a page of rows that all hold a
    // hash is still a page — the walk stops on what the catalogue returned, never on the count
    // of what was worth doing.
    if (page.length < CATCH_UP_PAGE) return done
  }
}
