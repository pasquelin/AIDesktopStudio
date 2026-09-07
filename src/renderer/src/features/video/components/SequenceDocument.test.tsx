import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addClip } from '@/engines/timeline/commands'
import { programOwner, sourceOwner } from '@/engines/timeline/playback'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import { EMPTY_SEQUENCE, type SequenceState } from '@/engines/timeline/timelineState'
import { TimelinePanel } from '@/features/timeline/components/Timeline/TimelinePanel'
import { useDocuments } from '@/stores/documents'
import { useMonitorPair } from '@/stores/monitorPair'
import { usePlayback } from '@/stores/playback'
import { sequenceStore, useSequences } from '@/stores/sequences'
import { SequenceDocument } from './SequenceDocument'

const play = vi.fn()
const pause = vi.fn()
// Shared across instances, unlike the per-engine mocks: what the engine is handed is what will be
// painted and heard, and both monitors hand it over here.
const applied = vi.fn<(state: SequenceState) => void>()
type EngineDeps = { owner: string; onTime?: (time: number) => void }

/** What each monitor taught its engine, so a case can report a time the way the clock does. */
const built = vi.hoisted<EngineDeps[]>(() => [])

// jsdom has neither WebGL nor WebCodecs: the engine is exercised by hand, not here. What this
// covers is that the tab shows two monitors and wires their transport.
vi.mock('@/engines/timeline/TimelineEngine', () => ({
  TimelineEngine: class {
    mount = vi.fn(() => Promise.resolve())
    apply = applied
    seek = vi.fn(() => Promise.resolve())
    play = play
    pause = pause
    playing = vi.fn(() => false)
    // Faithful on this one point, because a case below turns on it: the real `dispose` pauses,
    // and pausing reports the time one last time (`TimelineEngine.pause`).
    dispose = vi.fn(() => this.deps.onTime?.(0))

    constructor(private deps: EngineDeps) {
      built.push(deps)
    }
  },
}))

const clip = clipFixture('clip-1', 0, 1_000_000, { assetId: 'asset-1' })
const later = clipFixture('clip-2', 2_000_000, 1_000_000, { assetId: 'asset-2' })

/** The source monitor's track, as the engine last received it — 'S1' is its only one. */
const sourceTrack = () =>
  applied.mock.calls
    .map(([state]) => state.tracks.find(track => track.id === 'S1'))
    .filter(Boolean)
    .at(-1)

/** Where the source monitor stands, as the engine last received it. */
const sourcePlayhead = () =>
  applied.mock.calls
    .filter(([state]) => state.tracks.some(track => track.id === 'S1'))
    .map(([state]) => state.playhead)
    .at(-1)

/** Moves the montage's own head, the way playing or scrubbing does. */
const seekMontage = (playhead: number): void => {
  const store = useSequences.getState()
  act(() => store.replace('doc-1', { ...sequenceStore.stateOf(store, 'doc-1'), playhead }))
}

beforeEach(() => {
  vi.clearAllMocks()
  built.length = 0
  usePlayback.setState({ running: {}, heads: {} })
  useDocuments.setState({ activeId: 'doc-1' })
  useMonitorPair.setState({ clipShown: { 'doc-1': true } })
})

describe('SequenceDocument monitors', () => {
  /**
   * What a montage tab is FOR is the edit: the source monitor is the half one opens to look at
   * one clip, and it used to take half the width whether or not a clip was being looked at.
   */
  describe('the source monitor, which the tab hides by default', () => {
    beforeEach(() => useMonitorPair.setState({ clipShown: {} }))

    it('opens on the program alone', () => {
      render(<SequenceDocument documentId="doc-1" />)

      expect(screen.queryByText('Source')).not.toBeInTheDocument()
      expect(screen.getByText('Programme')).toBeInTheDocument()
    })

    it('shows and hides it on the button the program monitor carries', async () => {
      render(<SequenceDocument documentId="doc-1" />)

      await userEvent.click(screen.getByRole('button', { name: 'Moniteur source' }))
      expect(screen.getByText('Source')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Moniteur source' }))
      expect(screen.queryByText('Source')).not.toBeInTheDocument()
    })

    /**
     * The space bar has one player to drive while the source is away, so the focus a click took
     * before hiding it must not keep the key. Read off the play button, which advertises the
     * key only on the monitor that answers it.
     */
    it('leaves the key to the program even after the source was clicked', async () => {
      useMonitorPair.setState({ clipShown: { 'doc-1': true } })
      render(<SequenceDocument documentId="doc-1" />)

      await userEvent.click(screen.getByText('Source'))
      await userEvent.click(screen.getByRole('button', { name: 'Moniteur source' }))

      expect(screen.queryByText('Source')).not.toBeInTheDocument()
      // The key is named on the play button of whichever monitor answers it, and on no other.
      expect(screen.getByRole('button', { name: 'Lire (Espace)' })).toBeInTheDocument()
    })
  })

  it('shows the source and the program monitors, in that order', () => {
    render(<SequenceDocument documentId="doc-1" />)

    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Programme')).toBeInTheDocument()
  })

  // `forgetDocument` drops the document BEFORE React unmounts this tab, and disposing the engine
  // reports the time one last time. Writing then would build the montage back out of the store's
  // default — and the file would never be read again, since the document reads as open.
  // On an id of its own, deliberately: the store's `dropped` mark outlives a case, and a `doc-1`
  // dropped here would silence the commands of every case below — the fixtures reinstall state
  // with `setState`, which is not a door the mark is lifted at.
  it('does not build a closed montage back when the monitor reports one last time', () => {
    useSequences.setState({ states: { closing: EMPTY_SEQUENCE }, histories: {} })
    const view = render(<SequenceDocument documentId="closing" />)

    useSequences.getState().drop('closing')
    view.unmount()

    expect(sequenceStore.hasState(useSequences.getState(), 'closing')).toBe(false)
  })

  it('gives each monitor its own transport', () => {
    render(<SequenceDocument documentId="doc-1" />)
    expect(screen.getAllByRole('button', { name: /Lire/ })).toHaveLength(2)
  })

  it('answers the space bar once when the montage strip is open beside the monitors', async () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))

    render(
      <>
        <SequenceDocument documentId="doc-1" />
        <TimelinePanel />
      </>,
    )
    await userEvent.keyboard(' ')

    // Both surfaces listen on the `sequence` scope and drive the same transport by name. When
    // both handled the key, one started the programme monitor and the other stopped it.
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('shows a timecode for each monitor', () => {
    render(<SequenceDocument documentId="doc-1" />)
    expect(screen.getAllByText('00:00:00:00')).toHaveLength(2)
  })

  it('invites the user to pick a clip while the source monitor has none', () => {
    render(<SequenceDocument documentId="doc-1" />)
    expect(screen.getByText(/Sélectionnez un clip/)).toBeInTheDocument()
  })

  it('drops the invitation once a clip is selected', () => {
    render(<SequenceDocument documentId="doc-1" />)
    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', clip)))

    expect(screen.queryByText(/Sélectionnez un clip/)).not.toBeInTheDocument()
  })

  /**
   * The monitor used to mount whatever was selected on a picture track, whatever its kind. A take
   * landed there is shown as a black frame and heard as nothing at all — `audioChunksIn` only
   * schedules tracks of the sound kind.
   */
  it('mounts a clip taken from a sound track on a sound track, so it is heard', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('A1', clip)))

    expect(sourceTrack()?.kind).toBe('audio')
  })

  /**
   * The track the clip sits on, not the type of the file behind it: a rush dropped onto a sound
   * track is played without a picture by the program monitor and shown as audio by the inspector,
   * and the source monitor has no business disagreeing with both.
   */
  it('mounts a clip taken from a picture track on a picture track', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', clip)))

    expect(sourceTrack()?.kind).toBe('video')
  })

  // A track holds many clips; the monitor shows the selected one, not the first one laid down.
  it('mounts the selected clip rather than the first on its track', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('A1', clip)))
    act(() => useSequences.getState().runCommand('doc-1', addClip('A1', later)))

    expect(sourceTrack()?.clips[0]?.id).toBe('clip-2')
  })
})

describe('SequenceDocument playback heads', () => {
  /**
   * What makes the source monitor a way to SEE the clip you picked: a track above may cover it
   * in the programme, and its own picture is the only place left to watch it.
   */
  it('follows the montage head, offset into the clip it is showing', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))
    seekMontage(2_400_000)

    expect(sourcePlayhead()).toBe(400_000)
  })

  /**
   * Following is for SCRUBBING. While the programme plays, the head moves sixty times a second,
   * and following it would animate both pictures at once — two decodes, and for a scene clip
   * two whole 3D renders per frame, to show twice what one monitor already shows.
   */
  it('stops following while the programme plays, so one picture moves at a time', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))
    seekMontage(2_400_000)
    act(() => usePlayback.getState().setRunning(programOwner('doc-1'), true))
    seekMontage(2_800_000)

    expect(sourcePlayhead()).toBe(400_000)
  })

  /**
   * The other half of the same rule, and the one nothing covered: the source stops following when
   * IT plays too, and what it stops on has to be where the scrub left it. Its transport reports a
   * time only once it has played a frame, so a take frozen on that instead opens at frame zero —
   * the head of the clip rather than the moment being judged.
   */
  it('starts the take where the scrub left it when the source itself plays', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))
    seekMontage(2_400_000)
    act(() => usePlayback.getState().setRunning(sourceOwner('doc-1'), true))

    expect(sourcePlayhead()).toBe(400_000)
  })

  /**
   * Following moves the take on every montage move, which leaves it nowhere to be PUT: recomputed
   * on every render instead, the position the monitor reports lasts one render and the rewind
   * button does nothing whatever. It holds until the head moves again, which resumes following.
   */
  it('lets the source be rewound, and follows the head again once it moves', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))
    seekMontage(2_400_000)
    act(() => {
      screen.getAllByRole('button', { name: /début/i })[0]?.click()
    })
    expect(sourcePlayhead()).toBe(0)

    seekMontage(2_600_000)
    expect(sourcePlayhead()).toBe(600_000)
  })

  /** Published while stopped, it survived the run that wrote it: the strip then stopped
   * following a scrub, and `sequence.split` cut where Play had been pressed. */
  it('hands the head back to the montage the moment the programme stops', () => {
    render(<SequenceDocument documentId="doc-1" />)
    const clock = built.find(deps => deps.owner === programOwner('doc-1'))
    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))

    act(() => usePlayback.getState().setRunning(programOwner('doc-1'), true))
    act(() => clock?.onTime?.(2_800_000))
    expect(usePlayback.getState().heads['doc-1']).toBe(2_800_000)

    // As `TimelineEngine.pause` has it: said to have stopped, THEN one last time reported.
    act(() => usePlayback.getState().setRunning(programOwner('doc-1'), false))
    act(() => clock?.onTime?.(3_000_000))

    expect(usePlayback.getState().heads['doc-1']).toBeUndefined()
    expect(sequenceStore.stateOf(useSequences.getState(), 'doc-1').playhead).toBe(3_000_000)
  })

  it('catches up with the head as soon as playback stops', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))
    act(() => usePlayback.getState().setRunning(programOwner('doc-1'), true))
    seekMontage(2_800_000)
    act(() => usePlayback.getState().setRunning(programOwner('doc-1'), false))

    expect(sourcePlayhead()).toBe(800_000)
  })

  // The head spends most of its time outside any one clip, and a take has no frame to show for
  // a moment it does not span.
  it('holds at the clip ends while the head is outside it', () => {
    render(<SequenceDocument documentId="doc-1" />)

    act(() => useSequences.getState().runCommand('doc-1', addClip('V1', later)))

    seekMontage(0)
    expect(sourcePlayhead()).toBe(0)

    // A frame short of the end: a clip spans up to but not including it, so landing exactly on
    // the end would show nothing at all.
    seekMontage(9_000_000)
    expect(sourcePlayhead()).toBe(1_000_000 - 1_000_000 / 25)
  })
})

describe('SequenceDocument transport focus', () => {
  /**
   * Two pictures playing at once is two audible streams and two hardware decoders fighting over
   * the GPU. The token already revokes whoever held it; this is the half that stops the key
   * from being aimed at two players in the first place.
   */
  it('hands the space bar to whichever monitor was clicked, and to only one of them', () => {
    render(<SequenceDocument documentId="doc-1" />)

    // A press on the source, which is what taking the focus comes to. `pointerDown` rather than
    // a click: aiming a monitor must not also start it.
    const playButtons = (): (string | null)[] =>
      screen
        .getAllByRole('button', { name: /Lire/ })
        .map(button => button.getAttribute('aria-label'))
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /Lire/ })[0] ?? document.body)

    // The armed one advertises the key and the other stops claiming it — the pair is never both.
    expect(playButtons()).toEqual(['Lire (Espace)', 'Lire'])
  })

  it('starts the program monitor when its play button is pressed', () => {
    render(<SequenceDocument documentId="doc-1" />)

    screen.getAllByRole('button', { name: /Lire/ })[1]?.click()

    expect(play).toHaveBeenCalledTimes(1)
  })

  it('starts the program monitor on the space bar, which its tooltip promises', () => {
    render(<SequenceDocument documentId="doc-1" />)

    fireEvent.keyDown(window, { code: 'Space' })

    expect(play).toHaveBeenCalledTimes(1)
  })

  it('leaves the space bar to the tab in front, since hidden tabs stay mounted', () => {
    useDocuments.setState({ activeId: 'doc-2' })
    render(<SequenceDocument documentId="doc-1" />)

    fireEvent.keyDown(window, { code: 'Space' })

    expect(play).not.toHaveBeenCalled()
  })

  it('leaves the source monitor to its button, so one space bar drives one picture', () => {
    render(<SequenceDocument documentId="doc-1" />)

    const names = screen
      .getAllByRole('button', { name: /Lire/ })
      .map(button => button.getAttribute('aria-label'))

    // The key is named from the bundle: the French interface used to announce `Space`.
    expect(names).toEqual(['Lire', 'Lire (Espace)'])
  })

  /**
   * The two monitors used to share the row down the middle with a `Separator` between them, which
   * draws a line and refuses to be moved. One of the two is always the one being judged — the
   * program while cutting, the source while choosing a take — and it is the one that needs room.
   */
  describe('the divider between the two monitors', () => {
    it('gives the source a width of its own once dragged, and the program the rest', () => {
      render(<SequenceDocument documentId="doc-1" />)
      const divider = screen.getByRole('separator', { hidden: true })

      fireEvent.pointerDown(divider, { pointerId: 1, clientX: 500 })
      fireEvent.pointerMove(divider, { pointerId: 1, clientX: 700 })

      // The source is the first monitor's own box, which only exists once a width was set on it.
      const source = screen.getByText('Source').closest('section')?.parentElement
      expect(source?.style.width).not.toBe('')
    })

    it('refuses to swallow either monitor, whichever way it is dragged', () => {
      render(<SequenceDocument documentId="doc-1" />)
      const divider = screen.getByRole('separator', { hidden: true })

      fireEvent.pointerDown(divider, { pointerId: 1, clientX: 500 })
      fireEvent.pointerMove(divider, { pointerId: 1, clientX: -4000 })

      const source = screen.getByText('Source').closest('section')?.parentElement
      // `MIN_SPLIT`, through the same `fitSplit` the shell's own zones are clamped by.
      expect(Number.parseInt(source?.style.width ?? '0', 10)).toBeGreaterThanOrEqual(100)
    })
  })
})
