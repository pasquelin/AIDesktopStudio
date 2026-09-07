/**
 * Tool registry, shared by both processes. It lives in `shared/` because `{ id, zone }` is
 * domain data, not UI: the native menu needs it to restore a removed tool, and the renderer
 * enriches it with icons and components. Duplicating it in the main process would degrade
 * `ToolId` to `string` and force a cast back on the other side.
 */
import type { Slot, Zone } from '@pasquelin/panels'
import {
  GENERATIVE_WORKSPACE_IDS,
  LIBRARY_WORKSPACE_IDS,
  WORKSPACE_IDS,
  type WorkspaceId,
} from './workspace'

/**
 * A surface panels can stand on: one of the workspaces, or the home screen.
 *
 * The home is deliberately NOT a `WorkspaceId`, and the criterion is what a workspace IS: a
 * place that opens documents of a kind of its own. The home opens the other spaces' documents
 * and makes none, so a workspace opening no document would be a fiction the union has to guard
 * against. It only ever needed to be a place a panel can sit, which is this and no more.
 */
export type ToolSurface = WorkspaceId | 'home'

export const HOME_SURFACE = 'home'

/**
 * Surfaces that share one arrangement of zones.
 *
 * The workspaces share theirs on purpose: what is open is stored per zone, so a shelf opened
 * in Image is still there in Video. The home shares with none — it never stands beside a
 * workspace, and its left column holds the Explorer where they hold generation. One state for
 * both would make closing the Explorer close the Models panel, and naming it overwrite the panel
 * the user had named there.
 */
export type SurfaceFamily = 'workspaces' | 'home'

export function familyOf(surface: ToolSurface): SurfaceFamily {
  return surface === HOME_SURFACE ? 'home' : 'workspaces'
}

/**
 * Where a tool hangs — the chassis' own zone, under the studio's name. Types only: `shared/`
 * holds no runtime dependency, and a type import is erased.
 */
export type ToolZone = Zone

export type ToolId =
  | 'assistant'
  | 'layers'
  | 'world'
  | 'meshes'
  | 'lights'
  | 'timeline'
  | 'explorer'
  | 'git'
  | 'history'
  | 'scene'
  | 'guiTree'
  | 'generator'
  | 'inspector'
  | 'assets'
  | 'projects'
  | 'text'
  | 'context'
  | 'problems'

/**
 * The panels the upper half of a WORKSPACE's left column is reserved for: what the Scenario API
 * offers. A generation to run, and the assets the account holds. Nothing else may sit in that
 * half of a workspace, and neither sits anywhere else — `tool.test.ts` enforces both directions,
 * and both are scoped to `WORKSPACE_IDS`. The home is outside the rule and always was: it calls
 * no model, and its upper left holds the projects.
 *
 * 🛑 THREE until ADR-23, and the third was the rupture: picking a model and using it took turns
 * in one half, so generating meant opening Models, choosing, coming back, and starting again for
 * every attempt. The picker now lives INSIDE the generation panel, where a model is changed
 * without leaving what is being written. Managing them — installing, removing, reading what they
 * weigh — is a different question, and it moved to the settings.
 */
export const SCENARIO_TOOLS: readonly ToolId[] = ['generator', 'assets']

/** A zone is cut in two, and each half shows one tool at a time — the chassis' own slot. */
export type ToolSlot = Slot

/**
 * Where a tool sits. A tool may declare **more than one**, for disjoint sets of surfaces: the
 * Explorer sits in the same half of every space and of the home, but only the home's asks for a
 * project first — a space is a project already being edited.
 *
 * Two invariants hold across the placements of one tool, and `tool.test.ts` enforces them:
 * their surfaces never overlap, and they share a slot — a tool that changed half as well as
 * zone would land in a different row of the rail depending on where you came from.
 */
export type ToolPlacement = {
  id: ToolId
  zone: ToolZone
  slot: ToolSlot
  /** Surfaces the tool belongs to. Spelled out even when it is all of them: a panel that
   * never chose is a panel nobody decided about. */
  surfaces: readonly ToolSurface[]
  /**
   * What has to exist for this placement to be offered at all — absent rather than disabled,
   * because neither is something the reader can act on from the rail.
   *
   * On the PLACEMENT rather than on the tool, and the Explorer is why: it needs a project on the
   * home, where offering it would say « no project open » beside the very shelf that opens one,
   * and needs nothing in a space, which is already a project being edited.
   *
   * The state itself is not answered here — `shared/` holds no runtime dependency — but which
   * question to ask is a property of the panel, and it belongs beside the panel.
   */
  requires?:
    'project' | 'git' | 'cloud' | 'centreTaken' | 'sceneContents' | 'sceneDocument' | 'guiDocument'
  /**
   * Whether the panel takes its zone WHOLE: shown, the other half draws nothing. Only a
   * `primary` may ask for it — `tool.test.ts` holds that, the resolver silencing the second half
   * alone.
   */
  solo?: true
  /**
   * What the zone opens at while this tool leads it, where the zone's own width does not suit it.
   * A width the reader dragged wins over it.
   *
   * On the PLACEMENT and not on the tool: the room a panel needs is a fact of the ZONE it is in,
   * and a tool placed in two of them would otherwise have one answer for both.
   */
  opens?: number
}

/**
 * Tools sharing a zone AND a slot take turns; tools in different slots of the same zone show
 * together — stacked in a side column. A horizontal band has only a first half: it is read
 * across the whole width, and cutting it leaves two panels too narrow to be either.
 */
export const TOOL_PLACEMENTS: readonly ToolPlacement[] = [
  // The upper half of the left column is the Scenario side, in every space: the same two panels
  // in the same place, right under the button that makes a document.
  //
  // 🛑 No `requires: 'model'` since ADR-23. It made the rail DROP the generator's icon whenever
  // nothing served the space's family — the one moment a person needs the panel most, and the
  // panel is what would have offered them a model. It now says which of the five refusals it is.
  //
  // `GENERATIVE_WORKSPACE_IDS`, which is every space since Code gained the `code` family: a chat
  // cloud or a text model on this machine writes the script the way a diffusion model draws.
  { id: 'generator', zone: 'left', slot: 'primary', surfaces: GENERATIVE_WORKSPACE_IDS },
  // Second, so entering a space lands on the generator: a half with nothing chosen opens on the
  // first tool it declares, and generating is where every space starts.
  //
  // 🛑 `requires: 'cloud'`, unlike the generator beside it, and the difference is what the panel
  // could still show without a key: the generator has this machine's own models to offer and
  // says which of the five refusals it is, while a remote library with no account to open has
  // nothing at all — not one row, no local half since 25 August. An icon opening onto a panel
  // that can only ever say « configure a key » is an icon that lies about what it does.
  //
  // 🛑 `LIBRARY_WORKSPACE_IDS` and not the generator's own list, since Code gained a family: what
  // serves a script is a chat, which publishes no assets, so this shelf would have stood beside
  // the editor listing pictures.
  {
    id: 'assets',
    zone: 'left',
    slot: 'primary',
    surfaces: LIBRARY_WORKSPACE_IDS,
    requires: 'cloud',
  },

  // The lower half: the documents to produce into. Its own half rather than a third turn in the
  // upper one, so the generator stays visible WHILE the Explorer is read.
  { id: 'explorer', zone: 'left', slot: 'secondary', surfaces: WORKSPACE_IDS },

  // The upper right, in rail order. Every tool here takes its turn with the others its space
  // declares — the order below is the order their icons stack.
  //
  // First of them all, and on every surface: this is the studio one TALKS to, and a panel one
  // has to go looking for is a panel one stops using. An untouched right column therefore opens
  // on it, whole — `solo` — rather than on the layer stack it used to.
  //
  // 🛑 `requires: 'centreTaken'`: with no document open the empty centre holds the same thread,
  // and an icon here would offer a second field on the one draft.
  {
    id: 'assistant',
    zone: 'right',
    slot: 'primary',
    surfaces: [...WORKSPACE_IDS, HOME_SURFACE],
    requires: 'centreTaken',
    solo: true,
    // A conversation at the column's own 260 wraps every sentence onto three lines.
    opens: 460,
  },
  { id: 'layers', zone: 'right', slot: 'primary', surfaces: ['image'] },
  // Beside the stack rather than inside the inspector: what a caption is SET IN is read while it
  // is being typed, and an inspector folded away takes the whole type panel with it.
  { id: 'text', zone: 'right', slot: 'primary', surfaces: ['image'] },
  // The outliner of the scene, which the Explorer used to hold in this one workspace — it now
  // lists the documents of the project in every space, which is a different question.
  {
    id: 'scene',
    zone: 'right',
    slot: 'primary',
    surfaces: ['3d'],
    requires: 'sceneContents',
  },
  // The outliner of an interface, beside the scene's rather than folded into it: the 3D
  // space opens two kinds now, and one panel answering for both would answer for neither.
  {
    id: 'guiTree',
    zone: 'right',
    slot: 'primary',
    surfaces: ['3d'],
    requires: 'guiDocument',
  },
  {
    id: 'lights',
    zone: 'right',
    slot: 'primary',
    surfaces: ['3d'],
    requires: 'sceneDocument',
  },
  {
    id: 'meshes',
    zone: 'right',
    slot: 'primary',
    surfaces: ['3d'],
    requires: 'sceneDocument',
  },
  {
    id: 'world',
    zone: 'right',
    slot: 'primary',
    surfaces: ['3d'],
    requires: 'sceneDocument',
  },
  // What a character can be made to play, on the right where the panels that steer a document
  // already are. Its rows are dragged onto the band below, which is why the two face each other.

  // The other half of the right column, and always up: what is selected is read WHILE a
  // model is chosen and a prompt written, and in an editor the inspector is never the panel
  // you have to switch away to.
  { id: 'inspector', zone: 'right', slot: 'secondary', surfaces: WORKSPACE_IDS },

  // The band is the timeline's, across the whole width — that is how time is read, in Audio and
  // Video as in 3D, where an animation runs along the same line a montage does.
  { id: 'timeline', zone: 'bottomRight', slot: 'primary', surfaces: ['video', 'audio', '3d'] },
  // What the compiler said about the script in front, under the script in front — the band, where
  // a list read one row at a time across a whole width belongs. Code's alone: the other spaces
  // hold no text a compiler reads.
  //
  // 🛑 The editor itself is NOT here, and that is the whole of the 27 August lot: it was a panel
  // of this band in the 3D space, where nothing on the rail said it existed. A script is a
  // DOCUMENT now, so it opens in the centre like every other one and Code is a space of its own.
  { id: 'problems', zone: 'bottomRight', slot: 'primary', surfaces: ['code'] },

  // The home's own, and they serve it ALONE — a column beside an editor is for what acts on what
  // is in front of you, and each of these reads the studio rather than a document.
  //
  // TWO, where there were eleven until 13 August. The eight that went then were readings of the
  // studio nobody came to this screen for: what an account had spent, how many assets it held by
  // kind, the newest ones it made, favourites, ideas, look-alikes, and two journals the status bar
  // already carries. The home is an entry point — where one comes to open something — and every
  // panel that answered a question instead of offering a way in was a panel between the reader
  // and the projects. The ninth was the account's own library, and it was the same defect one
  // rung up: a column of somebody's remote assets, beside the folder they would land in.
  //
  // Both are in the LEFT column, and the home's right one is empty as a result. That is the shape
  // the rule produces rather than an oversight: the left is what one opens FROM, and nothing this
  // screen does acts on a document in front of you.
  //
  // The upper left, which the home alone leaves for something other than generation: it makes no
  // document, so the half goes to what one produces IN — the projects, the first thing anyone
  // comes to this screen for.
  { id: 'projects', zone: 'left', slot: 'primary', surfaces: [HOME_SURFACE] },

  // Under them, the project that is open, read as a folder. The same half it occupies in every
  // space, which is not a preference: `tool.test.ts` holds a tool to ONE slot across all of its
  // placements, so a panel that changed rows of the rail depending on where you came from is a
  // panel this registry cannot express.
  //
  // It replaces the flat list of documents this screen carried until 17 August. That list showed
  // the studio's own documents and nothing else; the folder holds them and everything the user
  // put beside them, which is what an entry point should offer a way into.
  //
  // Offered only while a project IS open: the panel would otherwise stand on the home saying
  // that nothing is open, beside the shelf whose whole purpose is to open one. Here and not on
  // the workspace placement above, a space being a project already being edited.
  {
    id: 'explorer',
    zone: 'left',
    slot: 'secondary',
    surfaces: [HOME_SURFACE],
    requires: 'project',
  },

  // The project's own history, in the half the project's own FOLDER occupies — it answers about
  // the same files, and the two are read one after the other rather than side by side. Declared
  // last so the Explorer stays what an untouched half opens on, in every surface: the folder is
  // what one reaches for, and the versions are what one goes to look at.
  //
  // Every surface, and one placement rather than two: a tool is held to one slot across all of
  // its placements, and splitting these would only be a way of writing the same slot twice.
  //
  // Offered only while a project IS open, for the reason the Explorer gives above: what is
  // versioned is a project folder, and there is nothing to say about one that is not open. In a
  // space that is always true; on the home it is the whole point.
  {
    id: 'git',
    zone: 'left',
    slot: 'secondary',
    surfaces: [...WORKSPACE_IDS, HOME_SURFACE],
    requires: 'project',
  },

  // What the project is ABOUT, in the half that already holds what the project IS — its folder,
  // and what has changed in it. The three answer one question between them: the folder I am
  // working in, its history, and the world everything in it is set in.
  //
  // Declared last, so an untouched half still opens on the Explorer: this one is written now and
  // then and read while generating, where the folder is what one reaches for by default.
  //
  // Offered only while a project IS open, like the two beside it: the context is a file of the
  // project folder, and there is nothing to write into one that is not open.
  {
    id: 'context',
    zone: 'left',
    slot: 'secondary',
    surfaces: [...WORKSPACE_IDS, HOME_SURFACE],
    requires: 'project',
  },

  // The versions themselves, in the band — where the timeline is, and for the same reason: both
  // are read ACROSS, one commit or one frame at a time, and a branch graph in a 280 px column is
  // a graph nobody can follow. The column beside it holds the files of whichever version is
  // picked, which is why the band and not a second column.
  //
  // Declared after the shelf and the montage, so entering a space still opens on the panel that
  // space is for. Someone who wants the history asks for it.
  //
  // The home as well, which reverses what this said until 17 August — and the argument it
  // reversed is worth keeping, because it still holds for the eight panels the home lost on
  // 13 August: a panel that answers a question about the studio stands between the reader and
  // their projects. The history is not one of those. It answers a question about the project
  // that is OPEN, and the Git panel already sits in the home's left column saying what has
  // changed — a reader who can see that and not what came before it is reading half a sentence.
  //
  // `git` and not `project`: a folder git is not tracking has no versions to read, and this one
  // takes the whole width of the band to say so. The Git panel carries that sentence, with the
  // button that acts on it; here it was a strip of nothing across the foot of the window.
  {
    id: 'history',
    zone: 'bottomRight',
    slot: 'primary',
    surfaces: [...WORKSPACE_IDS, HOME_SURFACE],
    requires: 'git',
  },
]

/**
 * The panels as a closed list, for the doors that publish one — the tool schema an MCP client
 * reads, and the validator behind it.
 *
 * Derived from the placements rather than written out: a panel with nowhere to sit is one the
 * rail never draws and `revealTool` refuses, so the placements ARE the list. A third copy of the
 * sixteen names is what this avoids, and it had already drifted once.
 */
export const TOOL_IDS: readonly ToolId[] = [...new Set(TOOL_PLACEMENTS.map(({ id }) => id))]

/**
 * Any placement of a tool, for the questions a surface does not change — its slot, and
 * whether the id is one this version still knows.
 *
 * Takes `unknown` on purpose: it doubles as the guard for ids read back from persisted state,
 * where an entry left over from an older version must be dropped rather than trusted.
 */
export function placementOf(id: unknown): ToolPlacement | null {
  return TOOL_PLACEMENTS.find(placement => placement.id === id) ?? null
}

export function placementsOf(id: unknown): ToolPlacement[] {
  return TOOL_PLACEMENTS.filter(placement => placement.id === id)
}

/**
 * The placements a workspace can show — every one that reaches a workspace at all.
 *
 * What is open is stored once per zone, for all six spaces, so a tool open in one of its zones
 * is opened in the others: the shelf must not go missing on the way from Image to Video. A
 * placement that serves the home ALONE is not in that game — the home never shares the screen
 * with a workspace, and propagating a half it named would take a column the spaces use for
 * something else. A placement serving both, as the Explorer's does, belongs to both.
 */
export function workspacePlacementsOf(id: unknown): ToolPlacement[] {
  return placementsOf(id).filter(placement =>
    placement.surfaces.some(surface => surface !== HOME_SURFACE),
  )
}

/**
 * Where a tool sits **on this surface**, or `null` if it does not serve it. This is what a
 * caller wants whenever it is about to open one: `placementOf` would answer with whichever
 * placement was declared first, which for the Explorer is the one that asks for no project —
 * offered on the home, where there may not be one.
 */
export function placementIn(id: unknown, surface: ToolSurface): ToolPlacement | null {
  return TOOL_PLACEMENTS.find(one => one.id === id && serves(one, surface)) ?? null
}

export function serves(placement: ToolPlacement, surface: ToolSurface): boolean {
  return placement.surfaces.includes(surface)
}
