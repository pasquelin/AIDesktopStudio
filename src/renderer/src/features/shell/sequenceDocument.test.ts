import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { LogEntry } from '@shared/ipc'
import { TRANSLATIONS } from '@shared/i18n'
import i18next from 'i18next'
import { clipFixture, sequenceWith, trackFixture } from '@/engines/timeline/timeline-fixtures'
import { reindexTracks, SECOND } from '@/engines/timeline/timelineState'
import { installFakeBridge } from '@/services/fakeBridge'
import { forgetRememberedAssets, useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import {
  montageIsIncomplete,
  sequenceFromPayload,
  sequencePayload,
  serializeSequencePayload,
} from './sequenceDocument'

const RUSH: Asset = {
  id: 'asset-a',
  name: 'Plan large',
  type: 'video',
  location: 'local',
  path: 'assets/vid/plan large.mp4',
  tags: [],
  createdAt: '2026-08-18T10:00:00.000Z',
}

const reported = vi.fn<(entry: LogEntry) => Promise<void>>()

/** Only the parts of a written timeline these cases read back. */
type WrittenTimeline = {
  metadata: { aidesktopstudio: { documentId?: string; playhead?: number; audioEdits?: unknown } }
  tracks: { children: { children: { media_reference: { target_url?: string; name: string } }[] }[] }
}

/** The payload is composed here, so its shape is known — this only names what is read of it. */
const written = (payload: unknown): WrittenTimeline => payload as WrittenTimeline

const firstReference = (payload: unknown): { target_url?: string; name: string } => {
  const reference = written(payload).tracks.children[0]?.children[0]?.media_reference
  if (!reference) throw new Error('the montage came out with no clip at all')
  return reference
}

/** Which file `doc-1` is held in — the folder its media links are written relative to. */
function heldIn(path: string): void {
  useDocuments.setState({
    documents: {
      'doc-1': { id: 'doc-1', kind: 'sequence', workspace: 'video', title: 'Bande', path },
    },
    // Emptied with them: `setState` MERGES, so a listing one case installed is one every case
    // after it reads — and whether a scene id resolves is now what half of them are about.
    stored: [],
    activeId: 'doc-1',
  })
}

const ONE_CLIP = sequenceWith(
  reindexTracks([trackFixture('V1', 'video', [clipFixture('a', 0, SECOND)])]),
)

// The message is what the last case reads back. Wired here rather than through `initI18n`, which
// declares the document's language and reads this window's storage: this suite runs in the node
// project, and neither exists there. The BUNDLE is the real one.
beforeAll(async () => {
  await i18next.init({
    lng: 'fr',
    defaultNS: 'studio',
    resources: { fr: { studio: TRANSLATIONS.fr } },
    interpolation: { escapeValue: false },
  })
})

beforeEach(() => {
  reported.mockReset()
  reported.mockResolvedValue()
  installFakeBridge({ diagnostics: { report: reported } })
  useAssets.setState({ items: [RUSH] })
})

describe('what a save writes for a montage', () => {
  /**
   * The whole point of the open format BEING the document: a `.otio` holds a standard timeline,
   * its media pointed at from the montage's OWN folder — which is what lets the project be
   * moved, copied or synced without every clip going missing.
   */
  it('writes a standard timeline with links relative to the montage’s folder', () => {
    heldIn('Cinematics/Bande.otio')

    expect(firstReference(sequencePayload(ONE_CLIP, 'doc-1'))).toMatchObject({
      name: 'Plan large',
      target_url: '../assets/vid/plan%20large.mp4',
    })
  })

  /**
   * One step out per folder, which is what tells the folder apart from its segments.
   *
   * `documentFolder` answers the SEGMENTS a link climbs out of; a version answering the folder
   * whole writes a single `../` from any depth, and the montage opens with its media lost — a
   * case at one level alone reads the same either way.
   */
  it('climbs out of every folder a montage sits under, not just one', () => {
    heldIn('Cinematics/2026/Bande.otio')

    expect(firstReference(sequencePayload(ONE_CLIP, 'doc-1'))).toMatchObject({
      target_url: '../../assets/vid/plan%20large.mp4',
    })
  })

  // Without it, a montage renamed on disk comes back as a different document — its tab, its
  // place in the layout and its recent entry all keyed on the name it has just stopped having.
  it('remembers which document the file is', () => {
    heldIn('Bande.otio')

    expect(written(sequencePayload(ONE_CLIP, 'doc-1')).metadata.aidesktopstudio.documentId).toBe('doc-1')
  })

  it('indents, the file being one another application and a hand both read', () => {
    expect(serializeSequencePayload({ OTIO_SCHEMA: 'Timeline.1' })).toContain('\n')
  })

  /**
   * The refusal in `otioBody` is what a save meets if this ever answers a raw montage state, and
   * the loss it guards is total: nothing else in the studio would hold the cut. A document whose
   * descriptor has not landed yet — a first save, whose file the folder has still to name — is
   * the one moment this could have happened.
   */
  it('writes a standard timeline for a document no descriptor names yet', () => {
    useDocuments.setState({ documents: {}, activeId: null })

    expect(sequencePayload(ONE_CLIP, 'doc-1')).toMatchObject({ OTIO_SCHEMA: 'Timeline.1' })
  })

  /**
   * What the file carried is given back, and what this editor COMPOSES wins over it. The two
   * halves are one rule and the order between them is the whole of it: carried values that
   * outranked the state would freeze a montage at the playhead it was opened with.
   */
  it('gives a foreign key back untouched, and never an outdated one of its own', () => {
    heldIn('Bande.otio')
    sequenceFromPayload(
      {
        OTIO_SCHEMA: 'Timeline.1',
        metadata: { aidesktopstudio: { audioEdits: { 'clip-a': [] }, playhead: 9_000_000 } },
        tracks: { OTIO_SCHEMA: 'Stack.1', children: [] },
      },
      'doc-1',
    )

    const studio = written(sequencePayload({ ...ONE_CLIP, playhead: 42 }, 'doc-1')).metadata
      .aidesktopstudio

    expect(studio.audioEdits).toEqual({ 'clip-a': [] })
    expect(studio.playhead).toBe(42)
  })
})

describe('what an open reads back', () => {
  it('takes a montage of ours back whole, media and all', () => {
    heldIn('Cinematics/Bande.otio')

    expect(sequenceFromPayload(sequencePayload(ONE_CLIP, 'doc-1'), 'doc-1')).toEqual(ONE_CLIP)
  })

  /**
   * The case the manual names first, and the shape a montage written beside its media takes: a
   * RELATIVE link, resolved against the folder the montage itself sits in.
   */
  it('relinks a foreign clip by a link relative to the montage’s own folder', () => {
    heldIn('Cinematics/Bande.otio')
    const state = sequenceFromPayload(foreign('../assets/vid/plan%20large.mp4'), 'doc-1')

    expect(state.tracks[0]?.clips[0]?.assetId).toBe('asset-a')
    expect(reported).not.toHaveBeenCalled()
  })

  /**
   * A file from Resolve or Premiere names its media by path and knows nothing of our ids. The
   * relink is what turns that path back into a line of the catalogue.
   */
  it('relinks a foreign clip by the tail of its absolute link', () => {
    heldIn('Bande.otio')
    const state = sequenceFromPayload(foreign('file:///Volumes/Autre/vid/plan large.mp4'), 'doc-1')

    expect(state.tracks[0]?.clips[0]?.assetId).toBe('asset-a')
    expect(reported).not.toHaveBeenCalled()
  })

  it('relinks a foreign clip by file name when no folder lines up', () => {
    heldIn('Bande.otio')
    const state = sequenceFromPayload(foreign('file:///Volumes/Autre/plan large.mp4'), 'doc-1')

    expect(state.tracks[0]?.clips[0]?.assetId).toBe('asset-a')
  })

  it('reads a montage written on Windows, backslashes and drive letter and all', () => {
    heldIn('Bande.otio')
    const state = sequenceFromPayload(foreign('C:\\Montage\\vid\\plan large.mp4'), 'doc-1')

    expect(state.tracks[0]?.clips[0]?.assetId).toBe('asset-a')
  })

  /**
   * Said out loud rather than swallowed: a clip nothing could be found for is DROPPED, and a cut
   * that silently opens shorter than it was written is the worst answer available.
   */
  it('says which media it could not find, rather than opening shorter in silence', () => {
    heldIn('Bande.otio')
    const state = sequenceFromPayload(foreign('file:///Volumes/Autre/inconnu.mp4'), 'doc-1')

    expect(state.tracks[0]?.clips).toEqual([])
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', scope: 'document.load' }),
    )
    expect(reported.mock.calls[0]?.[0].message).toContain('inconnu.mp4')
  })

  /**
   * And the file is defended, not only the sentence. Opening a project then a montage at once
   * finds the catalogue still empty — `install` is synchronous and the shelf answers later — so
   * every clip drops and `install` then marks the document CLEAN. Nothing on screen says the tab
   * differs from the file, and the next ⌘S would delete the cut.
   */
  it('refuses to save a montage that opened holding less than its file', () => {
    heldIn('Bande.otio')
    // What opening another project does, and what makes the scenario real: the by-id index keeps
    // every asset the window has been SHOWN, and changing project is what empties it.
    useAssets.setState({ items: [] })
    forgetRememberedAssets()

    expect(sequenceFromPayload(foreign('../vid/plan large.mp4'), 'doc-1').tracks[0]?.clips).toEqual(
      [],
    )
    // The SENTENCE, not a yes: what a refusal tells the user to go and do differs per kind.
    expect(montageIsIncomplete('doc-1')).not.toBeNull()
  })

  it('lets it be saved again once every clip has found its media', () => {
    heldIn('Bande.otio')
    useAssets.setState({ items: [] })
    forgetRememberedAssets()
    sequenceFromPayload(foreign('../vid/plan large.mp4'), 'doc-1')

    useAssets.setState({ items: [RUSH] })
    sequenceFromPayload(foreign('file:///Volumes/Autre/vid/plan large.mp4'), 'doc-1')

    expect(montageIsIncomplete('doc-1')).toBeNull()
  })

  // A live scene has no media and no url: asked of the relinker anyway, every scene of a montage
  // was reported as a file that had gone missing — with an empty name in the sentence.
  it('says nothing about a clip drawing a live scene', () => {
    heldIn('Bande.otio')
    holdsScene('scene-1')
    const state = sequenceFromPayload(sceneClip(), 'doc-1')

    expect(state.tracks[0]?.clips[0]?.sceneId).toBe('scene-1')
    expect(reported).not.toHaveBeenCalled()
    expect(montageIsIncomplete('doc-1')).toBeNull()
  })

  /**
   * « Ce projet détient-il cet identifiant » is the only question, and this is its other half: a
   * scene id minted on another machine names a document nobody here has, and a clip kept on one
   * draws nothing while claiming to.
   */
  it('drops a clip drawing a scene this project has never held, and says so', () => {
    heldIn('Bande.otio')
    const state = sequenceFromPayload(sceneClip(), 'doc-1')

    expect(state.tracks[0]?.clips).toEqual([])
    expect(montageIsIncomplete('doc-1')).not.toBeNull()
  })
})

/** A scene document sitting in the project's folder, which is what makes its id resolvable. */
function holdsScene(id: string): void {
  useDocuments.setState({
    stored: [{ id, kind: 'scene', workspace: '3d', title: 'Décor', path: '3D/Décor.gltf' }],
  })
}

/** One of OURS, drawing a live scene: no media, no url, and an empty `assetId` by construction. */
const sceneClip = (): unknown =>
  timelineHolding(
    { OTIO_SCHEMA: 'MissingReference.1', name: 'Scène', metadata: {}, available_range: null },
    { aidesktopstudio: { id: 'c1', assetId: '', sceneId: 'scene-1' } },
  )

/** A timeline as another application writes one: a media named by path, and no studio metadata. */
const foreign = (targetUrl: string): unknown =>
  timelineHolding({
    OTIO_SCHEMA: 'ExternalReference.1',
    name: 'take',
    metadata: {},
    available_range: null,
    target_url: targetUrl,
  })

function timelineHolding(reference: unknown, metadata: unknown = {}): unknown {
  const time = (value: number): unknown => ({ OTIO_SCHEMA: 'RationalTime.1', rate: 25, value })

  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Cut',
    metadata: {},
    global_start_time: time(0),
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'tracks',
      metadata: {},
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'V1',
          kind: 'Video',
          metadata: {},
          enabled: true,
          children: [
            {
              OTIO_SCHEMA: 'Clip.1',
              name: 'take',
              metadata,
              enabled: true,
              effects: [],
              markers: [],
              source_range: {
                OTIO_SCHEMA: 'TimeRange.1',
                start_time: time(0),
                duration: time(25),
              },
              media_reference: reference,
            },
          ],
        },
      ],
    },
  }
}
