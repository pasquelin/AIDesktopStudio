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
 * one answering 404. The file is still named `pages.yml` — three guards and `RELEASE.md` cite it
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
})
