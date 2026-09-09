import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const alias = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@game': resolve('src/game'),
  '@': resolve('src/renderer/src'),
}

/**
 * Twelve times the default, raised from 15 s on 2026-09-08. A rendering case with `userEvent`
 * takes a few hundred milliseconds on an idle machine and several times that when the whole suite
 * runs across every core — and this one carries a dozen sessions at once. Long enough to tell a
 * busy machine from a wedged test.
 *
 * 🛑 Raised HERE and never test by test. Measured over five passes: the set of victims MOVES —
 * `world.determinism`, `missionCatalogue`, `batterie`, `no-unclosed-memory-database`, five
 * different verdicts — so naming the slow ones only redirects the next red somewhere else. Every
 * one of them passes alone in seconds.
 *
 * Named because every project below has to repeat it: a project inherits nothing from the root
 * `test` block, so the value written once governed nothing.
 */
const TEST_TIMEOUT = 60_000

/**
 * The zone every suite reads its clocks in, so a date test answers the same everywhere.
 *
 * Left to the machine, a test about time passes for whoever wrote it and fails for the next reader.
 * Measured before fixing it: the whole suite is green under `UTC` and under `Asia/Tokyo` alike.
 *
 * **What depends on this pin is any case asserting a LOCAL reading**, not a number of them: this
 * paragraph said "exactly one case" and a review counted three, across two files. A count drifts
 * the moment another case leans on the pin, and it sends the next reader to the wrong file.
 *
 * Tokyo rather than UTC, and rather than Paris. **Not UTC**: a zone at zero offset makes every
 * assertion about zones agree by accident, which is the defect the case above exists to catch.
 * **Not Paris**: it observes daylight saving, so a stamp near midnight changes day twice a year
 * and a suite green in August goes red in November. `Asia/Tokyo` is UTC+9 all year.
 *
 * **Set on this process, NOT through a project's `env` block** — measured, and the difference is
 * the whole reason this paragraph exists. `env: { TZ }` reaches the worker after Node has already
 * resolved its zone, so the case above still read the machine's and still failed under `TZ=UTC`.
 * Assigning it here runs while the config is evaluated, before any worker is spawned, so every
 * pool inherits it.
 */
const TEST_TZ = 'Asia/Tokyo'

process.env.TZ = TEST_TZ

/**
 * Worker threads, where Vitest defaults to child processes since its version 2. What it buys is the
 * start of each worker: a process costs more than a thread, and this suite pays that once per
 * worker either way.
 *
 * Two paired series on 2026-08-12, CPU (user+sys), and they DISAGREE on how much:
 *
 *   under load ~110 : 400 s → 347 s   (−13 %)
 *   under load ~40  : 486 s → 447 s   (−8 %)
 *
 * The direction held in both and in every pair; the size did not. Read this as "somewhere between
 * eight and thirteen percent, on a machine shared with other work" rather than as a figure — a
 * single number here would be the one a later reader trusts.
 *
 * `forks` is what a native module that is not thread-safe demands, and ONE such module is reached
 * by the suites: `node:sqlite`. It is a native binding like any other, experimental at that — the
 * first `pnpm validate` with threads on all three projects ended in SIGSEGV. `better-sqlite3` is
 * NOT the one: only `sqliteNative.ts` imports it, which only `catalogWorker` loads. The
 * dictation addon sits behind a `utilityProcess` no test starts.
 *
 * Hence `forks` on the `node` project alone. Its effect is what a review measured, and it is the
 * mechanism rather than the crash: counting the PIDs that log `ExperimentalWarning: SQLite`, the
 * twelve loads happen in TWELVE processes here, against ONE process on twelve threads when all
 * projects use threads. **It does NOT prevent the crash, and that is now measured rather than
 * doubted**: on 2026-08-13, one whole-suite run in fifty ended in `EXIT=139` — SIGSEGV, twelve
 * processes killed mid-flight, no summary printed. Cumulative rate under the parade: **1 in 81**.
 * An insurance, not a fix.
 *
 * **What the hunt for it established, so that nobody pays for it twice** — two series of 25 runs,
 * one crash in the first, none in the second:
 * - macOS wrote **no crash report** for it (`~/Library/Logs/DiagnosticReports`, empty at that
 *   minute while `node` reports from other days sit right there). There is no stack to read.
 * - `node:sqlite` is the suspect the paragraph above names, and nothing measured incriminates it.
 *   Its warnings were the only thing on screen because **nothing else prints before the summary**,
 *   which designates it no more than any other module.
 * - The concrete hypothesis was tested and is dead: 500 `DatabaseSync` opened without `close()`
 *   and finalised under a forced GC, five times, crash none. The native finaliser is not it.
 *
 * At one in eighty-one, with no report and no isolated repro, **catching it in the act costs more
 * than waiting for it**. Reopen only with a mechanism in hand, never with more runs.
 *
 * Stated per project, and that is not redundancy: a project inherits nothing from the root `test`
 * block unless it says `extends`, and none here does. A review asked each project which side it
 * runs on: with the pool set at the root alone, all three answer `child_process`.
 */
const TEST_POOL = 'threads'

/**
 * The renderer tests that must keep a browser, established by RUNNING them under `node` rather
 * than by reading them — on 2026-08-12, 247 files, of which 43 failed. Grepping for `document.`
 * would have named 39 and missed the ones whose need is transitive: a store reaching a module
 * that touches `window`, a helper that walks an element.
 *
 * One entry PASSES under node and is here anyway; its own note says why. Passing is not the whole
 * test, which is why no count of "the ones that fail" governs this list.
 *
 * They are the exception, so they are the list: a new `.test.ts` lands in the fast project and
 * FAILS loudly if it needs a browser, which its author sees at once. Listing the others instead
 * would leave every new file in jsdom, and nobody would notice.
 *
 * A file leaves this list the day it stops needing a DOM — nothing measures that on its own, and
 * a stale entry costs only the second it wastes.
 */
const DOM_BOUND = [
  'src/renderer/src/features/shell/documentIo01Split01.test.ts',
  'src/renderer/src/features/shell/documentIo01Split02.test.ts',
  'src/renderer/src/features/shell/documentIo01Split03.test.ts',
  'src/renderer/src/features/shell/documentIo01Split04.test.ts',
  'src/renderer/src/features/shell/documentIo02.test.ts',
  'src/renderer/src/features/shell/documentIo03.test.ts',
  'src/renderer/src/features/shell/documentIo04Split01.test.ts',
  'src/renderer/src/features/shell/documentIo04Split02.test.ts',
  'src/renderer/src/features/shell/documentIo04Split03.test.ts',
  'src/renderer/src/features/shell/documentIo04Split04.test.ts',
  'src/renderer/src/features/shell/documentIo04Split05.test.ts',
  'src/renderer/src/features/shell/documentIo05Split01.test.ts',
  'src/renderer/src/features/shell/documentIo05Split02.test.ts',
  'src/renderer/src/features/shell/documentIo05Split03.test.ts',
  'src/renderer/src/features/shell/documentIo05Split04.test.ts',
  'src/renderer/src/features/shell/documentIo05Split05.test.ts',
  'src/renderer/src/features/shell/documentIo06.test.ts',
  // The composer makes a canvas per layer to read its pixels back, and a spy has to have
  // something to stand in FOR.
  'src/renderer/src/features/image/psdDocument.test.ts',
  // Not for a DOM: the name it proposes is « Sans titre N », composed by `i18next` — only the
  // renderer setup initialises it, and an uninitialised `t` answers with no string at all.
  'src/renderer/src/features/shell/newDocument.test.ts',
  // The same reason: a generated script asked for a tab of its own is named the same way.
  'src/renderer/src/stores/codeGeneration.test.ts',
  // Imports the definition of all twenty-one panels, so it loads every panel component. It
  // PASSES under node — and covers less: the branches those modules run at import take the
  // other path without a browser, and `panels/**` went four branches over its budget.
  'src/renderer/src/features/shell/components/toolComponents.test.ts',
  'src/renderer/src/features/shell/unsavedGuard.test.ts',
  // `renderHook` mounts into a document, and this one has no component to make it a `.tsx`.
  'src/renderer/src/hooks/useInputCapture.test.ts',
  'src/renderer/src/hooks/useTaskChoices.test.ts',
  'src/renderer/src/hooks/usePixelPreview.test.ts',
  'src/renderer/src/hooks/usePixelArtGrid.test.ts',
  'src/renderer/src/features/dictation/insertAtCaret.test.ts',
  'src/renderer/src/engines/audio/audioRender.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine01.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine02.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine03.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine04.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine05.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine06Split01.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine07.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine08Split01.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine08Split02.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine08Split03.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine08Split04.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine09Split01.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine09Split02.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine09Split03.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine09Split04.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine10.test.ts',
  'src/renderer/src/engines/canvas/CanvasEngine11.test.ts',
  'src/renderer/src/engines/canvas/CanvasOverlayBrush.test.ts',
  'src/renderer/src/engines/canvas/CanvasOverlayFrame.test.ts',
  'src/renderer/src/engines/canvas/CanvasOverlayTools.test.ts',
  'src/renderer/src/engines/code/CodeEditor.test.ts',
  'src/renderer/src/engines/core/canvas2d.test.ts',
  'src/renderer/src/engines/core/offScreenHost.test.ts',
  'src/renderer/src/engines/core/palette.test.ts',
  'src/renderer/src/engines/timeline/bandPainter.test.ts',
  // Draws the round mark of a joint on a canvas, exactly as `paneMaterials` draws its matcap.
  'src/renderer/src/engines/scene/boneJoints.test.ts',
  'src/renderer/src/engines/scene/bvhBuilder.test.ts',
  'src/renderer/src/engines/scene/bvh.worker.test.ts',
  'src/renderer/src/engines/scene/reliefBuild.worker.test.ts',
  'src/renderer/src/engines/scene/nodeKinds.test.ts',
  'src/renderer/src/engines/scene/paneDress.test.ts',
  'src/renderer/src/engines/scene/paneMaterials.test.ts',
  // Drives the worker by dispatching at `self`, which only a browser global has.
  'src/renderer/src/engines/scene/retarget.worker.test.ts',
  'src/renderer/src/engines/scene/reliefSculpt.worker.test.ts',
  // Writes a real GLB, and `GLTFExporter` reaches for `FileReader`.
  'src/renderer/src/engines/scene/glbSkin.test.ts',
  'src/renderer/src/engines/scene/rigRead.test.ts',
  'src/renderer/src/engines/scene/rigRoundTrip.test.ts',
  'src/renderer/src/engines/scene/sceneExport.test.ts',
  // A stage opens an off-screen host before anything else, and a host is a div in a document.
  'src/renderer/src/engines/scene/sceneStage.test.ts',
  'src/renderer/src/engines/scene/scene-models.test.ts',
  'src/renderer/src/engines/scene/sceneRendererRefreshModels.test.ts',
  // Constructs SceneRenderer, which draws a matcap on a canvas.
  'src/renderer/src/engines/scene/instanceableModel.test.ts',
  'src/renderer/src/engines/scene/scene-renderer-animation.test.ts',
  'src/renderer/src/engines/scene/scene-renderer-bones.test.ts',
  'src/renderer/src/engines/scene/scene-renderer-export.test.ts',
  'src/renderer/src/engines/scene/scene-renderer-loaders.test.ts',
  'src/renderer/src/engines/scene/scene-renderer-reskin.test.ts',
  'src/renderer/src/engines/scene/scene-renderer-sync.test.ts',
  'src/renderer/src/engines/scene/sceneRendererGroups.test.ts',
  // Mounts the engine to watch what holds the active zone; `paneMaterials` draws its matcap.
  'src/renderer/src/engines/scene/sceneRendererZone.test.ts',
  'src/renderer/src/engines/scene/sceneRendererExportOrder.test.ts',
  'src/renderer/src/engines/scene/threeFactory.test.ts',
  'src/renderer/src/engines/skybox/SkyboxRenderer01.test.ts',
  'src/renderer/src/engines/skybox/SkyboxRenderer02.test.ts',
  'src/renderer/src/engines/skybox/SkyboxRenderer03.test.ts',
  'src/renderer/src/engines/skybox/SkyboxRenderer04.test.ts',
  'src/renderer/src/engines/material/MaterialRenderer.test.ts',
  'src/renderer/src/engines/timeline/TimelineEngine.mount.test.ts',
  'src/renderer/src/engines/timeline/painter.test.ts',
  // The stage it stands in for hands back a canvas, and a canvas is what the sink wraps.
  'src/renderer/src/engines/timeline/sceneSink.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split01.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split02.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split03.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split04.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split05.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split06.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split07.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split08.test.ts',
  'src/renderer/src/engines/viewport/ViewportEngine01Split09.test.ts',
  'src/renderer/src/helpers/menuIcon.test.ts',
  // Not for a DOM of their own: they read the labels a menu is raised with, and `i18next` is only
  // initialised by the renderer setup — `initI18n` reads `localStorage`, which node has not.
  'src/renderer/src/features/explorer/assetMenu.test.ts',
  'src/renderer/src/features/image/components/Layer/List/layerMenu.test.ts',
  'src/renderer/src/features/scene/components/Scene/Document/sceneAddMenu.test.ts',
  'src/renderer/src/features/scene/components/Scene/sceneNodeMenu.test.ts',
  'src/renderer/src/features/character/components/CharacterDocument/workshopNodeMenu.test.ts',
  'src/renderer/src/engines/scene/sceneRendererMorphs.test.ts',
  'src/renderer/src/helpers/modelForCapability.test.ts',
  'src/renderer/src/helpers/toolRegistry.test.ts',
  'src/renderer/src/helpers/typing.test.ts',
  'src/renderer/src/hooks/useAssistantDoor.test.ts',
  'src/renderer/src/hooks/useAutomaticPulls.test.ts',
  'src/renderer/src/hooks/useCharacterFit.test.ts',
  'src/renderer/src/hooks/useColumnKeys.test.ts',
  'src/renderer/src/hooks/useContextMenu.test.ts',
  'src/renderer/src/hooks/useCostEstimate.test.ts',
  'src/renderer/src/hooks/useLatest.test.ts',
  'src/renderer/src/hooks/useLoadable.test.ts',
  // Not for a DOM either: it reads the sentences out of the French bundle, which only the
  // renderer setup initialises.
  'src/renderer/src/hooks/useModelFit.test.ts',
  'src/renderer/src/hooks/useModelReach.test.ts',
  'src/renderer/src/hooks/usePlanRefusal.test.ts',
  'src/renderer/src/hooks/useReloadKey.test.ts',
  'src/renderer/src/hooks/useShortcutLabel.test.ts',
  'src/renderer/src/i18n/index.test.ts',
  'src/renderer/src/features/image/imageTools.test.ts',
  'src/renderer/src/features/material/deriveChannel.test.ts',
  'src/renderer/src/features/scene/components/Scene/sceneTools.test.ts',
  'src/renderer/src/features/video/components/videoTools.test.ts',
  'src/renderer/src/stores/dictation.test.ts',
  'src/renderer/src/stores/documents.test.ts',
  'src/renderer/src/stores/layouts.test.ts',
  // Reads what a previous session stored back out of `localStorage`, as the layouts do.
  // The frames a game runs on are `requestAnimationFrame`, which only a browser has.
  'src/renderer/src/stores/play.test.ts',
  'src/renderer/src/stores/skeletonProfiles.test.ts',
  'src/renderer/src/stores/models.test.ts',
  'src/renderer/src/testSetup.test.ts',
]

export default defineConfig({
  // Injected by `define` in electron.vite.config.ts, so a module reaching for one under vitest
  // would throw a bare ReferenceError. Development is the truthful answer here: the tests are
  // the dev run.
  define: {
    __DEV__: 'true',
    __COMMIT_HASH__: JSON.stringify('test'),
  },
  test: {
    testTimeout: TEST_TIMEOUT,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          // Repeated from the root block, which a project does NOT inherit: three guards that
          // parse a whole folder failed announcing `timed out in 5000ms` under a config saying
          // fifteen. The root value governs no project, so every project states its own.
          // `forks` here, and only here: the suites bind `node:sqlite`, which is a native binding
          // like any other. A whole-suite run under threads segfaulted once — see TEST_POOL.
          pool: 'forks',
          testTimeout: TEST_TIMEOUT,
          include: ['src/{main,preload,shared}/**/*.test.ts'],
          // Anchored like the line above, and for a reason `include` alone does not cover: the
          // benchmark glob is a SEPARATE setting with its own default, `**/*.bench.*`, which is
          // not anchored at all. Left to it, `pnpm bench` walked into `worktrees/` and
          // measured the branches of other sessions — 72 lines of another checkout's numbers,
          // presented as this one's.
          benchmark: { include: ['src/{main,preload,shared}/**/*.bench.ts'] },
          setupFiles: ['src/main/testSetup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          pool: TEST_POOL,
          testTimeout: TEST_TIMEOUT,
          // Every component test, plus the `.test.ts` that were measured to need a browser.
          include: ['src/renderer/**/*.test.tsx', ...DOM_BOUND],
          // The same split as the tests, and it has to be stated: a project with no benchmark
          // glob of its own keeps the unanchored default and runs EVERY bench of the tree —
          // this one was measuring the main process's, under jsdom, on top of the `node` project
          // already doing it. A `.bench.tsx` lands HERE, and `tools.bench.tsx` is one on purpose:
          // it needs the `localStorage` that `persist` writes to, which `node` does not have.
          benchmark: { include: ['src/renderer/**/*.bench.tsx'] },
          // Stylesheets are stubbed to an empty string by default, `?raw` included — which
          // silently empties the checks that read a rule back. Only the raw reads are spared;
          // nothing that a component imports for its styles is processed.
          css: { include: [/\.css\?raw$/] },
          setupFiles: ['src/renderer/src/testSetup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          /**
           * The bench's own fixtures, which `src` globs never reach. Free and offline, unlike
           * `pnpm banc`, so it belongs to the gate. Anchored on `scripts/banc/` and not on
           * `scripts/`: that is what `tsconfig.banc.json` covers, and a test outside it would
           * run having never been typechecked.
           */
          name: 'banc',
          // jsdom: the bench drives the REAL renderer handlers through `runAction`, and the
          // stores they read are written for a window.
          environment: 'jsdom',
          setupFiles: ['src/renderer/src/testSetupStores.ts'],
          pool: TEST_POOL,
          testTimeout: TEST_TIMEOUT,
          include: ['scripts/banc/**/*.test.ts'],
          benchmark: { include: ['scripts/banc/**/*.bench.ts'] },
        },
      },
      {
        resolve: { alias },
        test: {
          /**
           * The game runtime, which is neither the window nor the main process: it has to run
           * inside an exported game that ships none of the studio, so it gets a project of its
           * own rather than a corner of one — no setup file, and nothing of the studio in scope.
           *
           * jsdom because that is where a game runs: a port reading a `KeyboardEvent` needs one.
           * What this tree may IMPORT is held by `src/main/game-imports.test.ts`.
           */
          name: 'game',
          environment: 'jsdom',
          pool: TEST_POOL,
          testTimeout: TEST_TIMEOUT,
          // `.tsx` as well, though nothing here may import React: the guards sweep `\.tsx?$`, and
          // a file no project includes runs nowhere while looking covered.
          include: ['src/game/**/*.test.ts', 'src/game/**/*.test.tsx'],
          benchmark: { include: ['src/game/**/*.bench.ts'] },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'renderer-node',
          // The renderer tests that never touch a browser. jsdom and the renderer setup cost them
          // more than they run: on 2026-08-12, 221 cases of `helpers/` executed in 700 ms under
          // 45.9 s of environment and 26.9 s of setup. Three alternating pairs over the same
          // sample: 32.9 s of jsdom against 16.7 s here.
          environment: 'node',
          pool: TEST_POOL,
          testTimeout: TEST_TIMEOUT,
          include: ['src/renderer/**/*.test.ts'],
          // The renderer's benchmarks, anchored for the reason the `node` project gives.
          benchmark: { include: ['src/renderer/**/*.bench.ts'] },
          exclude: DOM_BOUND,
          // The half of the renderer setup that needs no browser. Without it these suites kept
          // the defect the DOM ones were cured of, and each had to write its own reset.
          setupFiles: ['src/renderer/src/testSetupStores.ts'],
          // Three files read a stylesheet back through `?raw` and fail without this, which is how
          // it was found: they are not DOM-bound, they were parser-bound.
          css: { include: [/\.css\?raw$/] },
        },
      },
    ],
  },
})
