# 4. Projects

[← The window](03-the-window.md) · [Contents](../user-guide.md) · [Next chapter: Finding a model →](05-models.md)

---

## A project is a folder

Not a database. Not an online space. Not a single file that only this software can open.

**An ordinary folder, on your disk.** You can open it in your file browser, look inside, copy it
onto a USB stick, back it up with the rest of your documents, send it to someone. **It carries the
name you gave it and nothing else**: no extension, no technical suffix.

That is a design decision, not an accident. A project that only the software that made it can open
is a project you lose the day that software stops opening.

---

## Creating, opening, switching projects

| Action | Shortcut | Menu |
|---|---|---|
| **New…** | `⌘N` / `Ctrl+N` | **File ▸ New…** |
| **New project** | `⌥⌘N` / `Alt+Ctrl+N` | **File ▸ New project…** |
| **Open project** | `⌘O` / `Ctrl+O` | **File ▸ Open project…** |
| **Open a recent project** | — | **File ▸ Open recent** |

**`⌘N` opens a window**, the same one from every screen: it offers to make a project and, below
that, every kind of document — image, video, scene, interface, script, audio, material, sky. The
kinds of the workspace you are in come first; all the others stay one click away. **The green `+`
button**, at the top of the icon column, opens exactly the same window.

**No project open?** The window says so and offers the way out on the spot: your recent projects,
one click each, or the two buttons that make or open one. The project opens and you carry on —
without going back to the home.

**Both gestures are in the Explorer panel too**, whenever no project is open: it then shows
**Open project** and **New project**, in its usual place in the left column.

**Only one project is open at a time.** Opening a second closes the first — losing nothing:
everything that was saved stayed saved.

The open project's name appears in the status line, bottom left.

### The home screen's project list

**Each row carries the project's name and, below it, the folder it sits in.** The folder is what
tells two projects with the same name apart — and a studio always ends up with two, one under
`Documents`, one on a scratch disk. **The last-opened date has not gone**: it is in the row's
tooltip, along with the whole path, which a narrow panel truncates.

**Each row has its own menu**, on right-click as on the button:

| Entry | What it does |
|---|---|
| **Show in folder** | opens the file manager on this project |
| **Remove from the list** | removes the project from this list, **leaving its folder and everything in it untouched** |

**Removing asks for no confirmation**: nothing is lost, and reopening the project puts its row
back. It is the gesture that cleans up a list where a moved folder lingers.

**Removing a project from the list does not close it.** The two gestures are distinct: removing
erases a row from a list of shortcuts, closing hands the studio back to the home. Removing the row
of the OPEN project therefore leaves the Explorer, the timeline and the tabs exactly where they
were — it is **Close the project**, in the title bar's project menu, that empties them.

**A running generation is not lost by closing.** It carries on where it runs, and its result is
filed in this project — never in another one, even if you open another in the meantime. It does
stay in the generations bar while it runs, but **what it produces will not land in the project
you open instead**: reopening its own is what brings the result back. **The studio asks you
first** before letting you leave the project — closing it or swapping it for another — saying how
many are still running.

And when one of them finishes while its project is not open, **the studio writes it in its
journal** — the Activity panel — naming the generation and the project its result is waiting in.
Without that line the generation would leave the bar showing nothing, which looks like lost work:
it is not, but its project has to be reopened **within seven days** to collect it.

> **A project is not "saved".** There is no "Save project" command. Each thing is written the
> moment it happens: a generated asset when it arrives, a document when you press `⌘S`, the panel
> layout when you change it.

**Leaving a project asks first what to do with unsaved work**, document by document — save it,
drop it, or give up leaving. That holds for all three ways of leaving one: closing it, opening
another from the list, picking one in the dialogue. Giving up leaves everything exactly where it was.

---

## What is inside

```
My project/
│
├── Images/               ONE FOLDER PER SECTION OF THE STUDIO
├── Video/                  laid down at creation, and ordinary: rename them,
├── Audio/                  move them, empty them, arrange them otherwise
├── Materials/            your materials, and the pictures that serve one
├── Skyboxes/
├── Scripts/
├── Scenes/               your scenes
├── Models/               your meshes
├── Animations/           your motions
│                           …and whatever you make beside them
│
│   Each carries a .ai-desktop-studio-role — HIDDEN — saying which section it serves
│
├── .project.json         the identity card — HIDDEN
│
├── .project-context.json  WHAT THE PROJECT IS ABOUT — HIDDEN
│                        the world, the look, the forbidden — see below
│
├── .ai-desktop-studio/            A BACKUP OF THE CATALOGUE — HIDDEN
│   └── items.json          what a file cannot say about itself
│
└── .index/               THE CATALOGUE AND ITS CACHES — KEEP THIS, HIDDEN
    ├── catalog.db          the index that makes search instant
    ├── proxies/            lightweight copies of videos, for smooth scrubbing
    ├── peaks/              the drawing of audio waveforms
    ├── posters/            the picture a video or model thumbnail carries
    └── filmstrips/         created ahead of time, still empty
```

**What starts with a dot is the machine's; everything else is yours**, and that is the whole rule.
Your files stay visible and you arrange them as you see fit — you must be able to look at them,
copy them, repair them. The identity card, the index and the backup do not: they are the studio's
tools, not your work.

> **These folders are only a starting point.** They are laid down at creation and never put back:
> delete `Images/` and it stays deleted — except the day a generation needs somewhere to land,
> where the studio recreates it rather than refusing to work.

> **Rename them, move them: they go on serving their section.** What binds a folder to a section
> is not its name but a small hidden file it carries, `.ai-desktop-studio-role`. It travels with the
> folder — a rename in the Finder or in Windows Explorer, a move, a copy, a zip. Rename
> `Models/` to “My meshes” and the next mesh still lands there.
>
> In the studio's explorer, a folder serving a section wears that section's icon, and **its name
> stays the one on disk** — what you read in the studio is what you read in the Finder. The icon
> and the tooltip are what say the section, in your language; the folder never changes name
> because you changed language.
>
> A fresh folder wearing the original name — you renamed `Images/`, then made an `Images/` by hand
> — is an ordinary folder: the marker decides, not the word.

> **The names on disk are English, and that is deliberate.** A folder following the interface
> language would be renamed at every language change, and everything the catalogue knows about
> what it holds would point beside the file. The studio translates what a folder SERVES, never its
> name.

> **`Materials/` is the only one that answers to no kind of file.** It holds your **materials**
> — the `.mtlx` documents — and the **pictures that serve one**: a base colour, a normal, a
> roughness land there, where a photograph lands in `Images/`. What tells them apart is not their
> nature, both being pictures, but **the channel** the second one carries.

> **A project created before this layout keeps its own, untouched.** `3D/`, `Sky/`, `documents/`,
> `scripts/`, `Textures/`: nothing is moved, nothing is renamed, and everything in them stays
> readable and editable. Every file carries its own path, and nothing reads its role off the name
> of the folder holding it. Only files made FROM NOW ON land in the new layout, which appears
> beside the old one. You can rearrange everything by hand, at your own pace, or not at all.

> **On Windows a dot hides nothing** — Explorer reads a file attribute, not the name. The studio
> sets it on `.project.json` and on `.index/` itself. **`.ai-desktop-studio/` does not get it**: the day it
> appears — it is only written after a pass that found something — you will see it in Windows
> Explorer, beside your own folders. There is nothing to do about it: it is the backup described
> below. If setting the attribute fails, **the project opens anyway**: a service
> file left visible is a blemish; refusing to open the project over it would be a real fault.

### What belongs to you

**Everything that does not start with a dot.** This is your work. They are real files, in real
formats — a PNG is a PNG, an MP4 is an MP4. You can open them with any other software, and file
them in whatever folders you like.

**What a file IS does not depend on where it sits.** A picture is still a picture in
`Locations/Alleys/` as much as in `Images/`: the studio reads its extension, and the catalogue
entry corrects what an extension cannot guess — a normal map and a base colour are both PNGs. Move
things, rename them, rearrange them: the studio follows.

### `.index/` holds more than caches — do not delete it

It holds five entries, and **two of them really are caches**: `proxies/` and `peaks/` are remade
when a medium is imported, and throwing them away costs one reimport. `filmstrips/` is created
ahead of time and stays empty — nothing writes to it yet.

**`posters/` is not one.** It is the picture a thumbnail carries, and **two kinds get one**: video
and 3D model — the two no thumbnail could tell apart otherwise, a list of rushes being a list of
grey rectangles.

For an imported video the frame is grabbed **a tenth of the way in**, not at the start: a take
opens on black often enough that a list of first frames would be a list of black tiles. For a
model, it is the preview that came down with it.

**It is written once** — on import or on fetching — and nothing remakes it afterwards. Throw that
folder away and your thumbnails fall back to their kind's generic glyph. None of your work is
lost; it is the Explorer that stops being readable at a glance.

**`catalog.db` is not one.** It is what holds every asset's name, its tags, its dimensions, the
model and prompt that produced it, what it derives from — and, for an imported medium, **the path
to your original file**, which is written nowhere else. The activity journal lives in the same
database.

**The studio cannot rebuild it from the folder.** The catalogue fills up as you generate and
import; the pass that re-reads the folder when a project opens FINDS files that have moved, it
does not guess again what they are. Deleting `.index/` therefore leaves a project whose files are
all still there and about which nothing says what they are.

> **That is what `.ai-desktop-studio/items.json` is for.** After every pass that changed something, the
> studio copies into it what a file cannot say about itself: its name, its tags, the model and the
> prompt that produced it — keyed by the fingerprint of the contents, so that a file found again
> can be recognised. It is not a source: the studio never reads it of its own accord. It is what is
> left to read, by hand, the day the index is gone.

> **If you need to slim a project down**, throw away `proxies/` and `peaks/` — that is where the
> weight is, and they are the only two the studio can remake. Keep `catalog.db`, which weighs
> little and knows everything, and `posters/`, which weighs little and does not come back.

### `.project.json`

A small text file, readable in any editor:

```json
{
  "version": 1,
  "name": "My project",
  "createdAt": "2026-08-07T10:24:11.000Z",
  "updatedAt": "2026-08-07T18:03:52.000Z"
}
```

**It is this file that makes a folder a project**, never its name: the studio opens the folder you
point it at and looks for this file inside.

- **`updatedAt` moves on every document saved.** It is the last time this project did some work,
  not the last time it was opened.
- **Pointing at a folder that holds none** gets you "This folder is not an AI Desktop Studio project", in the
  journal and in a toast at the bottom right — not a system message.
- **A file that was truncated or edited by hand** is reported as unreadable, and the studio refuses
  to open it rather than guessing at what it holds.
- **A project made by a NEWER build of the studio is refused.** It is not opened as best it can be:
  the studio does not know what that build added, and the first save would wipe it without a word.
  Update the studio to open the project again; the folder itself has not been touched.

> **A project made by an earlier version opens as it is.** Its folder was called "My project
> .scenario" and its identity card `project.json`, with no dot — the studio recognises both and
> writes the new shape beside them. **The old file is left where it is**: the folder is yours, you
> may be syncing it, and an earlier version of the studio can still read it. Renaming the folder to
> drop its extension is yours to do if you care to; the studio does not touch it.

---

## The project's context

You are working on a medieval film. You ask for « a house » and you get a suburban bungalow. You
rewrite « a medieval half-timbered cottage, in a misty forest, oil painting » — and you rewrite it
on every generation, all day long.

**The project's context is where that is written once.** It lives in the **Context** panel, in the
lower half of the left column beside the Explorer and Git: all three speak about the open project —
its tree, its history, and what it is about.

The project menu in the title bar leads there too: **The project's context**, between the list of
projects and the two ways to open another. It is one of the two rows that act on the open project
rather than leaving it — the other is **Close the project**.

### Cards, and nothing imposed

A context is a list of **cards**. Each carries a title you choose, a text you write, and a switch.

```
PROJECT CONTEXT                       [+]
──────────────────────────────────────────
☑ World
  Middle Ages, 13th century. Deep forest,
  a kingdom in decline.

☑ Art direction
  Oil paint, chiaroscuro, ochres and muted
  greens.

☐ Character: Aldric
  A scarred knight, tarnished armour.

☑ Forbidden
  Concrete, neon, modern clothing.
──────────────────────────────────────────
                412 / 600 characters sent
```

**No rubric is imposed**, and deliberately so: a novelist, an architect and a game studio describe a
world in entirely different words. The `+` button offers three ways to begin — World, Art direction,
Forbidden — but they are starting points only: rename them, rewrite them, delete them.

**A card that is off keeps its text and adds nothing.** That is how a character is set aside for a
series of images without being lost.

### What is sent, and the counter

The text of the cards that are on is added **under** your prompt, never in front of it:

```
a ruined house

Project context —
World: Middle Ages, 13th century. Deep forest, a kingdom in decline.
Art direction: Oil paint, chiaroscuro, ochres and muted greens.
Forbidden: Concrete, neon, modern clothing.
```

The counter at the foot of the panel says what is actually sent. **The bound is six hundred
characters, and it comes from the models rather than from the studio**: many text encoders read only
seventy-seven tokens — some three hundred characters — and drop the rest without a word. Past the
bound, **the last cards are not sent**; they are dropped whole, never cut mid-sentence.

### Reference images

A card can carry up to **four images**: drop them onto it from the library.

They do not travel on their own. The generation panel shows them with a **Use these references**
button, and nothing moves without that click — a reference image changes which operation the model
runs and what it costs, which is not something that should happen by surprise. The button does not
appear for a model that takes no image.

### The file, and what happens if it breaks

The context is written to `.project-context.json`, **at the root of your project folder**. So it
follows the project: copied to a disk, sent to someone, versioned in Git — it is there. It is
readable JSON and you may edit it by hand.

If the studio cannot read it, **it leaves it untouched** and the panel says which of the two things
happened:

| What the panel says | What to do |
|---|---|
| The file cannot be read | Repair it, or delete it to start over. Nothing was overwritten |
| Written by a newer build | Update the studio |

A project with no file has no context, and that is the ordinary case: nothing is created until you
write a first card.

### What the context touches, and what it does not

**It applies to every generation** — images, video, 3D models, audio, skies — as soon as
the model has a description field. An upscale, a conversion, a mesh made from a picture have none:
the context then does nothing, silently.

**The assistant receives it too.** It knows which project it is working in without being told.

**Your file names do not change.** A generated asset is named after the start of its prompt; it is
**what you wrote** that names it, never the version the context lengthened. Likewise « Regenerate »
reopens the form on your own prompt rather than on the lengthened one — otherwise the context would
add to itself at every replay.

---

## Documents

A document is a work in progress: an image with its layers, a 3D scene with its objects, an edit
with its tracks.

The **+** button at the top of the left rail makes one, and asks two things: its **name** and its
**location**.

**The proposed name says what the document is** — `Scene 1`, `Video 1`, `Image 1` — and the
format's extension is written to the right of the field, so you see the file before saying yes.
Each type counts its own: the first image of a project is called `Image 1` even where the project
already holds three scenes.

The location is walked **in columns**, the way the system's own save window is: each column shows
what one folder holds, and choosing a folder opens its contents in the next column. **The last
folder chosen is where the document goes** — there are not two things to keep track of. The whole
path is written above the columns. You never leave the project: nothing else is offered.

The columns open on the folder the Explorer is showing, or, when nothing is picked there, on
the section's own folder — `Scenes/` for a scene, `Images/` for an image, `Materials/`
for a material. Below them, **New folder** makes one in the chosen folder without leaving the
window.

It is saved with `⌘S` / `Ctrl+S` — into the folder you chose when you made it, and afterwards
wherever you filed it — under an extension that says what it is:

| Document type | Extension | Workspace |
|---|---|---|
| layered image | `.ora` | Image |
| 3D scene | `.gltf` | 3D |
| video sequence | `.otio` | Video |
| sound being edited | `.otio` | Audio |
| sky | `.gltf` | Skyboxes |
| material | `.mtlx` | Materials |

The extension is there so the folder **reads at a glance**. `a3f1.gltf` next to `b204.mtlx` says
what each one is; `a3f1.json` next to `b204.json` says nothing.

> **All six kinds save**, and the **Explorer** panel lists what the folder holds — that is how a
> closed document is reopened. Closing a tab whose work is not written asks before losing it.

### Walking the project — the Explorer panel

The **Explorer** panel shows **the project folder**, as a tree: the seven starter folders, and
whatever you made or dropped in there yourself. Folders unfold, files are inside them, as in your
system's own file browser.

**It shows what the studio cannot open, too.** A `.pdf`, a `.txt`, a folder of notes: it is your
folder, and that is what tells an explorer apart from a list of documents.

A document is written there under **the name you gave it**, and the list reading follows it with
**its extension in grey** — `Scene 1 .gltf`. Renaming the row changes the name, never the
extension.

#### Two readings of the same folder

The head of the panel carries three buttons. The first two say how the folder is READ, and one of
the two is always lit:

| Reading | What it shows |
|---|---|
| **By folder** | the project as it is filed on disk, as a tree |
| **By domain** | every file in the project grouped by what it **is**, wherever it is filed |

**By domain** ignores folders. It lays down at most eight headings — the studio's six kinds, **Material**
for a `.mtlx` document, and **Other** for what belongs to none — each followed by how many files it counts. **A domain nothing
fills does not appear**: eight empty headings over a new project would say nothing at all.

A heading names, it does not open: it cannot be selected, it cannot be renamed, and nothing drops
onto it.

**It has almost nowhere to drop**, and that is mechanical: filing a file needs a folder to carry
it into, and there is no folder left on screen. A row can still be picked up, but the only target
remaining is the blank below the tree — the project root. **To file, go back to By folder.**

It is what answers "where did my videos go?" when they are spread across five folders you made
yourself.

#### Searching, and sorting

Under the buttons, a bar: a field and a sort. **A search speaks over either reading** — typing a
word is a question about the project, not about the way it is being shown.

It walks the **whole** folder, not only what is unfolded, and brings back each match **with the
chain of folders leading to it**: a file nine folds down appears where it lives, not adrift. It
waits for your typing to settle before it goes.

The sort files by **Name: A to Z** or **Name: Z to A**. It holds for both readings; it does not
touch the order of the domains, which is the one the studio uses everywhere else.

**The panel tells four silences apart**, and that is the whole of it: a folder that would not be
read, a walk still running, a project holding no file at all, and a word nothing answers to — so
it never says "empty" where it means "wait". **A search that matches nothing does not take the
field it was typed in off the screen**, or there would be no way back.

#### The gestures

| Gesture | Effect |
|---|---|
| **Double-click** a folder | opens or closes it |
| **Double-click** a studio document | opens it, switching workspace if it belongs to another |
| **Double-click** an asset | **opens it in the studio**, in the workspace that edits its kind — wherever it is filed |
| **Double-click** any other file | hands it to your system, which opens it with the right application |
| `→` `←` | unfolds, folds |
| `↑` `↓` | the previous row, the next one |
| `Enter` | opens the row |
| **⌘-click** / `Ctrl`-click | adds the row to the selection, or takes it out |
| **⇧-click** | takes everything from the last row picked to this one |
| **Drag** a row onto a folder | moves the file or folder into it, under the same name |
| **Drag** a row into the blank below the tree | takes it out of its folder, to the project root |

**Everything below holds for the whole selection**, not for the clicked row alone: a drag carries
several at once, and the right-click menu applies to all of them. **Three files carried into a
folder one of them holds do not light that folder up** — the refusal is asked of the batch, not
row by row.

**Dragging moves, right-clicking renames** — and the two do not overlap: "Rename" changes the
name **where the file already is**, and cannot take it out of its folder. A folder that would
not accept the drop never lights up, so you see before you let go rather than after. A name
already taken in the destination is refused rather than overwritten, and the journal says so.

#### Right-clicking: twelve gestures, in four groups

| Group | Gesture | What it does |
|---|---|---|
| open | **Open** | opens the file in its workspace, or unfolds the folder |
| | **Show in folder** | opens Finder or Windows Explorer, on the row you clicked |
| | **File information** | opens the window that tells everything the studio knows about this entry |
| clipboard | **Cut** · **Copy** | hold the selection for the next paste |
| | **Paste** | drops what the clipboard holds into the folder shown |
| files | **New folder** | creates an empty folder in the folder shown |
| | **Duplicate** | lays a copy beside the original, under a free name |
| | **Rename** | changes the name on disk, where it is read |
| | **Move to trash** | sends it to your system's trash |
| going back | **Undo** · **Redo** | undo and redo the last batch of files |

**Eight of these twelve gestures show the shortcut they answer to**, and it is the one *in
force*: if you remapped it in the settings, yours is what appears here. The other four —
**Open**, **Show in folder**, **File information**, **Rename** — show none, and that is correct:
they are not commands of the registry. `Enter` does open the row, but it is the tree that listens
for that key, and it cannot be changed.

**No gesture ever leaves the menu; the ones that do not apply are greyed.** A menu whose length
changes with the row you clicked is a menu one cannot learn. **File information** is greyed on a
folder — what it answers is a file's.

**Four gestures do not follow the selection, and they are exactly the four without a shortcut**:
**Open**, **Show in folder**, **File information** and **Rename** aim at the row you just
clicked, even with several names taken. The other eight work on the whole selection. The split
needs no learning: a gesture about **one** entry — opening it, showing it, describing it,
renaming it — cannot aim at twenty.

**`⌘Z` only undoes files while the focus is inside this panel.** Elsewhere it belongs to the open
document: undoing on the canvas must not reach your disk.

> **Nothing is deleted here.** "Move to trash" is the system's own trash: the file can be got
> back from it.
>
> **It is the one gesture `⌘Z` does not take back.** Moving, duplicating, creating, renaming are
> one keystroke from being undone; the system trash has no portable way back, and the studio's
> history stops there. **That is also why a batch asks first**: past one file, the studio says how
> many are going and waits for your word. **A single file goes without a question** — it is named
> on the row you just clicked, and the system offers to put it back.
>
> **One door of the studio does delete for good**, and it says so: **Delete document…**, in a tab's
> menu, takes the file out of the folder without going through the trash. Its dialogue announces
> "This cannot be undone.", and it means it.

**One refusal, greyed rather than hidden.** What the studio keeps for itself — everything starting
with a dot: `.index/`, `.ai-desktop-studio/`, `.project.json` — cannot be renamed or trashed, and receives
nothing either. Those are its tools; renaming one would break the project for a name nobody reads.
**The same refusal holds on both sides of a drag**: you see before you let go.

**A document written as a folder receives nothing either.** An `.ora` sheet is a real directory,
but what it holds is the studio's own writing: a file dropped in there would be erased by the next
save, which rebuilds that folder. The document itself moves like any other file — it is its inside
that does not open.

**Everything else obeys you**, the seven starter folders included: rename them, empty them, throw
them away, take an asset out of one and file it elsewhere, cut, copy, duplicate. The studio
follows — that is what the reconciliation pass does when a project opens and when you come back to
the window.

**Renaming goes through the gesture of the thing.** An asset and a document each have one, and
the Explorer leads to it: the name changes, and the file follows in the same move. A document
renamed here keeps its tab open, which takes the new name. An asset renamed here changes name
everywhere at once — the Explorer, the Inspector, the tab editing it — because there
is only **one name**: its index row's name IS its file's name.

> **A picture you dropped in yourself renames too**, even where the studio holds no entry for
> it: it is then an ordinary file, renamed as one. What changes from case to case is what
> FOLLOWS the name — an index row, a document's tab, or nothing.

> A name your file system would not accept is refused rather than silently corrected — a slash,
> for instance. So is a name the folder already holds, rather than overwriting somebody else's
> file. The field has closed by the time the answer comes: the activity journal is what says so.

- documents already on screen are marked **Open**;
- a document's icon says which workspace it belongs to, the same one the rail uses.

#### Hidden items

**Nothing whose name starts with a dot is shown by default** — so `.project.json` and `.index/`,
but also a folder of your own whose name you began with a dot.

**The third button at the head of the panel shows them**, under the eye every file browser draws
for this. What it reveals stays **read-only**: those rows refuse every gesture, on both sides —
no rename, no trash, no drag, and nothing dropped into them. It is what the studio holds for
itself, and seeing it is not touching it.

**A folder is only read once you open it.** `Images/` can hold thousands of files in an ordinary
project, and reading them to count them would cost a wait on every project opening.

**The tree follows the disk.** Copy a file into the folder from your system: it appears, with
nothing to click. It is read again when you come back to the window as well — a project on a
network volume sometimes emits no event at all, and that second net catches it.

#### What happens when you tidy the folder without the studio

The tree only shows. **What actually follows your files is a pass** that puts the catalogue and
the disk back in agreement, and it runs at two moments: **when a project opens** — catching what
moved while the studio was closed — and **when the window comes back to the front** — catching
what moved while it was open. The Finder is the other half of every project folder; neither
moment is enough on its own.

**It recognises a file by its contents, not by its path.** Move a picture from one folder to
another, rename it, do both: the entry finds it again and follows. The ids do not change, so **a
3D scene keeps pointing at its image** after you have filed it elsewhere.

**It never deletes an entry.** A file it cannot find is **dated as gone**, and its entry stays:
the prompt, the seed and the lineage are written on no disk, and losing them because a file is on
an unplugged USB stick would be losing more than the file. Plug the stick back in, and the next
pass puts the entry back in service.

**Most of the time you will not see it.** A bar shows at the head of the panel **while a pass is
running** — but an ordinary pass reads the folder, finds everything where the catalogue says it
is, and is over before it could be drawn. What makes it visible is a project where something
moved: that is the case where the pass has to read files, so the only one where the wait lasts
long enough to deserve an explanation.

| What the bar shows | |
|---|---|
| **Looking for files moved outside the project** | and the progress, as soon as it knows how many files it will read |
| **Stop** | calls off the search; **whatever was found already stays found** |

**The journal only speaks if something changed**: *n files moved outside the studio were found
again and followed*, and — as a warning — *n catalogued files are nowhere in the project, their
entries are kept*. A pass over a project where nothing moved writes nothing at all, and that is
what makes it bearable on every return to the window.

> **It is still where a closed document is found again.** The layout remembers which tabs are open,
> but a document closed while no layout held it is no longer reachable through tabs; it is in
> the folder you filed it in, one fold down.

> **A document never saved does not come back on restart**, and neither does its tab: it is
> dropped from the layout rather than reopened onto "This document is no longer open." The layout
> is written to your disk, the contents of documents are not — the project's own files stand for
> them, and what was never written has nothing to reopen.

There is no "Open file" dialogue, and none is planned: the studio only opens what is in the
project.

### How a document is written

The studio writes to a transit file first, then renames it over the old one. That means that if the
computer shuts down **during** the write, you keep the previous version intact rather than a
half-written file.

> A power cut at the exact second of the write can still lose the last save. That is the accepted
> trade-off: the alternative would cost a wait on every `⌘S`.

---

## Recording versions — the Git panel

The **Git** panel tracks **your project folder**, and nothing else: your files, never the studio
itself. A recorded version is a complete state of the folder that you can then read back file by
file — which is what the **History** panel, in the bottom band, shows.

It is the safety net of long work: a lighting pass tried out before the weekend, a material you
would rather abandon, a folder of twenty documents you want back the way it was yesterday.

### Setting the tracking up

On a project that does not track its versions yet, the panel offers a single button: **Track
versions**. It prepares the folder, on this computer, and **sends nothing anywhere** — a server, if
you want one, is linked later.

Three things happen at that moment, and they are worth knowing:

- The studio writes an ignore file that leaves `.index/` out: that folder is **rebuilt** from your
  own files, and recording it would be recording a cache. **An ignore file already there is left
  alone** — a project coming from somewhere else keeps the rules somebody wrote.
- The name of the first branch is the one **your** git uses by default. The studio imposes none.
- Tracking covers **the project root**. A project folder sitting inside a repository that has
  nothing to do with it — a home folder somebody versioned once — does not count as tracked, and
  the panel offers to set it up for itself.

> **If git is not installed**, the panel says so and offers no button: there is nothing to offer
> until the program is there. See [Settings ▸ Versions](14-settings.md#versions).

### Recording a version

At the top of the panel, a field for **what this version says**. Below it, the list of what has
changed, each file with a tick box.

**The tick box is the central gesture**: ticking it says "this one will be part of the next
version". Unticking takes it back out. There is nothing else to understand, and no second pair of
buttons for the same thing.

The **Commit** button wants **a message and at least one ticked file**. While either is missing, it
stays off — unless **Correct the last one** is ticked, where the message alone is enough: redoing a
version for its message alone is the commonest case.

| What you want | The gesture |
|---|---|
| Record part of what changed | tick those files, write the message, **Commit** |
| Record a whole group at once | the **Tick all of…** button on its heading, then **Commit** |
| Fix the version you just recorded | tick what was missing, tick **Correct the last one**, **Commit** |

**Correct the last one** redoes the last version instead of adding one — a badly worded message, a
file forgotten by a minute. The box only appears once there is a version to correct.

> **A message is never lost.** It is only cleared once the version has actually been recorded: a
> refusal — no author configured is the one everybody meets first — leaves your text there to try
> again. It also survives leaving the panel, and even changing project.

### The four groups of files

The list sits under four headings, in this order, and **an empty group does not appear**:

| Group | What it holds |
|---|---|
| **In conflict** | what a merge could not settle — to be dealt with before anything else |
| **Held** | what is ticked, so what the next version will record |
| **Changed** | what has changed since the last version, and is not ticked |
| **New** | what the tracking has never seen — a freshly generated asset, for instance |

Every heading carries the **count** of its files and a button that takes them **all** — "Tick all
of Changed", "Untick all of Held". An import that writes thirty files is ticked in one click
rather than thirty.

**The list is flat, not a tree**: what is read here is the short list of what MOVED. The tree is
the Explorer, one icon up.

### The gestures on a row

| Gesture | Effect |
|---|---|
| **The tick box** | brings the file into the next version, or takes it back out |
| **Compare** | shows the before and after **in the bottom band**, and brings it forward |
| **Restore** | puts the file back the way the last recorded version has it |

**Compare** is not offered on a **New** file — it has no earlier version to be compared against —
nor on a file in conflict, which holds both versions at once.

**Restore** is only offered on a **changed** or **deleted** file, for the same reasoning: a brand
new file has nothing to go back to. **Deleting it is the Explorer's job**, which goes through your
system's wastebasket — a file does not vanish out of a version panel. A **renamed** file cannot be
restored either: putting a rename back would touch two paths, one of which you did not click.

### The panel keeps itself current

It reads again when you **change project**, when the **folder moves on disk** — including under a
hand that is not the studio — and when the **window comes back to the front**. Nothing is polled.

The **Refresh** button, at the top of the panel, is there for legitimate impatience: you have just
done something in a terminal and you want to see it **now**.

### Branches

The left-hand button carries the name of the branch that is out — or **Off any branch**, if you
have landed on a precise version rather than on a branch. It opens the list of branches, with a
tick on the one that is out, and a **New branch** row.

> **That list is read again on every open**: a branch created in a terminal **without switching to
> it** is already there. The **Refresh** button is still the one for files — it does not read the
> branches, and does not have to.

A branch is how you try something else without losing anything: two artistic directions on the same
project, each with its own.

> **Before the first recorded version there is no branch at all** — git has none until something is
> recorded. The button then goes straight to the name field, rather than opening a list of one.

A name git would refuse is refused **before** the command, rather than handing you a message
written for someone reading a manual page: no whitespace, and none of the characters
`~ ^ : ? * [ \`.

### Setting work aside

**Set aside** puts away everything that changed — **new files included** — and gives you back a
clean folder. It is for the attempt you want out of the way while you look at what was underneath,
without recording it and without losing it.

Nothing is asked of you: the pile is named on its own after the branch and the moment. The button's
menu then lists what is waiting.

| Gesture | Effect |
|---|---|
| **Set aside now** | puts everything away, and leaves the folder clean |
| **Clicking a pile** | brings it back into the folder **and takes it off the list** |
| **Throw away** | deletes it without bringing it back — **nothing recovers it afterwards** |

### A server, if you want one

While the project talks to no server, and **once a first version has been recorded**, the panel
shows an address field and a **Connect** button. The address is pasted: it is the one your host
displays after a repository is made. Nothing else is asked, and **nothing is sent at that moment**.

Once connected, three buttons appear at the top of the panel:

| Button | What it does |
|---|---|
| **Check** | goes to see what the server has that is new, **without changing anything on your side** |
| **Take** | brings home the versions recorded elsewhere |
| **Send** | puts your versions on the server |

Beside them, two counts — "3 to send", "2 to take" — which **only appear when they are not zero**.

> **The first send of a branch is offered even with nothing ahead**: it is what creates that branch
> on the server.

**The studio never asks for a password.** If the server refuses access, the panel then — and only
then — asks for a username and a **personal token**, once per server rather than per project. It is
encrypted by your system's keychain, never comes back out of the application, and **the send that
was refused is retried on its own**. If a token is already held and the server refuses it anyway, a
**Forget the token** button erases it.

**Nothing leaves or arrives without one of those three buttons**: the server is never checked on
its own. One server per project, named `origin`, which is what git and every host assume.

### When two versions disagree

After taking versions in, files can land under **In conflict**: both sides touched the same place,
and nobody can decide for you. That group goes to the top of the list, and its rows carry two
buttons instead of the usual gestures:

| Button | Effect |
|---|---|
| **Keep my version of…** | keeps what you had, and drops what was arriving |
| **Keep the other version of…** | keeps what was arriving, and drops what you had |

Once every conflict is settled and the files are ticked, **Commit** finishes the merge.

The group's heading carries the way out: **Abandon the merge** puts the folder back the way it was
before the merge started.

> What the panel **does not do** — a complete git client, a merge by hand, a password prompt, an
> SSH key with a passphrase — is written plainly in
> [What does not exist yet](18-limits.md#git). The tracking settings, including the author name
> written into every version, are in [Settings ▸ Versions](14-settings.md#versions).

---

## Reading versions back — the History panel

The **History** panel sits in the bottom band and wants **a folder tracked by git**. It shows the
recorded versions of **every branch at once**, not only the one you are on: the Git panel writes,
this one reads back, and both are looking at the same folder.

> While version tracking is not set up, **the panel is not offered at all**: no icon in the rail,
> and no bottom band either — it takes no room. The Git panel is what says where this project
> stands, and what carries the button. Tracking set up but nothing recorded yet: **No version
> recorded so far.**

### What a row carries

| Column | What it says |
|---|---|
| **The drawing** | which branch this version belongs to, and what it came from |
| **The fingerprint** | the short name git gives the version |
| **The badges** | the names pointing at it — see just below |
| **The message** | what you wrote when recording it. It takes all the room that is left |
| **The author**, **the moment** | who recorded it, and when |

Three kinds of badge, **one of them alone in solid blue**:

| Badge | What it is |
|---|---|
| **Named version** | a name somebody put on this version. The only solid blue one, because it is what you scroll a history looking for |
| **Branch** | a branch on your computer stands here |
| **Server branch** | the server stood here at the last **Check** |

### The order is not the clock's

Versions are laid out **by descent**, not by date: a version always sits above the ones it came
from. On a project worked across several machines, two badly set clocks are enough to make the
order of dates wrong, where descent cannot be argued with. So you may well meet an older date
above a more recent one: that is not a display fault.

### Opening a version

Click a row: the **Files of this version** column opens on the right and lists what that version
changed, in the same words as the Git panel — **Added**, **Changed**, **Deleted**, **Renamed**.
Clicking the same row again closes the column.

> A version may touch no file at all — a merge, most of the time. The panel says so rather than
> leaving you in front of an empty column.

### Comparing a file of that version

Click a file in the column: the comparison opens in the **wide zone**, on the right. It is the
same zone the Git panel uses, and that is deliberate — the narrow panel asks, the wide zone shows.

| What you compare | What you see |
|---|---|
| **A text file** | the added lines in green, the removed ones in red, with the line numbers **of both versions** side by side, and the signed tally at the top: `+12 −3` |
| **A picture** | both states side by side, **Before** and **After**. This is the comparison this studio exists for, and the one no list of lines can give |
| **A file that has just appeared** | it has no before, and the column says so rather than staying blank. A deleted file has no after |

**Close the comparison** gives the room back. A file git cannot compare — too large, missing from
both sides — says so as well, rather than staying on hold.

### Naming a version

At the top of the files column, **Name this version** puts a name on it. It is what you put on the
state a client saw, on the one that went to print, on the one before an idea that did not work: a
name is found by scrolling, a fingerprint is not.

The name follows the same rules as a branch name, and for the same reason — no whitespace, and
none of the characters `~ ^ : ? * [ \`. Once it is on, it shows on the row in solid blue, and it
stays there.

### Sixty at a time

The history is read in pages of sixty versions. A **Show more** button loads the next ones
underneath; it goes away when there is nothing left to load. A two-year project holds tens of
thousands of versions, and reading them all to draw twenty is what this paging avoids.

### The panel keeps itself current

Recording a version, correcting the last one, changing branch: the list reads itself again, with
nothing to ask for. The **Refresh** button is there for the other case — what was done **outside
the studio**, in a terminal. It reads from the first page again rather than adding to what is on
screen, otherwise the two halves of the list would describe two different states of the folder.

### What the panel does not do

**It does not put the folder back to an older version.** You read a version here, compare it, name
it; no gesture brings it back out. The two ways back the studio does offer are elsewhere and
narrower: **Restore** on a row of the Git panel returns **one** file to the way the **last**
recorded version has it, and changing branch swings the folder to the tip of a branch, never to a
version in the middle.

> A terminal does know how to land on a precise version. The studio then shows it without
> flinching: the branch button reads **Off any branch**, and the history goes on being readable.

---

## Moving, copying, backing up a project

| You want to… | Do this |
|---|---|
| **Back it up** | copy the folder. That is all |
| **Slim it before copying** | delete `.index/proxies` and `.index/peaks` — **keep `catalog.db`** |
| **Move it elsewhere** | move the folder, then reopen it from the studio |
| **Rename it** | rename the folder. The displayed name comes from `.project.json` |
| **Share it** | send the compressed folder. Whoever receives it will need their own API key |

Nothing breaks: the paths written inside the project are **relative**, which means they describe a
position inside the folder, not a location on your disk.

> **One exception: imported media.** When you import a file from your disk — **video, sound,
> picture or 3D object, all four can be imported** — the studio **does not copy it**: it creates a
> link to where it sits. If you move the project without taking those files along, the links break.
>
> **Nothing will tell you until you click.** The inspector does not show "File not found" of its
> own accord: it offers the **Show in folder** button, and it is the click, finding
> nothing, that brings the message up. See [Assets](07-assets.md).

---

## Reopening a project at startup

By default, the studio **reopens the last project** when you launch it. You find your tabs and
panels where you left them.

This behaviour is adjustable: **Settings ▸ General ▸ On opening**, with two choices — "Reopen the
last project" or "Open nothing".

You can also choose **where the studio offers to create your projects**:
**Settings ▸ Storage ▸ Projects folder**. This moves nothing; it only preselects a location in the
dialogue.

---

## With no project open

The studio works, but several things are unavailable, and say so:

| What you see | Why |
|---|---|
| "Open a project to generate." | a made image has to land somewhere |
| "Open a project to see its assets." | the Explorer shows a project's contents |
| The rail's **+** button is greyed out | a document is a file in a project folder |

---

[← The window](03-the-window.md) · [Contents](../user-guide.md) · [Next chapter: Finding a model →](05-models.md)
