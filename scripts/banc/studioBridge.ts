import { ANIMATION_GRAPH_EXTENSION, animationGraphOf } from '@shared/domain/animationGraph'
import type { Asset } from '@shared/domain/asset'
import { DOCUMENT_VERSION, type DocumentDescriptor } from '@shared/domain/document'
import { documentFileName } from '@shared/domain/documentName'
import { stemOf } from '@shared/domain/fileName'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { nameOf, parentOf, pathIn } from '@shared/domain/folder'
import { SCRIPT_EXTENSION, type GameManifest } from '@shared/domain/game'
import { INPUT_MAP_EXTENSION, inputMapOf } from '@shared/domain/inputMap'
import type { StudioBridge } from '@shared/ipc'
import { mergedSettings } from '@main/settings/store'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useJobs } from '@/stores/jobs'
import { useSettings } from '@/stores/settings'
import type { createBenchMemory } from './memoryStore'
import type { MemoryCatalog } from './memoryCatalog'
import type { createMemoryCloud } from './memoryCloud'
import type { createMemoryFiles } from './memoryFiles'
import type { MemoryFolder } from './memoryFolder'
import type { MemoryGit } from './memoryGit'
import type { MemoryShell } from './memoryShell'
import { WHEN } from './project'

type Think = StudioBridge['assistant']['think']

export type StudioBridgeContext = {
  folder: MemoryFolder
  catalog: MemoryCatalog
  ops: ReturnType<typeof createMemoryFiles>
  cloud: ReturnType<typeof createMemoryCloud>
  documentsOnDisk: Map<string, DocumentDescriptor>
  git: MemoryGit
  shell: MemoryShell
  memory: ReturnType<typeof createBenchMemory>
  game: { current: GameManifest }
}

const RESERVED_FOLDERS: readonly string[] = ['.git', '.index']

function freePath(disk: MemoryFolder, into: string, stem: string, extension: string): string {
  let path = pathIn(into, `${stem}${extension}`)
  for (let suffix = 2; disk.kindOf(path) !== null; suffix += 1) {
    path = pathIn(into, `${stem} ${suffix}${extension}`)
  }
  return path
}

const texturesOfTheProject = (catalog: MemoryCatalog): readonly Asset[] =>
  catalog
    .rows()
    .filter(
      one =>
        one.type === 'image' && (one.path ?? '').startsWith(`${DEFAULT_ROLE_PATHS.materials}/`),
    )

/** Reads and writes the project's `.input.json` / `.anim.json` files on the bench's own disk. */
function projectJsonPort<T>(
  disk: MemoryFolder,
  extension: string,
  parse: (value: unknown) => T,
): {
  list: () => Promise<string[]>
  read: (path: string) => Promise<T | null>
  write: (path: string, value: T) => Promise<boolean>
} {
  const readable = (path: string): boolean => path.endsWith(extension) && !path.startsWith('/')
  return {
    list: () => Promise.resolve(disk.paths().filter(one => one.endsWith(extension))),
    read: async path => {
      const text = readable(path) ? disk.textOf(path) : null
      if (text === null) return null
      try {
        return parse(JSON.parse(text))
      } catch {
        return null
      }
    },
    write: async (path, value) => {
      if (!readable(path)) return false
      await disk.write(path, JSON.stringify(value, null, 2))
      return true
    },
  }
}

export function installStudioBridge(context: StudioBridgeContext, think?: Think): void {
  const { folder, catalog, ops, cloud, documentsOnDisk, git, shell, game, memory } = context
  installFakeBridge({
    ...shell.channels,
    git,
    memory: memory.channels,
    /**
     * 🛑 A PORT, not a rule, and the SAME disk as everything else: a script written from outside
     * the window has to turn up in `studio.files()`, or no oracle can read it back. What a write
     * MEANS — the refusal of a path that leaves the project — stays in the main process.
     */
    /**
     * 🛑 A PORT: the same disk as everything else, so a map written from outside the window turns
     * up in `studio.files()` and an oracle reads back what a write landed. What a write MEANS —
     * the refusal of a path that leaves the project — stays in the main process.
     */
    inputMaps: projectJsonPort(folder, INPUT_MAP_EXTENSION, inputMapOf),
    animationGraphs: projectJsonPort(folder, ANIMATION_GRAPH_EXTENSION, animationGraphOf),
    game: ((): NonNullable<BridgeOverrides['game']> => ({
      /**
       * 🛑 A PORT: the disk an export writes onto. Every file lands in the memory folder under
       * the game's own name, so an oracle can read back what was written — and 65.1 could not
       * pass at all against the default, which answers « nobody picked a folder ».
       */
      export: async request => {
        const root = `exports/${request.title}`
        const missing: string[] = []
        for (const scene of request.scenes) {
          await folder.write(`${root}/scenes/${scene.id}.gltf`, scene.content)
        }
        for (const script of request.scripts) {
          await folder.write(`${root}/scripts/${stemOf(nameOf(script.script))}.js`, script.code)
        }
        await folder.write(`${root}/index.html`, '<!doctype html>')
        await folder.write(`${root}/runtime.js`, '// bundle')
        return {
          folder: request.title,
          scenes: request.scenes.length,
          scripts: request.scripts.length,
          assets: 0,
          missing,
        }
      },
      scripts: () =>
        Promise.resolve(
          folder
            .paths()
            .filter(path => path.endsWith(SCRIPT_EXTENSION))
            .map(path => ({ path, source: folder.textOf(path) ?? '' })),
        ),
      writeScript: async (path, source) => {
        await folder.write(path, source)
        return true
      },
      // 🛑 A PORT: `game.json`, held in memory. The default REFUSES a write, so a game.current was
      // one more thing no scenario could ever see change.
      read: () => Promise.resolve({ game: game.current, trouble: null }),
      write: written => {
        game.current = written
        return Promise.resolve({ game: game.current, trouble: null })
      },
    }))(),
    /**
     * 🛑 A PORT, and one the bench had wrong: the stub answered `DEFAULT_SETTINGS` to every write,
     * and the store keeps what the channel hands back — so any preference written wiped the shelf
     * the decor had just sown. Through the REAL `mergedSettings`, never a second merge of its own.
     */
    settings: {
      // 🛑 STORED, as the main's store does: merged and answered but never kept, every write of
      // the batterie was a no-op and `settings.read` still showed the grid on (2026-09-06).
      write: partial => {
        const settings = mergedSettings(useSettings.getState().settings, partial)
        useSettings.setState({ settings })
        return Promise.resolve(settings)
      },
      read: () => Promise.resolve(useSettings.getState().settings),
    },
    project: ((): NonNullable<BridgeOverrides['project']> => ({
      ...shell.channels.project,
      listFolder: (relative, hidden) => folder.list(relative, hidden),
      searchFolder: (term, hidden) => folder.search(term, hidden),
      walkFolder: hidden => folder.walk(hidden),
      renameFile: ops.rename,
      moveFiles: ops.move,
      duplicateFiles: paths => ops.duplicate(paths),
      // Missing until the bench pass of 2026-08-25, where `files.copy` answered `ok` with an
      // empty batch three times over — the stub's own answer, and nothing had been copied.
      pasteFiles: (paths, into, cut) => (cut ? ops.move(paths, into) : ops.duplicate(paths, into)),
      trashFiles: ops.trash,
      newFolder: ops.createFolder,
      undoFile: ops.undo,
      redoFile: ops.redo,
      fileHistory: () => Promise.resolve(ops.can()),
      /**
       * 🛑 The stub answered `null` and wrote NOTHING: « exporte la scène dans mon dossier
       * documents » came back `ok null` over an empty folder, and no oracle could tell the export
       * from a refusal. The files land on the same disk as everything else, under the folder the
       * request names — which is what `exportInto` does on a real machine.
       */
      exportInto: async request => {
        // 🛑 The refusal the real channel gives, and the one `stateHandlers.ts` tells apart: the
        // destination is NAMED, held inside the project, and `.git` and `.index` are not it.
        if (RESERVED_FOLDERS.includes(request.folder) || request.folder.includes('..')) return null

        await folder.createFolder(request.folder)
        // `${name}${extension}` with no dot between them, as `main/export/folder.ts` writes it:
        // an `ExportedFile` carries its extension with the dot, so a second one names `x..glb`.
        for (const file of request.files)
          await folder.write(pathIn(request.folder, `${file.name}${file.extension}`))
        return request.folder
      },
      fileFacts: relative => {
        const kind = folder.kindOf(relative)
        return Promise.resolve(
          kind === null
            ? null
            : { path: relative, kind, bytes: 0, createdAt: WHEN, modifiedAt: WHEN },
        )
      },
    }))(),
    assets: ((): NonNullable<BridgeOverrides['assets']> => ({
      search: query => catalog.search(query),
      /**
       * 🛑 The stub REJECTED, so « ouvre la texture utilisée par mon modèle » had no answer at
       * all. Reading pictures out of a `.glb` is what a backend does and this disk holds names,
       * so what stands in FILES the project's own base-colour material pictures as fresh rows —
       * copies keeping their id would have any later gesture land on the original.
       */
      extractTextures: async assetId => {
        // The refusal the real channel gives: `handlers.ts` finds the asset and throws for a row
        // that is not a mesh, so a hallucinated id answered `ok` with the whole shelf.
        const held = await catalog.find(assetId)
        if (!held || held.type !== 'mesh') throw new Error(`asset ${assetId} is not a mesh`)

        // 🛑 Idempotent, as `textureExtraction.ts` is: it short-circuits on what it already filed,
        // « without that, the two paths would double », and a model may repeat this call.
        const already = catalog.rows().filter(one => one.derivedFrom === assetId)
        if (already.length > 0) return already

        const filed: Asset[] = []
        for (const one of texturesOfTheProject(catalog)) {
          const path = freePath(
            folder,
            DEFAULT_ROLE_PATHS.image,
            stemOf(nameOf(one.path ?? '')),
            '.png',
          )
          await folder.write(path)
          filed.push(
            await catalog.add({
              ...one,
              id: `texture-${path}`,
              name: stemOf(nameOf(path)),
              path,
              derivedFrom: assetId,
            }),
          )
        }
        return filed
      },
      /**
       * 🛑 The stub REJECTED, so « ouvre la texture utilisée par mon modèle » had no answer at
       * all. Reading the pictures out of a `.glb` is what a backend does and this disk holds
       * names, so what stands in is the project's OWN material pictures — the ones an extraction
       * would have filed there, minus the maps that are not the base colour.
       */
      /**
       * 🛑 The stub REJECTED, so every still the bench ever took answered « the scene viewport
       * gave back no still » — a refusal that named the viewport for a port that had simply said
       * no. The picture lands on the disk and in the catalogue, as an indexing pass files one.
       */
      savePicture: async request => {
        // 🛑 A FREE name, as `freeAssetPath` gives one: two captures of the same view are two
        // pictures in the studio, and a fixed path filed one row over another — the very lie
        // `batterie.test.ts` guards under « une copie s'appelle "… 2" ».
        const path = freePath(folder, DEFAULT_ROLE_PATHS.image, request.name, '.png')
        await folder.write(path)
        return await catalog.add({
          id: `capture-${path}`,
          // The name WITHOUT the extension, as `localBackend.ts` files one: it lands in the path.
          name: nameOf(path).replace(/\.png$/, ''),
          type: 'image',
          location: 'local',
          path,
          tags: [],
          createdAt: WHEN,
        })
      },
      counts: () => catalog.countByType(),
      // Left to the stub until the bench pass of 2026-08-25: tagging an asset was answered by a
      // channel that kept nothing, so « range-la avec des mots-clés » could not be measured.
      update: async (assetId, changes) => {
        const held = await catalog.find(assetId)
        if (!held) throw new Error(`no asset ${assetId}`)

        return await catalog.add({ ...held, ...changes, tags: [...(changes.tags ?? held.tags)] })
      },
      remove: async assetIds => {
        for (const one of assetIds) await catalog.remove(one)
      },
    }))(),
    // What `openProjectFile` asks before it decides between a document and an asset.
    media: {
      adopt: relative => {
        shell.adopt(relative)
        return catalog.search({ path: relative, limit: 1 }).then(found => found[0] ?? null)
      },
    },
    documents: ((): NonNullable<BridgeOverrides['documents']> => ({
      list: () => Promise.resolve([...documentsOnDisk.values()]),
      // 🛑 A PORT: the envelope the main process stamps, around the TEXT on disk. `null` for a
      // document nothing was ever written under, which is what a fresh one is.
      read: async (documentId, kind) => {
        const held = documentsOnDisk.get(documentId)
        const content = held ? folder.textOf(held.path) : null
        // The KIND too, as the real port locates a file by the `(id, kind)` pair: answering with
        // the kind the caller asked for would let a montage read back as a scene.
        if (!held || held.kind !== kind || content === null) return null

        return { version: DOCUMENT_VERSION, kind, title: held.title, updatedAt: WHEN, content }
      },
      /**
       * 🛑 Resolved by IDENTITY and never by path, as the real port resolves `(id, kind)`: a
       * document of this session that has no file yet borrows the DEFAULT path, which another
       * document's file may already hold — renaming it moved that file and took over its entry.
       */
      rename: async (documentId, kind, title) => {
        const onDisk = documentsOnDisk.get(documentId)
        // The WINDOW's descriptor when the folder holds none: a document created in this session
        // has no file until it is saved, and the real port answers a path rather than throwing.
        const held = onDisk ?? useDocuments.getState().documents[documentId]
        if (!held || held.kind !== kind) throw new Error(`no document ${documentId}`)

        const renamed = documentFileName(title, kind)
        const next = { ...held, kind, title, path: pathIn(parentOf(held.path) ?? '', renamed) }
        if (onDisk) {
          await ops.rename(onDisk.path, renamed)
          documentsOnDisk.set(documentId, next)
        }
        return next
      },
    }))(),
    ...(think ? { assistant: { think } } : {}),
    provider: ((): NonNullable<BridgeOverrides['provider']> => ({
      searchModels: query => cloud.searchModels(query),
      describeModel: modelId => cloud.describeModel(modelId),
      generate: (modelId, body) => cloud.generate(modelId, body),
      cancelJob: jobId => cloud.cancelJob(jobId),
      /**
       * 🛑 The stub REJECTED with « no usage », so « combien me reste-t-il de crédits » could not
       * be answered at all — the model sent the call eleven times over. What a headless run can
       * honestly stand in for is the SHAPE of an answer, filled from the jobs this run has run.
       */
      usageReport: period =>
        Promise.resolve({
          period,
          from: WHEN,
          to: WHEN,
          units: useJobs.getState().jobs.length,
          discount: 0,
          jobs: useJobs.getState().jobs.length,
          daily: [],
          accounts: [],
          models: [],
          actions: [],
          assets: [],
          silent: [],
          price: null,
        }),
    }))(),
  })
}
