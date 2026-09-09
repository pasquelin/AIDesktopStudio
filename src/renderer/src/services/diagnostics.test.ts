import { localizedError } from '@shared/localizedError'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_LOG_MESSAGE, type LogScope } from '@shared/ipc'
import { bridgeWatchingLogs } from './fakeBridge'
import { forgetReportedFailures, reportFailure, reportRenderFailure } from './diagnostics'

/** The two halves of the rule, spelled out so a scope that changes side has to be moved here. */
const GESTURES: readonly LogScope[] = [
  'scene.export',
  'image.export',
  'document.save',
  'document.close',
  'document.delete',
  'assets.reveal',
  'material.channel',
]

const SPONTANEOUS: readonly LogScope[] = [
  'document.load',
  'scene.model',
  'scene.texture',
  'canvas.layer',
  'font.face',
  'shell.render',
  'shell.layout',
]

beforeEach(forgetReportedFailures)

describe('reportFailure', () => {
  it('sends the failure to the process that owns the log', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))

    expect(bridge.report).toHaveBeenCalledWith({
      level: 'error',
      scope: 'scene.model',
      message: 'mesh-1: unreadable',
    })
  })

  // A thrown string is as ordinary as a thrown Error, and losing it would defeat the point.
  it('describes a rejection that is not an Error', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('scene.export', 'glb', 'disk full')

    expect(bridge.entries()[0]?.message).toBe('glb: disk full')
  })

  /**
   * An engine is rebuilt whenever a panel is detached or a document reopens, and each rebuild
   * asks for every missing asset again: without this, a project whose folder moved refills the
   * log on every detach.
   */
  it('says a given failure once', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))
    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))

    expect(bridge.report).toHaveBeenCalledTimes(1)
  })

  it('still says it for another subject, and for another scope', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))
    reportFailure('scene.model', 'mesh-2', new Error('unreadable'))
    reportFailure('scene.texture', 'mesh-1', new Error('unreadable'))

    expect(bridge.report).toHaveBeenCalledTimes(3)
  })

  // Another project's assets are another story: the same id there is news again.
  it('says it again once what was reported is forgotten', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))
    forgetReportedFailures()
    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))

    expect(bridge.report).toHaveBeenCalledTimes(2)
  })

  /**
   * The other half of the rule. Somebody pressed ⌘S a second time precisely because the first
   * did nothing, and the deduplication used to answer that with silence — leaving a save that
   * kept failing indistinguishable from one that worked, with only the dirty bullet to say so.
   */
  it('says a failed gesture every time it is made', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('document.save', 'doc-1', new Error('no project'))
    reportFailure('document.save', 'doc-1', new Error('no project'))
    reportFailure('document.save', 'doc-1', new Error('no project'))

    expect(bridge.report).toHaveBeenCalledTimes(3)
  })

  // Every scope in the set, not just the one that prompted it: a scope added there without a
  // test is a failure that will start repeating with nobody noticing.
  it.each(GESTURES)('says a failed %s every time', scope => {
    const bridge = bridgeWatchingLogs()

    reportFailure(scope, 'subject', new Error('nope'))
    reportFailure(scope, 'subject', new Error('nope'))

    expect(bridge.report).toHaveBeenCalledTimes(2)
  })

  // Reported from a mount effect, and a tab remounts on every workspace switch: repeating it
  // would refill the journal for one document whose file will not read.
  it.each(SPONTANEOUS)('says a spontaneous %s once', scope => {
    const bridge = bridgeWatchingLogs()

    reportFailure(scope, 'subject', new Error('nope'))
    reportFailure(scope, 'subject', new Error('nope'))

    expect(bridge.report).toHaveBeenCalledTimes(1)
  })

  it('keeps saying a spontaneous failure once, even after a gesture failed', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('document.save', 'doc-1', new Error('no project'))
    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))
    reportFailure('scene.model', 'mesh-1', new Error('unreadable'))

    expect(bridge.report).toHaveBeenCalledTimes(2)
  })

  it('cuts a message no terminal would show whole before it crosses', () => {
    const bridge = bridgeWatchingLogs()

    reportFailure('scene.model', 'mesh-1', new Error('x'.repeat(10_000)))

    expect(bridge.entries()[0]?.message).toHaveLength(MAX_LOG_MESSAGE)
  })

  // This IS the path failures travel: it must not become one itself.
  it('says nothing, and throws nothing, when there is no bridge', () => {
    vi.stubGlobal('studio', undefined)

    expect(() => reportFailure('scene.model', 'mesh-1', new Error('gone'))).not.toThrow()
  })

  // Awaited on purpose: the rejection is what would surface as an unhandled one a tick later,
  // and a synchronous `not.toThrow()` could never see it.
  it('absorbs a report the boundary itself refuses', async () => {
    const refused = Promise.reject(new Error('no channel'))
    bridgeWatchingLogs({ diagnostics: { report: () => refused } })

    reportFailure('scene.model', 'mesh-1', new Error('gone'))

    await expect(refused.catch(() => 'settled')).resolves.toBe('settled')
  })
})

/** What React hands `onCaughtError`: a blank first line, then one indented frame per component. */
const STACK =
  '\n    at Inspector (http://localhost/src/panels/inspector/Inspector.tsx:117:3)\n    at Panel'

describe('reportRenderFailure', () => {
  // The deepest frame, not the outermost: the boundary that caught it is the one thing already
  // visible on screen, and the component under it is what has to be fixed.
  it('names the component React blamed, so the line says where the render broke', () => {
    const bridge = bridgeWatchingLogs()

    reportRenderFailure(new Error('cannot read properties of null'), STACK)

    expect(bridge.report).toHaveBeenCalledWith({
      level: 'error',
      scope: 'shell.render',
      message: 'Inspector: cannot read properties of null',
    })
  })

  /**
   * React omits the stack for a lazy chunk that never resolved, and in a production build the
   * frames can come back empty. A report that threw on that would lose the crash it exists for.
   */
  it('still reports a crash React could not attribute', () => {
    const bridge = bridgeWatchingLogs()

    reportRenderFailure(new Error('boom'), undefined)

    expect(bridge.entries()[0]?.message).toBe(`${localizedError('unnamedComponent').message}: boom`)
  })

  // A component that throws on render throws again on every re-render of its parent, and the
  // boundary's retry button is one click away from doing exactly that.
  it('says a given component once', () => {
    const bridge = bridgeWatchingLogs()

    reportRenderFailure(new Error('first'), STACK)
    reportRenderFailure(new Error('second'), STACK)

    expect(bridge.report).toHaveBeenCalledTimes(1)
  })
})
