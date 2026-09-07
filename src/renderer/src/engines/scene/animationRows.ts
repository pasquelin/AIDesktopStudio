/**
 * The rows a scene's animation shows, the way a dope sheet lays them out: one line per SUBJECT —
 * an object, or one bone of a rig — and its channels folded underneath.
 *
 * The document holds none of this. It holds tracks, one per property, and that is the right shape
 * to evaluate: what a subject line adds is a way to READ them, which is why it is derived here
 * rather than stored. Folding a subject away must never lose a key.
 */
import {
  SCENE_SUBJECT_ID,
  type AnimationTimeline,
  type AnimationTrack,
} from '@shared/domain/animation'
import { reconcileOrder } from '@shared/domain/order'
import {
  CHANNEL_HEIGHT,
  SUBJECT_HEIGHT,
  mergedKeys,
  subjectKey,
  type AnimationRow,
  type ClipBlock,
  type ShotBar,
} from '../timeline/bandRows'
import { shotCameras } from './cameraShots'
import { drivenNodes } from './animationEval'

/** One object, or one bone of one object. Its channels are the tracks that drive it. */
export type SheetLane = {
  nodeId: string
  laneId: string
  name: string
  blocks: readonly ClipBlock[]
}

/** An object of the scene, as the sheet needs to name a line for it. */
export type SheetNode = {
  id: string
  name: string
}

/**
 * The subjects in the order the sheet shows them: the arrangement the user made first, then
 * whatever the scene has added since, in the order the scene holds it.
 *
 * The arrangement is a WAY OF WORKING and nothing else — objects one returns to are brought to
 * the top. It never touches the scene: the outliner keeps its own order, and an object moved here
 * stays exactly where the hierarchy put it.
 */
export function orderedSubjects(
  natural: readonly string[],
  preferred: readonly string[],
): string[] {
  const known = new Set(natural)
  // `reconcileOrder` rather than appending the newcomers at the end, and the difference is what
  // one SEES: an object added to the scene lands under the neighbours the hierarchy already gives
  // it, instead of at the bottom of a sheet somebody has arranged. Its header says as much — this
  // reconciliation had already been written twice before it was named.
  return reconcileOrder(
    preferred.filter(id => known.has(id)),
    natural,
    id => id,
  )
}

export type RowsOptions = {
  /**
   * The objects on stage — read for their NAMES and to know which still exist, never to decide
   * who gets a line. `timeline.sheet` decides that, and it is what the person put there.
   */
  nodes: readonly SheetNode[]
  /** Which subjects are unfolded. Absent from the set means folded, so a new one arrives folded. */
  expanded: ReadonlySet<string>
  /**
   * The lanes on stage. Their blocks come from the ENGINE, not the timeline: a clip's length
   * lives in the GLB, so nothing that reads only the document can know how long a block runs.
   */
  lanes?: readonly SheetLane[]
  /** How the user has arranged the lines. Empty leaves the scene's own order — see `orderedSubjects`. */
  order?: readonly string[]
  /**
   * What the scene's own composition line is called. Read from a bundle by the caller, because
   * `SCENE_SUBJECT_ID` names no node and every filter here goes through the node names.
   */
  sceneName: string
}

type RowContext = {
  rows: AnimationRow[]
  grouped: ReadonlyMap<string, readonly AnimationTrack[]>
  named: ReadonlyMap<string, string>
  lanesOfNode: ReadonlyMap<string, readonly SheetLane[]>
  expanded: ReadonlySet<string>
}

/**
 * The rows to draw, top to bottom.
 *
 * Subjects come in the order their first track does, so adding a track to an object already on
 * screen never makes the rows jump — the alternative, sorting by name, reorders the whole sheet
 * the moment an object is renamed.
 */
export function animationRows(timeline: AnimationTimeline, options: RowsOptions): AnimationRow[] {
  const rows: AnimationRow[] = []
  const grouped = tracksBySubject(timeline.tracks)
  const named = new Map(options.nodes.map(node => [node.id, node.name]))
  // The scene's composition is a subject with no node behind it. Naming it here rather than
  // branching everywhere below is what gives it a line at all: `shown`, the bone filter and
  // `push` all decide through this map.
  named.set(SCENE_SUBJECT_ID, options.sceneName)

  const context = {
    rows,
    grouped,
    named,
    lanesOfNode: lanesByNode(options.lanes),
    expanded: options.expanded,
  }

  const onAir = shotCameras(timeline.shots).filter(cameraId => named.has(cameraId))

  // The cameras on air open the sheet, in the order the DOCUMENT holds their shots — that order
  // IS the montage's law, so the eye and `activeShotAt` cannot disagree. Which is also why they
  // are left out of the arrangement below.
  for (const cameraId of onAir) pushRows(context, cameraId, barsOf(timeline, cameraId, named))

  /*
   * Who gets a line: what the person PUT on the sheet, plus whoever HOLDS a track. A house is
   * scenery and a character in front of it is animated — only the person can say which, and
   * deriving it from the scene put 8 000 blocks and 24 009 buttons on the band, measured 20/08.
   */
  // Whoever holds a track, and whoever PLAYS a clip: an animation applied from the Animations
  // panel or the Inspector never touches the sheet, and its model would play in the viewport with
  // no line to trim it on — while saving and reopening the same document gave it one, because
  // `sheetFromAnimated` counts it. Live and reloaded disagreed.
  const keyed = [
    ...drivenNodes(timeline),
    ...(options.lanes ?? []).flatMap(lane => (lane.blocks.length > 0 ? lane.nodeId : [])),
  ]
  // The sheet first, then whoever holds a track. Through a `Set`, which keeps each one at its
  // FIRST place — an object both on the sheet and keyed appears where the sheet put it.
  const shown = [...new Set([...timeline.sheet, ...keyed])].filter(id => named.has(id))
  const isShown = new Set(shown)

  /** The objects first, in the order the sheet holds them, then the bones keyed inside them. */
  const natural = [
    ...shown.filter(id => !onAir.includes(id)),
    // A bone is keyed inside its object, so it rides on the object's own place on the sheet.
    ...[...grouped.entries()]
      .filter(([key, tracks]) => !named.has(key) && isShown.has(tracks[0]?.target.nodeId ?? ''))
      .map(([key]) => key),
  ]

  for (const key of orderedSubjects(natural, options.order ?? [])) pushRows(context, key)

  return rows
}

function tracksBySubject(tracks: readonly AnimationTrack[]): Map<string, AnimationTrack[]> {
  const grouped = new Map<string, AnimationTrack[]>()
  for (const track of tracks) {
    const key = subjectKey(track.target)
    const found = grouped.get(key)
    if (found) found.push(track)
    else grouped.set(key, [track])
  }
  return grouped
}

function lanesByNode(lanes: readonly SheetLane[] = []): Map<string, SheetLane[]> {
  const grouped = new Map<string, SheetLane[]>()
  for (const lane of lanes) {
    const found = grouped.get(lane.nodeId)
    if (found) found.push(lane)
    else grouped.set(lane.nodeId, [lane])
  }
  return grouped
}

function pushRows(context: RowContext, key: string, bars?: readonly ShotBar[]): void {
  const tracks = context.grouped.get(key) ?? []
  const bone = tracks[0]?.target.bone
  const nodeId = bone ? (tracks[0]?.target.nodeId ?? key) : key
  const expanded = context.expanded.has(key)
  context.rows.push({
    kind: 'subject',
    id: key,
    name: subjectName(context.named, nodeId, bone),
    height: SUBJECT_HEIGHT,
    expanded,
    keys: mergedKeys(tracks),
    tracks,
    bars,
  })
  if (!expanded) return
  pushChannels(context.rows, tracks)
  pushLanes(context.rows, context.lanesOfNode.get(key) ?? [])
}

function subjectName(named: ReadonlyMap<string, string>, nodeId: string, bone?: string): string {
  const plain = named.get(nodeId) ?? nodeId
  return bone ? `${plain} · ${bone}` : plain
}

function pushChannels(rows: AnimationRow[], tracks: readonly AnimationTrack[]): void {
  for (const track of tracks)
    rows.push({ kind: 'channel', id: track.id, name: track.name, height: CHANNEL_HEIGHT, track })
}

function pushLanes(rows: AnimationRow[], lanes: readonly SheetLane[]): void {
  for (const [rank, lane] of lanes.entries()) {
    rows.push({
      kind: 'lane',
      id: laneKey(lane.nodeId, lane.laneId),
      name: lane.name,
      height: CHANNEL_HEIGHT,
      nodeId: lane.nodeId,
      laneId: lane.laneId,
      last: rank === lanes.length - 1,
      blocks: lane.blocks,
    })
  }
}

/** The bars one camera's line carries, in the order the document lays its shots down. */
function barsOf(
  timeline: AnimationTimeline,
  cameraId: string,
  named: ReadonlyMap<string, string>,
): ShotBar[] {
  const name = named.get(cameraId) ?? cameraId
  return timeline.shots.flatMap(shot => (shot.cameraId === cameraId ? { shot, name } : []))
}

/** How a lane row is named, and what a hit test hands back — one spelling for both. */
export function laneKey(nodeId: string, laneId: string): string {
  return `lane:${nodeId}:${laneId}`
}

/** The row a click lands on, folded or not, so a caller never walks the list a second time. */
export function trackIdsOf(row: AnimationRow): string[] {
  if (row.kind === 'subject') return row.tracks.map(track => track.id)
  if (row.kind === 'channel') return [row.track.id]
  // A lane drives no channel: it plays clips the file brought.
  return []
}
