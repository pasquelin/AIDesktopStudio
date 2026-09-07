import type { Language } from './index'

export const SETTLED_WORDS: Record<
  Language,
  readonly { dropped: RegExp; kept: string; except?: readonly string[] }[]
> = {
  fr: [
    { dropped: /système de fichiers/i, kept: 'gestionnaire de fichiers' },
    { dropped: /préférences?/i, kept: 'réglages' },
    { dropped: /champ de vision/i, kept: 'angle de vue' },
    { dropped: /maillages?/i, kept: 'maille', except: ['sceneDisplay.wireframeHint'] },
    { dropped: /matériaux?/i, kept: 'matière' },
    /**
     * A texture IS a picture, and the studio stopped filing it apart — the kind is gone, the
     * shelf is gone, and what a picture serves is read off its channel. The word survives in
     * KEYS, which come from the API and are not screen text.
     *
     * The extraction controls use the glTF term because they act on maps embedded in that file,
     * not on ordinary pictures.
     */
    {
      dropped: /textures?/i,
      kept: 'image',
      except: [
        'assets.extractTextures',
        'assets.extractTexturesHint',
        'inspector.modelExtractTextureHint',
      ],
    },
    /**
     * `rigué` is English wearing a French ending, and the workspace that gave a mesh its bones
     * had already decided against it: seven of its nine sentences said `squelette`, two command
     * hints still said `rigué` and `un rig`.
     *
     * French only. English keeps `rig` beside `skeleton` because they are not the same thing
     * there — a rig is the skeleton plus what drives it — and `SETTLED_WORDS.en` would be
     * refusing a distinction the trade makes.
     */
    { dropped: /(?<!\p{L})(?:rigu[ée]e?s?|rigs?)(?!\p{L})/iu, kept: 'squelette' },
    /**
     * `plan` was a third French word for the thing on a track, written under keys NAMED
     * `unlinkedClips`. The manual glossary settles it, head-word `Clip`.
     *
     * The lookbehinds carry the senses that stay: `premier(s) plan(s)`, `second(s) plan(s)`,
     * `arrière-plan`, and `{{plan}}` — the subscription tier, a variable name and not screen
     * text. The plurals are not decoration: `premiers plans` passed the first writing.
     *
     * What the `\p{L}` lookarounds buy over `\b` is `planète`, and only it: `\b` rejects
     * `plane` and `plantage` just as well, both neighbours being ASCII. Measured, after the
     * JSDoc here claimed the opposite for a day.
     *
     * `except` is the geometric plane, and the camera shot — a take, not a stretch of media on
     * a track, and the trade word Alban settled on 18/08 for the 3D space. `bloc` against
     * `clip` meets this list's bar — 22 French values say `bloc`, all `assistant.*`, against 25
     * saying `clip`, and the glossary settles it with a head-word for `Clip`. It is left out
     * for SCOPE, not for want of evidence: 20 of the 22 sit under keys named `clip*`, which is
     * a batch of its own.
     */
    {
      dropped: /(?<!premiers? |seconds? |arrière-|\{\{)(?<!\p{L})plans?(?!\p{L})/iu,
      kept: 'clip',
      except: [
        'meshes.plane',
        'material.shapePlane',
        'inspector.shot',
        'inspector.addRailHint',
        'objects.pathHint',
        'animation.addShotHint',
        'animation.addShotNeedsCamera',
        'assistant.actions.cameraAddShot.description',
        'assistant.actions.cameraBindPathToShot.description',
        'assistant.actions.cameraCreateAndBindPath.description',
        'assistant.actions.cameraReorder.description',
        'assistant.actions.cameraAimShotAt.description',
        // The same sense as the three above: `scene.state` hands back the shots, and says so.
        'assistant.actions.sceneState.description',
        'assistant.fields.startSeconds',
        'assistant.fields.durationSeconds',
        'assistant.fields.shotId',
      ],
    },
  ],
  en: [
    { dropped: /\bfile browsers?\b/i, kept: 'file manager' },
    /** The same word settled on the French side, for the same reason. */
    { dropped: /\btextures?\b/i, kept: 'image' },
    { dropped: /\bpreferences?\b/i, kept: 'settings' },
    {
      dropped: /\bpictures?\b/i,
      kept: 'image',
      except: ['inspector.kind_video', 'commands.sequenceUnlink.title'],
    },
    /**
     * The manual settled this one and the bundle had not followed: `activity journal` ×32 for
     * the status line, against `log` ×12 for the internal one, and `16-troubleshooting.md:642`
     * warns the reader not to confuse them. The screen said `log` for both.
     *
     * THREE surfaces, not two, and the third cost a batch to find: the usage window has a
     * `Journal` section of its own, which `03-the-window.md` names in a table — a chapter whose
     * title says nothing about usage, so a search by chapter name missed it and the batch
     * before this one wrote that no chapter described those sections.
     *
     * The exemptions left are the internal log, the one thing the manual keeps as `log` — and
     * it is now a FILE on disk, which the button under Advanced shows.
     */
    {
      dropped: /\blogs?\b/i,
      kept: 'activity journal',
      except: [
        'settings.logLevel.title',
        'settings.openDevtools.help',
        'settings.openLogFolder.title',
        'settings.openLogFolder.help',
        'settings.openLogFolder.button',
      ],
    },
    /**
     * The trade means something else by `montage` — a run of short shots, not the timeline.
     * One surface kept the French word: eleven `assistant.*` values, against `edit` in
     * thirty-three values elsewhere. It forbids `montage`; it does not require `edit`.
     */
    { dropped: /\bmontages?\b/i, kept: 'edit' },
    /**
     * One gesture, one verb: four keys say `Show in folder`, a fifth said `Reveal the technical
     * log`, and the French says `Afficher` at all five. Bundle VALUES only, which is the blind
     * spot — the manual keeps `reveals` as a plain English verb.
     */
    { dropped: /\breveals?\b/i, kept: 'show' },
    /**
     * The scene registry a model reads: eight `actions.*.description` said `node` under titles
     * that said `object`, and the French says `objet` at all 38 sites. The lookahead keeps the
     * TOOL names, the registry calling its scene tools `node.*`, so a drift inside
     * `nodeCarve` still reddens.
     * Two blind spots: the model calls `node.add` while reading a description that says
     * `object`, and the manual glossary still heads an entry `Node`, which no guard here
     * reaches. `except` is the graph node, the referent `TWO_THINGS.nœud` already separates.
     */
    {
      dropped: /\bnodes?\b(?!\.[a-z])/i,
      kept: 'object',
      except: ['inspector.node', 'inspector.expressionHint'],
    },
  ],
}
