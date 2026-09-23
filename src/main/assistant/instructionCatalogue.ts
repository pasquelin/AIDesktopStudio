import {
  ACTION_FAMILIES,
  assistantAction,
  DISCOVERY_ACTION,
  type ActionField,
  type ActionName,
  type AssistantAction,
  HISTORY_MAX,
} from '@shared/domain/assistant'
import { MOST_QUESTIONS } from '@shared/domain/assistantAsk'
import { MEMORY_RECALL_ACTION } from '@shared/domain/memoryActions'
import type { Target } from '@shared/domain/target'
import { englishText } from '@shared/i18n'

/**
 * What the model is told before it answers.
 *
 * Two kinds of sentence live here, and the difference is worth stating because they sit five
 * lines apart. The CATALOGUE — what each action is and what its fields mean — comes from the
 * English bundle, because those same sentences are shown on screen and one source is the only
 * way they stay one thing. `ROLE` and `FORMAT` are written here as literals, because they are
 * shown to nobody: they are a prompt, which is code, and putting a prompt in a translation
 * bundle would invite someone to translate the one thing that must not move.
 *
 * English throughout either way — see `englishText`, which the window uses for the other half of
 * the same conversation.
 */

/**
 * One target, as a line the model can read. The id first because it is what `target.select` takes
 * back — a model that read the name first tends to answer with the name.
 */
export function targetLine(target: Target): string {
  const selected = target.selected ? ' (selected)' : ''
  return `  ${target.id} — ${target.kind} "${target.name}"${selected}`
}

/** One field, as a line the model can read: name, type, whether it must be there, what it takes. */
function fieldLine(field: ActionField): string {
  const kind = field.repeated ? `list of ${field.kind}` : field.kind
  const parts = [`${field.key} (${kind}${field.required ? ', required' : ''})`]
  if (field.options) parts.push(`one of: ${field.options.join(', ')}`)
  parts.push(englishText(field.labelKey))
  return `    - ${parts.join(' — ')}`
}

/** One action's MANUAL: what it is for, and every field it takes. */
export function actionBlock(action: AssistantAction): string {
  const lines = [`  ${action.name} — ${englishText(action.descriptionKey)}`]
  for (const field of action.fields) lines.push(fieldLine(field))
  return lines.join('\n')
}

/**
 * 🛑 One manual and WHOSE it is, carried together rather than re-derived: a scan of the composed
 * text for `\n  <name> — ` also matches a project context that happens to be shaped that way, and
 * a block split by position breaks the day a translated label carries a newline.
 */
export type Manual = { readonly name: ActionName; readonly text: string }

/** The manuals a briefing carries, in the order the chain opened them. */
export const manualPrinted = (loaded: readonly ActionName[]): readonly Manual[] =>
  loaded
    .flatMap(name => assistantAction(name) ?? [])
    .map(action => ({ name: action.name, text: actionBlock(action) }))

export const manualText = (manuals: readonly Manual[]): string =>
  manuals.map(one => one.text).join('\n')

/**
 * 🛑 The whole registry as NAMES, headed by the family that publishes it — 4 225 characters where
 * the manuals of the same 283 actions run to 90 994, which no door but the widest could hold.
 */
let namesHeld: string | null = null

export const namesPrinted = (): string =>
  (namesHeld ??= ACTION_FAMILIES.map(
    family => `  [${family.name}] ${family.actions.map(one => one.name).join(',')}`,
  ).join('\n'))

/**
 * The shape the answer has to take.
 *
 * Stated twice — as a sentence and as an example — because the one thing this whole file exists
 * to obtain is a parseable object, and the cheapest model on the list is the one most likely to
 * wrap it in prose if only told once.
 */
const ASK_LINES = [
  '  "say": a short sentence for the person, in their language. May be empty.',
  // 🛑 Two lines of the FORMAT and never a rule of the catalogue: named by a rule, this was
  // described to every model and called by none — the question went in "say" and the calls went
  // out beside it. What gives ground when the room runs out is never this block.
  '  "ask": {"question":"…","choices":[…],"many":true} to ask, or null. It RUNS NOTHING:',
  '    the calls wait, the answer comes next round. Ask rather than act halfway.',
  // 🛑 Tightened to make room for "many" rather than given a line of its own: measured at 7 175
  // characters against the 7 116 a 4 096-token door leaves, with the catalogue already narrow.
  `    Several: {"questions":[{"question":"…","choices":[…],"note":true},…]}, ${MOST_QUESTIONS} max ("note"=a free line, "many"=several).`,
]

export const FORMAT = [
  'Answer with one JSON object and nothing else. No prose around it, no code fence.',
  'The object has exactly three keys:',
  ...ASK_LINES,
  '  "calls": a list of actions to run, in order. May be empty.',
  'Each call is {"action": "<name from the catalogue>", "input": {<the fields above>}}.',
  // 🛑 A LITERAL id: the example spelled `"<the armed model>"` and the model copied the shape —
  // twenty-three calls over five passes carried `<shotId>` or `<path found>` where a value goes.
  'Example: {"say":"Making an image.","ask":null,"calls":[{"action":"generator.prepare",',
  '"input":{"family":"image","modelId":"flux.1-dev","parameters":{"prompt":"a bicycle"}}},',
  '{"action":"generator.submit","input":{"landing":"document"}}]}',
].join('\n')

// For a door handed the manuals as native tools: the calls go through them, the text carries the
// two other keys. « Never in the text » is the point: a name written by hand was a name invented.
export const TOOL_FORMAT = [
  'Run actions by CALLING THE TOOLS, in order. Never write an action name in the text.',
  'Beside the calls, answer with one JSON object and nothing else, with two keys:',
  ...ASK_LINES,
  // 🛑 In the tools' own words: the rule above says it of an empty "calls", a key this door has
  // no more — told nothing, the model wrote « je lance l'envoi » and called nothing (2026-09-06).
  'Calling no tool means the request is DONE, and "say" then tells the person where things',
  'stand — never empty. Never write that you will call, or that a thing is done: call it now.',
].join('\n')

/**
 * 🛑 What replaced the eleven-action catalogue, and the whole reason the names fit: an action the
 * briefing did not spell used to cost the entire answer, so a model was told to ask before acting
 * — and, measured, answered « je ne peux pas » instead: 20 of the 121 failures of 2026-09-01.
 *
 * Held under 137 characters: at `roomFor(4096)` the briefing is already at its floor, the
 * catalogue given up whole, and the room leaves four to spare.
 */
const NAMES_RULE = [
  '  - Catalogue: all names; Manual: fields of opened ones, others return same turn.',
  '    Never invent a name, never say you cannot.',
]

export const RULES = [
  '  - Only use actions from the catalogue below. Never invent one.',
  '  - One request often needs several calls, in order. Carry it to its end.',
  '  - generator.prepare fills the form and stops. generator.submit sends it and spends credits.',
  // The state below is what the person is looking at. Written as a rule rather than left to be
  // inferred: a model handed a space and a document still opened a second one for the subject of
  // the sentence, which is where "make me a bicycle" became a document named Bicycle.
  '  - Act on what is in front of the person. Only make a document when asked for a new one.',
  // 🛑 A RULE and not two catalogue blocks: printed they cost 158 characters, and a block is the
  // first thing dropped when the room runs out — leaving `project.open` allowed and unspelt.
  '  - Opening a project: projects.list gives their paths, then project.open with {"path":"…"}.',
  ...NAMES_RULE,
  `  - A word rather than a name: ${DISCOVERY_ACTION} with {"query":"…"} answers with what matches.`,
]

/**
 * 🛑 The rules a door has to have ROOM for, and nothing more: naming an action is safe everywhere
 * now that every name is shown, so what sets them apart is the ~2 550 characters they cost.
 *
 * Scenario's door leaves 8 500 for the whole briefing and the names alone take 4 225, so it is
 * shown `RULES` and these are what it does without — see `studioBriefing`, which decides on room.
 */
export const WIDE_RULES = [
  // 🛑 The catalogue names 297 actions and the model still wrote « aucune action de miroir
  // n'existe » about one of them (55.7, 69.4 — measured 2026-09-05). A search first, then the no.
  `  - Nothing in the catalogue seems to fit? Call ${DISCOVERY_ACTION} with the words of the request`,
  '    first. Only when it answers nothing, return no calls and say so in "say".',
  /**
   * The three that place a NAMED file, and they are one story: a model shown two hundred actions
   * reached for documents.list, which holds documents alone, then said it had found a picture.
   */
  '  - A file the person names is in the project: find it by name there, then file.open it.',
  /**
   * What unblocks a studio spoken to in one language and filled in another: a picture is named
   * after the PROMPT that made it, so "le voilier vert" is on disk as "a beautiful sailing ship,
   * sailboat, on the open sea, green". No wording of a search reaches that — and the model asked
   * three times over to be ALLOWED to list a folder of nine it could simply have read.
   */
  '  - Nothing found by name? List the folders YOURSELF and read the names in them, in this same',
  '    answer. Never ask to be allowed: a name follows the prompt that made it, not what is spoken.',
  // « Ouvre mon premier fichier audio » found two and asked which (2.3, 2.4, 17.3, 17.4 — 2026-09-06).
  '  - Several files match? Choose none: "ask" which, with their names as the choices. NOT when',
  '    the sentence COUNTS — "the first", "the second": take the Nth of the listing, as it answered.',
  // Four requests of the batterie died on a bare name — `files.move ["bateau-test.png"]` for a
  // file sitting in `Images/` — each answered `refused: missing`.
  '  - A path is the WHOLE path inside the project, folders and all: "Images/x.png", never',
  '    "x.png". A name you were TOLD is not a path — find the file, then use the path it answered.',
  // Six runs, none able to answer: asked to rename « la copie », it searched for the NEW name.
  '  - Renaming: the new name is not on disk yet. Find the file by what it is called NOW.',
  '  - Every value is literal. Never write <something> where an id goes: if you do not have it,',
  '    discover it with an action and use what came back on the next round. Never ask the person',
  '    to supply an application id, model name or path that an action can discover.',
  '  - The remote library is not this project. Look there only when asked to.',
  // Five requests died on it: the decor had just generated a picture, and the model answered
  // « je ne vois aucune image générée » — nothing in the studio block says one was made.
  '  - "that picture", "the generated model": what a generation MADE is in the project catalogue.',
  '    assets.searchProjectCatalogue with generated finds it; nothing else announces it. How a',
  '    generation WENT is another question, and job.readCloudGeneration is what answers it.',
  // Twice over, a reference travelled as a PATH under a key nobody reads. The field belongs to
  // the model's own schema, and the value is an asset id.
  '  - To work FROM a picture, read models.readGenerationModelFields first and fill the field it names with an ASSET',
  '    ID — never a path, and never a key you chose yourself.',
  // A plan that reads well and cannot run: opening the picture is what put the Image space in
  // front, and every scene call after it was refused.
  '  - Scene, image and montage actions work on the document IN FRONT, and opening a file changes',
  '    which one that is. Open what you will act on LAST, or bring it back with document.activate,',
  '    which takes its id, its path, or the title the studio shows in quotes.',
  // Narrowed to the repair alone: rule 3 above is what makes a model ask, and it must keep doing
  // so for what the person alone knows.
  '  - Never ask to be allowed to repair your OWN order: do it, and say what you did.',
  // Twelve requests died on a question the studio answers — « sur quel clip ? » to a montage
  // holding one, « quel modèle 3D ? » to a project holding two.
  '  - Rule 3 is for what the person ALONE knows. ONE thing of that kind in front of you is the',
  '    one meant, and a question about what a read would have told you is a turn spent for nothing.',
  /**
   * 🛑 The other side of the rule above, and it only bites where a gesture DESTROYS: « supprime le
   * bateau » names a file, an asset, a layer, a document and an instance at once, and the rule
   * above — one of that kind — reads it as one of them and removes it. Measured 2026-09-01.
   */
  '  - ONE of a kind is the one meant, but a name that fits SEVERAL KINDS at once — a file, a',
  '    layer, an object, a document — is not one thing. Before REMOVING on such a name, ask which,',
  '    with the kinds as the choices. Before reading or moving, pick the one in front.',
  /**
   * 🛑 Twenty of the 121 failures of the 2026-09-01 pass were an answer with NO call at all, and
   * nine of those told the person a gesture was done — « Repère supprimé. », « Voici les branches
   * du projet. » Here and not in `FORMAT`, which every door pays: Scenario's composes 6 948 of
   * the 6 980 it has, so a line there overruns it and the overrun comes off the person's sentence.
   */
  '  - "say" tells what the calls DID. With "calls" empty you did nothing: never write that a',
  '    thing is done, nor that you are about to do it — call the action, or "ask".',
  /**
   * 🛑 The other half, and it fails the same way with no call at all: « il n'y a pas de fusion en
   * cours » on a decor holding one, three runs out of three, `git.status` never called. What the
   * studio holds is READ, never recalled — the state block is a summary and answers nothing.
   */
  '  - What the studio HOLDS is read, never recalled. "there is no merge under way", "the scene',
  '    already has one", "nothing was generated" are readings: call the read, answer from it.',
  '  - "one metre more", "half", "25% more" are RELATIVE. Read the value that stands, do the',
  '    arithmetic, write the result: every field is an absolute value, never a difference.',
  /**
   * 🛑 Relative to ANOTHER thing, which the rule above does not cover: a `relative` field moves a
   * thing from where IT stands, never from where a second one does. Measured 2026-09-01, « place
   * la sphère 2 mètres à droite du cube » was sent as `relative: true, positionX: 2` — two metres
   * from the sphere — and « juste après le premier » as the first clip's start rather than its end.
   */
  '  - "2 metres right of X", "above X", "right after X" are relative to X and NOT to the thing',
  '    being moved: read X, add to ITS value, write the sum. A "relative" field moves a thing from',
  '    where it already stands, so it is the wrong tool for these — and "after" is X\'s END.',
  // Asked for a subfolder inside « Tests Assistant », the model opened a project of that name and
  // the mission lost its scope (4.2, 2026-09-06). Only the listing names projects.
  '  - Only projects.list names projects. A name the sentence gives is a folder, a file or an',
  '    object of the OPEN project: find it there, never project.open or project.create on it.',
  // « Ajoute une lumière directionnelle » answered « one already exists » with no call (8.1);
  // « change l'arrière-plan » set the kind the state already showed (10.6).
  '  - "add a light", "add a cube": call node.add even when the scene already holds one of that',
  '    kind — one MORE is what was asked. "change", "another" ask for a value DIFFERENT from',
  '    the one the state shows. "away from" and "closer to" X move along the line between',
  '    the two: read both positions, then write the result.',
  '  - Never say a thing is done unless a call in this conversation did it.',
  '  - Reading is not doing: the request is done once the change it asked for has been WRITTEN.',
  // The same call sent four times after it answered ok, one refusal collected eight times on
  // arguments that never changed.
  '  - A call that answered ok has HAPPENED — sending it again does it twice. A refused call is',
  '    refused again on the same arguments: change them, or do something else.',
]

/**
 * 🛑 The whole of what a briefing says about the memory, and it says it only when there is
 * something to find — a project that has learned nothing pays not one character.
 *
 * A SIGNAL rather than the memories themselves: pushing summaries cost an embedding and a scan of
 * every vector on every turn, for a block the room threw away whole on four doors of five.
 */
export const MEMORY_CALL = `  - This project has a memory: ${MEMORY_RECALL_ACTION} answers it. Ask before guessing.`

/**
 * 🛑 What a round after the first is told, and every line of it earns its place.
 *
 * Without the first, a model handed its own history repeats the search it has just run. Without
 * the last, it never stops: answering with no calls is the ONLY way it says a request is done,
 * and nothing else in the briefing asks it to.
 */
export const CONTINUING = [
  'You are still working on the same request. What you have already done is above — the history,',
  'or previousResults — with what each action answered: build on it, and never redo a call that',
  'has answered. Answer with NO calls when the request is done. When you need something only the',
  'person can tell you, that is what "ask" is for.',
].join('\n')

/**
 * 🛑 How to READ the mission JSON, which no schema travels with: `previousResults`, `verify` and
 * the scored `actions` list were inferred by the model, and the scores meant nothing to it.
 */
export const MISSION_RULES = [
  '  - The "Mission" block is JSON. mission.goal is the request. mission.step.kind says what this',
  '    round is for: "reason" = plan the next calls; "verify" = check from the state whether the',
  '    goal is reached, and answer with NO calls if it is. Never claim it is without reading.',
  '  - previousResults lists what already RAN in this mission, the call and what it answered.',
  '    Build on it, never send a call that is already there: a search that answered [] is an',
  '    answer — list a folder or search other words, never the same query again.',
  '  - actions is a shortlist the studio picked for this step; their fields are in the Manual.',
  '    The Catalogue names every other action — name one and its fields come back next round.',
  // The JSON carried a summary of the document once, and the model answered from it with no
  // call — 26 scenarios of passe 6 (2026-09-06). Gone since; the rule stays for the selection.
  '  - The JSON says what is in front and selected, never what a document HOLDS: to tell the',
  '    person that, call its read (scene.state, sequence.state, files.list…) and answer from it.',
]

export const roleWith = (rules: readonly string[]): string =>
  [
    'You drive AI Desktop Studio, a desktop application for generating images, video, 3D models,',
    'audio, materials and skyboxes. The person talks to you and you act on their behalf.',
    '',
    'Rules:',
    ...rules,
  ].join('\n')

export function recentHistory(history: readonly string[], limit = HISTORY_MAX): string[] {
  return [...history].slice(-limit)
}
