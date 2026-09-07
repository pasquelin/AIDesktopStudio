import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW = readFileSync(
  join(import.meta.dirname, '..', '..', '.github/workflows/pages.yml'),
  'utf8',
)

/**
 * Where the site goes, and where it deliberately no longer goes.
 *
 * Pages published the same render as the domain, under `pasquelin.github.io/AIDesktopStudio/`,
 * with neither address pointing at the other. Alban's call on 2026-09-07: one address, the old
 * one answering 404. The file is still named `pages.yml` — two guards and `RELEASE.md` cite it
 * by that name — so nothing but this case says the destination changed.
 */
describe('the showcase', () => {
  it('no longer publishes to GitHub Pages', () => {
    expect(WORKFLOW).not.toContain('deploy-pages')
    expect(WORKFLOW).not.toContain('upload-pages-artifact')
    expect(WORKFLOW).not.toContain('configure-pages')
  })

  // Absence proves nothing on its own: a workflow that deploys nowhere passes the case above.
  it('rsyncs its build to the server that answers for the domain', () => {
    expect(WORKFLOW).toContain('rsync')
    expect(WORKFLOW).toContain('www.aidesktopstudio.com')
  })

  /**
   * The write scopes went with the job. Left behind they would hand every step of this workflow —
   * and anything a dependency runs inside it — a token that can publish to Pages.
   */
  it('asks for no write scope it no longer uses', () => {
    expect(WORKFLOW).not.toContain('pages: write')
    expect(WORKFLOW).not.toContain('id-token: write')
  })

  /**
   * 🛑 `rsync --delete` puts whatever was built over the live site, and a manual run carries no
   * ref constraint: gating on `workflow_dispatch` alone let any branch overwrite production, and
   * nothing repaints it until the next qualifying push. Both gates name the input, and name
   * `push` rather than reading `github.ref` — a dispatch from `main` satisfied that on its own.
   */
  it('deploys from a manual run only where the run asked for it', () => {
    const gates = WORKFLOW.match(/github\.event_name == 'release'[^\n]*\n[^\n]*\n[^\n]*/g) ?? []

    expect(gates.length).toBe(2)
    for (const gate of gates) {
      expect(gate).toContain("github.event_name == 'workflow_dispatch' && inputs.deploy")
      expect(gate).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    }
  })
})
