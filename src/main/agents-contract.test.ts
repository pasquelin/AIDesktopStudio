import { existsSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The agent contract holds by review, and until this file existed nothing checked it. Five ways it
 * broke silently: a `@` import of `CLAUDE.md` pointing at a file that moved · a `rule-*` skill
 * whose symlink broke, which deletes a rule with no message at all · `AGENTS.md` crossing the
 * 10 000-character cap where Grok truncates · a `name:` no longer matching its folder · a rule
 * naming a path that no longer exists, paid on 2026-09-08 when `interface.md` was authoritative on
 * `components/tokens.test.ts`, split into six files months earlier.
 *
 * **It goes quiet when `.agents/` is absent, and that is the price, not an oversight.** `.agents/`
 * and `.claude/` are git-ignored, so they never reach the CI checkout: this guard protects the
 * machine it runs on, at the `pnpm test` before a merge, and protects nothing on `ubuntu-latest`.
 * A guard that asserted anyway would be red on every CI run and would teach everyone to ignore it.
 */
const ROOT = join(import.meta.dirname, '..', '..')
const AGENTS = join(ROOT, '.agents')
const RULES = join(AGENTS, 'rules')
const CLAUDE_MD = join(ROOT, '.claude', 'CLAUDE.md')
const SKILLS = join(ROOT, '.claude', 'skills')
const GROK_SKILLS = join(ROOT, '.grok', 'skills')
const AGENT_SKILLS = join(AGENTS, 'skills')

/**
 * The two skills Claude Code must NOT be given, and it is a collision rather than a preference:
 * `/simplify` is built in, and the five `loop-*` are personal skills of `~/.claude/skills/`. Two
 * skills of one name collide. Grok has neither, so it mirrors everything.
 */
const CLAUDE_COLLIDES = (name: string) => name === 'simplify' || name.startsWith('loop-')

const present = existsSync(RULES) && existsSync(CLAUDE_MD) && existsSync(GROK_SKILLS)
const describeLocal = present ? describe : describe.skip

/** The trees a rule may name a path against, shortest first: the repo writes `shared/ipc.ts`. */
const SHORTHAND_ROOTS = [
  '',
  'src/',
  'src/main/',
  'src/renderer/src/',
  'src/shared/',
  'src/preload/',
  'docs/',
  'scripts/',
  '.agents/',
  '.agents/tools/',
]

/**
 * Names that look like paths and are not. `useItsName.ts` and `useSonNom.ts` are the templates the
 * naming rule spells its convention with; `assets/release.json` is written by GitHub Pages, never
 * by this repo.
 */
const NOT_PATHS = new Set(['hooks/useItsName.ts', 'hooks/useSonNom.ts', 'assets/release.json'])

const resolvesUnderRepo = (cited: string): boolean =>
  SHORTHAND_ROOTS.some(root => existsSync(join(ROOT, root, cited))) ||
  walk(join(ROOT, 'src')).some(file => file.endsWith(`/${cited}`))

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })
    : []

const ruleFiles = present ? readdirSync(RULES).filter(name => name.endsWith('.md')) : []
const claudeMd = present ? readFileSync(CLAUDE_MD, 'utf8') : ''
const imported = [...claudeMd.matchAll(/^@\.\.\/\.agents\/rules\/(.+\.md)$/gm)].flatMap(
  match => match[1] ?? [],
)
const skillDirs = present ? readdirSync(SKILLS).filter(name => name.startsWith('rule-')) : []

describeLocal('the agent contract, held rather than reviewed', () => {
  it('resolves every rule file CLAUDE.md imports', () => {
    expect(imported.filter(name => !existsSync(join(RULES, name)))).toEqual([])
    expect(imported.length).toBeGreaterThan(0)
  })

  it('reads every rule-* skill through its link', () => {
    const unreadable = skillDirs.filter(name => {
      try {
        return !readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8').startsWith('---')
      } catch {
        return true
      }
    })
    expect(unreadable).toEqual([])
    expect(skillDirs.length).toBeGreaterThan(0)
  })

  it('names each skill after the folder that holds it', () => {
    const mismatched = skillDirs.flatMap(name => {
      const declared = /^name:\s*(.+)$/m.exec(readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8'))
      const stated = declared?.[1]?.trim()
      return stated === name ? [] : [`${name} declares ${stated ?? 'no name'}`]
    })
    expect(mismatched).toEqual([])
  })

  it('exposes every rule file exactly once, as an import or as a skill', () => {
    const asSkill = new Set(
      skillDirs.map(name => basename(readlinkSync(join(SKILLS, name, 'SKILL.md')))),
    )
    const orphans = ruleFiles.filter(name => !imported.includes(name) && !asSkill.has(name))
    const both = ruleFiles.filter(name => imported.includes(name) && asSkill.has(name))
    expect({ orphans, both }).toEqual({ orphans: [], both: [] })
  })

  it('mirrors every shared skill to both agents that can hold one', () => {
    const shared = readdirSync(AGENT_SKILLS)
    const missingForGrok = shared.filter(name => !existsSync(join(GROK_SKILLS, name, 'SKILL.md')))
    const missingForClaude = shared
      .filter(name => !CLAUDE_COLLIDES(name))
      .filter(name => !existsSync(join(SKILLS, name, 'SKILL.md')))
    const collidingButGiven = shared
      .filter(CLAUDE_COLLIDES)
      .filter(name => existsSync(join(SKILLS, name)))
    expect({ missingForGrok, missingForClaude, collidingButGiven }).toEqual({
      missingForGrok: [],
      missingForClaude: [],
      collidingButGiven: [],
    })
  })

  it('keeps the core under the cap where Grok truncates without a word', () => {
    const core = readFileSync(join(AGENTS, 'AGENTS.md'), 'utf8')
    expect([...core].length).toBeLessThan(10_000)
  })

  it('cites no path that has gone', () => {
    const dead = ruleFiles.flatMap(name => {
      const text = readFileSync(join(RULES, name), 'utf8')
      return (
        [...text.matchAll(/`([\w.@/-]+\.(?:md|mjs|sh|ts|tsx|json|txt|py|css|yml))`/g)]
          .flatMap(match => match[1] ?? [])
          // A leading slash is a URL Vite serves, not a path on disk: `pieges.md` names
          // `/src/stores/scenes.ts` to say which of two module instances the app loads.
          .filter(cited => cited.includes('/') && !cited.startsWith('/') && !NOT_PATHS.has(cited))
          .filter(cited => !resolvesUnderRepo(cited))
          .map(cited => `${name} → ${cited}`)
      )
    })
    expect(dead).toEqual([])
  })
})
