import { aiRoleId } from '@shared/domain/aiRole'
import { beforeEach, describe, expect, it } from 'vitest'
import { shownIn, type OpenByZone, type Slot, type Zone } from '@pasquelin/panels'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { HOME_SURFACE, TOOL_PLACEMENTS, type ToolId, type ToolSurface } from '@shared/domain/tool'
import { WORKSPACE_IDS, type WorkspaceId } from '@shared/domain/workspace'
import { useModels } from '@/stores/models'
import { useSettings } from '@/stores/settings'
import { chooseModels } from '@/stores/models-fixtures'
import { useGit } from '@/stores/git'
import { trackByGit } from '@/stores/git-fixtures'
import { useProject } from '@/stores/project'
import { panelsStore } from '@/stores/panels'
import { chassisFor } from '@/stores/panels-fixtures'
import { IN_CENTRE, IN_WORKSPACE, NO_CLOUD, NO_GIT, NO_PROJECT } from './toolRegistry-fixtures'
import { toolIcon, toolsOffered, toolStateOf, TOOLS, type ToolState } from './toolRegistry'

/**
 * What a half DRAWS, through the chassis the shell hands these panels to. The studio's own
 * answer is which panel a surface declares first for a half; resolving one is the library's.
 */
function shown(
  tool: ToolId | null | undefined,
  zone: Zone,
  slot: Slot,
  surface: ToolSurface,
  state: ToolState,
): ToolId | undefined {
  const open: OpenByZone<ToolId> = tool === undefined ? {} : { [zone]: { [slot]: tool } }
  chassisFor(surface, open, state)
  return shownIn(panelsStore.getState(), zone)[slot]
}

/** The panels a surface offers in that zone, in the order the rail stacks them. */
function idsOf(zone: Zone, surface: WorkspaceId | typeof HOME_SURFACE): string[] {
  return toolsOffered(surface, toolStateOf())
    .filter(tool => tool.zone === zone)
    .map(tool => tool.id)
}

/** A project open, which is what the home's Explorer answers to. */
const openProject = (): void => {
  useProject.setState({
    project: {
      path: '/projects/demo',
      manifest: { version: 1, createdAt: '', updatedAt: '' },
    },
  })
}

beforeEach(() => {
  useModels.setState({ selected: {} })
  useSettings.setState({ settings: DEFAULT_SETTINGS })
  useProject.setState({ project: null })
  useGit.setState({ repository: { kind: 'no-project' } })
})

describe('the generator', () => {
  /**
   * 🛑 It used to be DROPPED from the rail whenever nothing served the space's family — the one
   * moment a person needs the panel most, and the panel is what would have offered them a model.
   * ADR-23 § D: the picker lives inside it, so the way out is where the problem is said.
   */
  it('is offered whether or not a model was ever chosen', () => {
    expect(idsOf('left', 'image')).toContain('generator')

    chooseModels({ [aiRoleId('image', 'txt2img')]: 'flux-dev' })
    expect(idsOf('left', 'image')).toContain('generator')
  })

  it('opens the half it shares with the shelf, whatever has been chosen', () => {
    expect(idsOf('left', 'image')).toEqual(['generator', 'assets', 'explorer'])
  })

  // Named for what it checks: a section with no model still shows every panel of its right
  // column — the two state rules answer for the generator and for the home's Explorer.
  it('leaves the right column alone — no model removes anything there', () => {
    expect(idsOf('right', 'materials')).toEqual(['assistant', 'inspector'])
  })
})

/**
 * The one panel the HOME offers conditionally. It reads a project folder, and the home is where
 * one is opened: standing there with none, it would say « no project open » beside the very
 * shelf that opens one. Every space keeps it — a space IS a project being edited.
 */
describe('the explorer on the home', () => {
  it('is absent while no project is open, and there the moment one is', () => {
    expect(idsOf('left', HOME_SURFACE)).toEqual(['projects'])

    openProject()
    // Three panels answer to a project on this screen now, and all three for the same reason:
    // the folder, the history of that folder, and what the project is about.
    expect(idsOf('left', HOME_SURFACE)).toEqual(['projects', 'explorer', 'git', 'context'])
  })

  it('stays in every space, which is a project already open', () => {
    expect(idsOf('left', 'image')).toContain('explorer')
  })

  // The half falls back to what the surface does put there — and the home has no Models panel
  // to fall back ON, which is what the workspaces' own fallback would have handed it.
  it('leaves its half empty rather than standing something else in it', () => {
    expect(shown('explorer', 'left', 'secondary', HOME_SURFACE, NO_PROJECT)).toBeUndefined()
    expect(shown('explorer', 'left', 'secondary', HOME_SURFACE, IN_WORKSPACE)).toBe('explorer')
  })
})

// The band is the widest surface of the window, and a folder git is not tracking has no versions
// to put in it. The Git panel carries that sentence, and the button that acts on it.
describe('the history over a folder git is not tracking', () => {
  it('is absent from the rail, and there the moment git answers about the folder', () => {
    openProject()
    expect(idsOf('bottomRight', 'image')).toEqual([])

    trackByGit()
    expect(idsOf('bottomRight', 'image')).toEqual(['history'])
  })

  /**
   * A command git refused says nothing about the folder — `no-identity` is what everybody meets
   * on their first commit — and the band is where the versions behind it are read. Taking it away
   * there tears the whole right column down and puts it back on the next refresh.
   */
  it('stays while a command failed, which is not a folder without versions', () => {
    openProject()
    useGit.setState({ repository: { kind: 'failed', reason: 'no-identity', detail: '' } })

    expect(idsOf('bottomRight', 'image')).toEqual(['history'])
  })

  // The repository is corrected asynchronously: a project closed still reads `ready` until the
  // next status lands, and the band went on offering the versions of the folder that just left.
  it('goes as soon as the project does, without waiting for git to be asked again', () => {
    trackByGit()
    openProject()
    expect(idsOf('bottomRight', 'image')).toEqual(['history'])

    useProject.setState({ project: null })
    expect(idsOf('bottomRight', 'image')).toEqual([])
  })

  // The band would otherwise open on it by itself: it is the only panel that half declares in
  // half the sections, so an untouched layout stood a strip of nothing across the window.
  it('leaves the band empty rather than opening on itself', () => {
    expect(shown(null, 'bottomRight', 'primary', 'image', NO_GIT)).toBeUndefined()
    expect(shown('history', 'bottomRight', 'primary', 'image', NO_GIT)).toBeUndefined()
  })

  // Where the montage shares the half, it is what the band falls back to — the same substitution
  // the generator's absence already makes in the left column.
  it('gives the half to the montage where the section has one', () => {
    expect(shown('history', 'bottomRight', 'primary', 'video', NO_GIT)).toBe('timeline')
  })
})

/**
 * A half nobody has chosen for holds `null`, and each section answers it on its own: what is
 * open is stored once for all six, while the panel that comes first differs in each. WHICH panel
 * that is, is the studio's answer; that a `null` half resolves at all is the chassis' own.
 */
describe('a half open on no panel in particular', () => {
  /**
   * The assistant in every space, since it is declared first in that half: an untouched right
   * column is the studio waiting to be talked to, whatever the space.
   */
  it('shows the assistant, which every section declares first in the upper right', () => {
    for (const workspace of WORKSPACE_IDS) {
      expect(shown(null, 'right', 'primary', workspace, IN_WORKSPACE)).toBe('assistant')
    }
  })

  // The panel behind it, once the centre is the one holding the conversation: the half falls to
  // what the section itself puts there, which is nothing at all in Video and Audio.
  it('falls to the section’s own panel while the centre holds the conversation', () => {
    expect(shown(null, 'right', 'primary', 'image', IN_CENTRE)).toBe('layers')
    expect(shown(null, 'right', 'primary', '3d', IN_CENTRE)).toBe('scene')
    // Neither Skyboxes nor Materials declares anything in that half any more: what a sky is, and
    // what a material is made of, are sections of the inspector.
    expect(shown(null, 'right', 'primary', 'skyboxes', IN_CENTRE)).toBeUndefined()
    expect(shown(null, 'right', 'primary', 'video', IN_CENTRE)).toBeUndefined()
    expect(shown(null, 'right', 'primary', 'audio', IN_CENTRE)).toBeUndefined()
  })

  it('reads the band as the history or the montage, per section', () => {
    expect(shown(null, 'bottomRight', 'primary', 'image', IN_WORKSPACE)).toBe('history')
    expect(shown(null, 'bottomRight', 'primary', 'audio', IN_WORKSPACE)).toBe('timeline')
  })

  it('opens the left column on the generator, and the half under it on the Explorer', () => {
    expect(shown(null, 'left', 'primary', 'image', IN_WORKSPACE)).toBe('generator')
    expect(shown(null, 'left', 'secondary', 'image', IN_WORKSPACE)).toBe('explorer')
  })

  // The distinction the store draws: an absent key is a closed half, `null` an open one. Reading
  // both as "nothing" would close every half nobody has clicked.
  it('is not a closed half, which shows nothing at all', () => {
    expect(shown(undefined, 'right', 'primary', 'image', IN_WORKSPACE)).toBeUndefined()
  })

  it('shows nothing where the section fills no such half', () => {
    expect(shown(null, 'bottomRight', 'secondary', 'image', IN_WORKSPACE)).toBeUndefined()
    // Named, too, and not only left unnamed: a band is read across its width, so a layout from
    // before 17 August still naming the shelf in its second half must draw no phantom there.
    expect(shown('assets', 'bottomRight', 'secondary', 'image', IN_WORKSPACE)).toBeUndefined()
  })
})

describe('what a half of a zone shows', () => {
  it('shows the tool it holds', () => {
    expect(shown('inspector', 'right', 'secondary', 'image', IN_WORKSPACE)).toBe('inspector')
  })

  /**
   * What the user opened is a zone, and it stays that zone across sections: the band holds the
   * montage in Video and the history everywhere else, neither reopened by hand on every switch.
   */
  it('shows what this section puts there when the tool it holds sits elsewhere', () => {
    expect(shown('assets', 'bottomRight', 'primary', 'video', IN_WORKSPACE)).toBe('timeline')
    expect(shown('assets', 'bottomRight', 'primary', 'image', IN_WORKSPACE)).toBe('history')
  })

  it('leaves a tool alone in the zone this section gives it', () => {
    expect(shown('timeline', 'bottomRight', 'primary', 'video', IN_WORKSPACE)).toBe('timeline')
    expect(shown('assets', 'left', 'primary', 'image', IN_WORKSPACE)).toBe('assets')
  })

  /**
   * 🛑 Absent rather than greyed, and unlike the generator beside it: that one still has this
   * machine's own models to offer, where a remote library with no account to open has not one
   * row. The half falls back to what it does hold.
   */
  it('keeps the remote browser out of a studio holding no key', () => {
    expect(shown('assets', 'left', 'primary', 'image', NO_CLOUD)).toBe('generator')
    expect(toolsOffered('image', NO_CLOUD).map(tool => tool.id)).not.toContain('assets')
  })

  it('substitutes within the half, never across the separator', () => {
    expect(shown('inspector', 'right', 'primary', 'image', IN_WORKSPACE)).toBe('assistant')
    expect(shown('layers', 'right', 'secondary', 'image', IN_WORKSPACE)).toBe('inspector')
  })

  // Where several tools share a half, the substitute is the first the registry declares. The
  // order of `TOOL_PLACEMENTS` is the choice, so it is spelled out here rather than left to
  // whoever reorders that table next.
  it('substitutes the first tool the half declares when several share it', () => {
    expect(shown('layers', 'right', 'primary', '3d', IN_CENTRE)).toBe('scene')
    expect(shown('inspector', 'left', 'primary', 'image', IN_WORKSPACE)).toBe('generator')
  })
})

describe('the glyphs of the rail', () => {
  /**
   * One glyph, one meaning. The comment above `ICONS` promises it, and only a test keeps the
   * promise: `counts` wore the mesh node's glyph for a day — harmless, since the two never share
   * a rail, but a rail one reads twice starts exactly there.
   */
  it('gives every panel a glyph of its own', () => {
    const byIcon = new Map<string, ToolId>()

    for (const { id } of TOOL_PLACEMENTS) {
      const held = byIcon.get(toolIcon(id))
      expect(held ?? id).toBe(id)
      byIcon.set(toolIcon(id), id)
    }
  })

  it('hands the panels the same glyph the rail draws', () => {
    for (const tool of TOOLS) expect(tool.icon).toBe(toolIcon(tool.id))
  })
})

/**
 * One half can silence the other, and only this way round: a panel declaring `solo` takes its
 * zone WHOLE. That the chassis honours it is its own suite's business — what is measured here is
 * that the studio still DECLARES it, on the panel it means to.
 */
describe('a zone whose first half takes it whole', () => {
  it('draws nothing in the other half', () => {
    chassisFor('image', { right: { primary: null, secondary: 'inspector' } }, IN_WORKSPACE)

    expect(shownIn(panelsStore.getState(), 'right')).toEqual({ primary: 'assistant' })
  })

  // The stored half is untouched: what silences it is a reading, so the inspector is back the
  // moment the assistant is not what the column draws.
  it('gives it back once the whole-zone panel is not the one drawn', () => {
    chassisFor('image', { right: { primary: null, secondary: 'inspector' } }, IN_CENTRE)

    expect(shownIn(panelsStore.getState(), 'right')).toEqual({
      primary: 'layers',
      secondary: 'inspector',
    })
  })

  it('leaves a zone alone where nothing takes it whole', () => {
    chassisFor('image', { left: { primary: null, secondary: null } }, IN_WORKSPACE)

    expect(shownIn(panelsStore.getState(), 'left')).toEqual({
      primary: 'generator',
      secondary: 'explorer',
    })
  })
})
