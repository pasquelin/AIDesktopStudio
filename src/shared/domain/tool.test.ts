import { describe, expect, it } from 'vitest'
import { isHorizontal } from '@pasquelin/panels'
import {
  SCENARIO_TOOLS,
  placementIn,
  placementOf,
  placementsOf,
  HOME_SURFACE,
  serves,
  TOOL_PLACEMENTS,
  type ToolId,
  type ToolSlot,
  type ToolSurface,
  type ToolZone,
} from './tool'
import {
  GENERATIVE_WORKSPACE_IDS,
  LIBRARY_WORKSPACE_IDS,
  WORKSPACE_IDS,
  type WorkspaceId,
} from './workspace'

const TOOL_IDS: ToolId[] = [...new Set(TOOL_PLACEMENTS.map(placement => placement.id))]

/** The upper right in declaration order — which is the order the rail stacks its icons. */
function upperRightIn(workspace: WorkspaceId): ToolId[] {
  return TOOL_PLACEMENTS.filter(
    placement =>
      placement.zone === 'right' && placement.slot === 'primary' && serves(placement, workspace),
  ).map(placement => placement.id)
}

describe('the placements of one tool', () => {
  it('never overlap — a workspace must not have to choose between two zones', () => {
    for (const id of TOOL_IDS) {
      for (const workspace of WORKSPACE_IDS) {
        const serving = placementsOf(id).filter(placement => serves(placement, workspace))
        expect(serving.length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('share a slot, or the tool would change rail row with the workspace', () => {
    for (const id of TOOL_IDS) {
      const slots = new Set(placementsOf(id).map(placement => placement.slot))
      expect(slots.size).toBe(1)
    }
  })
})

describe('resolving where a tool sits', () => {
  // One placement for all six, where there used to be two: the shelf reads the same question
  // in every space — what can I get from Scenario — so it has no reason to move with the space.
  it('puts the asset shelf in the left column of every workspace a library serves', () => {
    for (const workspace of LIBRARY_WORKSPACE_IDS) {
      expect(placementIn('assets', workspace)?.zone).toBe('left')
      expect(placementIn('assets', workspace)?.slot).toBe('primary')
    }
  })

  it('serves the shelf wherever a library holds something — it is never simply absent', () => {
    for (const workspace of LIBRARY_WORKSPACE_IDS) {
      expect(placementIn('assets', workspace)).not.toBeNull()
    }
  })

  /**
   * 🛑 The one space that generates WITHOUT a library, and the compiler cannot say it: both
   * `surfaces` lists are derived, so putting `code` back in `CATALOGUE_FAMILIES` would open a
   * shelf of pictures beside the editor with nothing to report it.
   */
  it('generates in Code and browses no library there', () => {
    expect(placementIn('generator', 'code')).not.toBeNull()
    expect(placementIn('assets', 'code')).toBeNull()
  })

  /** The band of the Code space, and of no other: nothing else holds text a compiler reads. */
  it('puts the problems in Code’s band alone', () => {
    expect(placementIn('problems', 'code')).toMatchObject({ zone: 'bottomRight' })
    for (const workspace of WORKSPACE_IDS.filter(one => one !== 'code')) {
      expect(placementIn('problems', workspace), workspace).toBeNull()
    }
  })

  it('answers null for a workspace a tool does not serve', () => {
    expect(placementIn('timeline', 'image')).toBeNull()
    expect(placementIn('layers', '3d')).toBeNull()
  })

  it('answers null for an id no version knows any more', () => {
    expect(placementIn('moodboard', 'image')).toBeNull()
    expect(placementOf('moodboard')).toBeNull()
  })
})

describe('every workspace', () => {
  it('has somewhere to generate from, wherever a model runs', () => {
    for (const workspace of GENERATIVE_WORKSPACE_IDS) {
      expect(placementIn('generator', workspace)).not.toBeNull()
    }
  })

  it('can inspect what is selected, from the lower half of the right column', () => {
    for (const workspace of WORKSPACE_IDS) {
      expect(placementIn('inspector', workspace)).toMatchObject({
        zone: 'right',
        slot: 'secondary',
      })
    }
  })

  it('is served by at least one panel', () => {
    for (const workspace of WORKSPACE_IDS) {
      expect(TOOL_PLACEMENTS.some(placement => serves(placement, workspace))).toBe(true)
    }
  })

  it('is named by the placements that claim it', () => {
    const known: readonly string[] = [...WORKSPACE_IDS, HOME_SURFACE]
    for (const placement of TOOL_PLACEMENTS) {
      for (const surface of placement.surfaces) expect(known).toContain(surface)
    }
  })
})

describe('the home', () => {
  /**
   * SIX placements, where there were eleven until 13 August. The eight that went then answered
   * a question about the studio — what it spent, how many assets it holds by kind, the newest
   * ones, favourites, ideas, look-alikes, and two journals the status bar already carries — and
   * this screen is where one comes to OPEN something. The ninth was the account's remote library,
   * and it went for the same reason. The list is spelled out rather than counted: an id creeping
   * back in is the exact regression this holds against.
   *
   * The two that came back are the two about the project that is OPEN, and both are withheld
   * while none is: what has changed in its folder, and what came before. That is a different
   * thing from the eight, which spoke about the studio whether or not anything was open.
   *
   * The order is the order of the rail, and the first of a half is what an unchosen half draws —
   * so this holds both the icon stack and what the screen opens on.
   */
  it('stands its panels in two columns and a band, in the order their icons stack', () => {
    const served = TOOL_PLACEMENTS.filter(placement => serves(placement, HOME_SURFACE))

    expect(served.map(placement => [placement.id, placement.zone, placement.slot])).toEqual([
      // The one panel this screen shares with the spaces, and the reason its right column is no
      // longer empty: one talks to the studio from the home as much as from an editor.
      ['assistant', 'right', 'primary'],
      ['projects', 'left', 'primary'],
      ['explorer', 'left', 'secondary'],
      // Declared after it on purpose, and the order is what says so: the folder is what an
      // unchosen half opens on, and the versions of that folder are what one goes to look at next.
      ['git', 'left', 'secondary'],
      ['context', 'left', 'secondary'],
      ['history', 'bottomRight', 'primary'],
    ])
  })

  /**
   * The rule every space follows: the left is what one opens FROM, the right is what one opens.
   *
   * The left column holds both halves, as every space does — the projects above, and under them
   * the one that is open, read as a folder. The right holds the ASSISTANT and nothing else, which
   * reverses what this said until 28 August: the rule was that this screen acts on no document,
   * so it had nothing to open into. Talking to the studio is not acting on a document, and the
   * home is where one asks it to make something in the first place.
   *
   * The BAND is new on 17 August, and it is the one zone this screen had never had. What it
   * holds is read across — a history is one commit per line, and a branch graph in a 280 px
   * column is a graph nobody can follow — and it is offered only while a project is open, so the
   * screen a reader arrives on with nothing open is the one it has always been.
   */
  it('reads its two columns the way every space reads its own', () => {
    const served = TOOL_PLACEMENTS.filter(placement => serves(placement, HOME_SURFACE))
    const inHalf = (zone: ToolZone, slot: ToolSlot): string[] =>
      served
        .filter(placement => placement.zone === zone && placement.slot === slot)
        .map(placement => placement.id)

    expect(inHalf('left', 'primary')).toEqual(['projects'])
    // A rota of three, all about the open project: its folder, that folder's history, and the
    // world what is made in it is set in.
    expect(inHalf('left', 'secondary')).toEqual(['explorer', 'git', 'context'])
    expect(inHalf('right', 'primary')).toEqual(['assistant'])
    // Still nothing: what an inspector reads is a selection, and this screen holds no document
    // to select in.
    expect(inHalf('right', 'secondary')).toEqual([])
    expect(inHalf('bottomRight', 'primary')).toEqual(['history'])
    // The band's left half is where a panel is DRAGGED, never where one is declared.
    expect(inHalf('bottomLeft', 'primary')).toEqual([])
  })

  /**
   * They read the studio rather than a document, which is what a workspace's columns are not
   * for: a panel of recent projects beside an editor is a panel about somewhere else.
   */
  it('keeps its panels to itself, and takes none of the workspaces', () => {
    expect(placementsOf('projects')).toHaveLength(1)
    for (const workspace of WORKSPACE_IDS) expect(placementIn('projects', workspace)).toBeNull()
  })

  /**
   * The Explorer left this surface for the projects on 10 August and came back on the 17th, as
   * the project folder itself rather than as the flat list of documents that stood in for it.
   *
   * The same half in all seven, and that is not a preference: a tool is held to ONE slot across
   * its placements — a panel that changed rows of the rail depending on where you came from is
   * a panel this registry cannot express.
   */
  it('keeps the Explorer in one half, here as in every space', () => {
    expect(placementsOf('explorer')).toHaveLength(2)
    const everywhere: readonly ToolSurface[] = [...WORKSPACE_IDS, HOME_SURFACE]
    for (const surface of everywhere) {
      expect(placementIn('explorer', surface)).toMatchObject({ zone: 'left', slot: 'secondary' })
    }
  })

  it('is not a workspace: no document kind or workspace menu can name it', () => {
    const surfaces: readonly string[] = WORKSPACE_IDS
    expect(surfaces).not.toContain(HOME_SURFACE)
  })
})

describe('a horizontal band', () => {
  it('is never cut in two — it holds one panel across its width', () => {
    for (const placement of TOOL_PLACEMENTS) {
      if (isHorizontal(placement.zone)) expect(placement.slot).toBe('primary')
    }
  })
})

describe('the left column', () => {
  const upperOf = (workspace: WorkspaceId): Set<string> =>
    new Set(
      TOOL_PLACEMENTS.filter(
        placement =>
          placement.zone === 'left' && placement.slot === 'primary' && serves(placement, workspace),
      ).map(placement => placement.id),
    )

  it('holds the Scenario panels, and only them, in the upper half of a workspace with a library', () => {
    for (const workspace of LIBRARY_WORKSPACE_IDS) {
      expect(upperOf(workspace)).toEqual(new Set(SCENARIO_TOOLS))
    }
  })

  /** The generator alone, where the library has nothing to list — Code, and Code alone. */
  it('holds the generator alone in the upper half of a workspace with no library', () => {
    for (const workspace of GENERATIVE_WORKSPACE_IDS.filter(
      one => !LIBRARY_WORKSPACE_IDS.includes(one),
    )) {
      expect(upperOf(workspace)).toEqual(new Set(['generator']))
    }
  })

  it('is the only place they sit, and the same place in every workspace', () => {
    for (const id of SCENARIO_TOOLS) {
      for (const placement of placementsOf(id)) {
        expect(placement.zone).toBe('left')
        expect(placement.slot).toBe('primary')
      }
      expect(placementsOf(id)).toHaveLength(1)
    }
  })

  /**
   * Three turns above, two below, and the cut between them is what the column MEANS: what
   * Scenario offers, then what is already on my disk. The half is what keeps the shelf visible
   * WHILE the Explorer is read — which is the whole of the gesture that pulls one into the
   * other, and which taking turns would forbid by construction.
   */
  it('holds what one produces with in its lower half, and nothing else', () => {
    // The spaces' own half. The home's left column is the same zone and the same slot, and it
    // holds the projects — a surface that calls no model, so the rule above is not about it.
    const lower = TOOL_PLACEMENTS.filter(
      placement =>
        placement.zone === 'left' &&
        placement.slot === 'secondary' &&
        WORKSPACE_IDS.some(workspace => serves(placement, workspace)),
    )

    // Three, and all three read the PROJECT — as a tree, as a history of the same files, and as
    // the world they are made in. That is what keeps them one rota rather than a pile: whichever
    // is in front, the half is still "the project I am working in". A reading of something else
    // — a document, the account, the studio — would not belong.
    expect(lower.map(placement => placement.id)).toEqual(['explorer', 'git', 'context'])
  })
})

describe('the rail order of the upper right', () => {
  /**
   * The assistant opens every one of them, and that is the whole of the 28 August lot: it was a
   * button in the title bar, reachable only by ⌘K or by a word nobody read. First of the half
   * means it is what an untouched right column draws — see `solo` below.
   */
  it('begins with the assistant, in every space', () => {
    for (const workspace of WORKSPACE_IDS) expect(upperRightIn(workspace)[0]).toBe('assistant')
  })

  // What the right keeps once the Explorer has gone left: what acts on the document that is
  // already open, and only that.
  it('reads the panels of the document, and no longer the Explorer', () => {
    expect(upperRightIn('image')).toEqual(['assistant', 'layers', 'text'])
  })

  it('reads the scene in 3D, and no longer the shelf', () => {
    expect(upperRightIn('3d')).toEqual([
      'assistant',
      'scene',
      'guiTree',
      'lights',
      'meshes',
      'world',
    ])
  })

  /**
   * The assistant ALONE, and it is the shelf leaving that emptied these two of everything else.
   * Asserted rather than left unsaid — the day something is declared there this line is what
   * asks whether it belongs.
   */
  it('leaves the upper right of Video and Audio to the assistant alone', () => {
    expect(upperRightIn('video')).toEqual(['assistant'])
    expect(upperRightIn('audio')).toEqual(['assistant'])
  })

  /**
   * Nothing else, since what a sky IS and how it is LOOKED at both went back to the inspector —
   * the first on 2026-08-19, the second right after. Two boxes describing one document were two
   * places to learn to find, and the second sat above an inspector reading "select something".
   */
  it('leaves the upper right of Skyboxes to the inspector alone', () => {
    expect(upperRightIn('skyboxes')).toEqual(['assistant'])
  })

  /**
   * Nothing either, and for the same reason: the eight channels and the saved styles both became
   * sections of the inspector on 2026-08-19. Textures was the last space to stack three boxes on
   * one document — what it IS, what reads it, and the panel that describes what is selected.
   */
  it('leaves the upper right of Textures to the inspector alone', () => {
    expect(upperRightIn('materials')).toEqual(['assistant'])
  })

  /**
   * ONE panel takes its zone whole, and it is this one: a conversation read in half a column is
   * a conversation nobody holds. Held as a closed list rather than as a property of the
   * assistant — a second `solo` panel is a right column two panels fight over.
   */
  it('is the only half a panel may take whole', () => {
    expect(TOOL_PLACEMENTS.filter(placement => placement.solo).map(placement => placement.id)) //
      .toEqual(['assistant'])
  })

  /**
   * 🛑 `solo` only silences the SECOND half, so a `secondary` asking for it would put the column
   * away and then be resolved away itself — leaving the zone drawing the primary's fallback with
   * an orphaned stash behind it. Held here rather than left to the one placement that uses it.
   */
  it('lets only the half nearest the edge take the zone whole', () => {
    expect(TOOL_PLACEMENTS.filter(placement => placement.solo && placement.slot !== 'primary')) //
      .toEqual([])
  })
})

describe('the montage band', () => {
  it('is the timeline wherever there is time to read, and free everywhere else', () => {
    const timed: readonly WorkspaceId[] = ['video', 'audio', '3d']
    for (const workspace of WORKSPACE_IDS) {
      expect(placementIn('timeline', workspace)?.zone ?? null).toBe(
        timed.includes(workspace) ? 'bottomRight' : null,
      )
    }
  })

  /**
   * What the band holds in the three spaces with no montage: the history, and nothing else. It
   * used to be the shelf, and the band emptied when the shelf went to the left column — a zone
   * whose only tool is one nobody opens by default is a zone that reads as broken, so the fact
   * that ONE tool is still declared there is worth an assertion rather than a hope.
   */
  it('still offers the history in the spaces that have no montage', () => {
    const untimed: readonly WorkspaceId[] = ['image', 'materials', 'skyboxes']
    for (const workspace of untimed) {
      expect(placementIn('history', workspace)?.zone).toBe('bottomRight')
    }
  })
})
