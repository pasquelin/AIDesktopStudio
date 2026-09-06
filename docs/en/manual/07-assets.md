# 7. Assets and the Library

[← Generating](06-generating.md) · [Contents](../user-guide.md) · [Next chapter: Image workspace →](08-image-workspace.md)

---

## Two panels, two questions

Your assets are read in **two places**, and knowing which answers what is all you need from this
chapter:

| Panel | What it shows | Where |
|---|---|---|
| **Library** | what your account hosts **online**, what the community publishes, and the generations under way | left column, upper half |
| **Explorer** | what your project holds **on this disk** | left column, lower half |

**They hold the screen together, and that is deliberate**: what enters your project passes from
the library to the folder, never otherwise.

The first is a store — you look at what you do not have yet, and download it. The second is your
folder — you file, rename and work in it.

> **The Library used to share the screen with the project's catalogue**, under the name "Assets".
> Both panels then listed the same files in different words: one panel answers that question now,
> and it is the Explorer.

**Without an API key the Library does not appear at all** — not even its icon in the rail. It has
nothing to show: everything it lists comes from a remote account. **Generate**, beside it, stays
on offer: it has this machine's own models to propose. See [Your keys](14-settings.md) to enter
one.

---

## What you find there

Six asset types:

| Type | What it is | Where it lands |
|---|---|---|
| **Image** | a still image | `Images/`, or `Materials/` when it serves a material |
| **Video** | a moving shot | `Video/` |
| **Audio** | a sound, a piece of music | `Audio/` |
| **Mesh** | a 3D object | `Modelling/Models/` |
| **Skybox** | a 360° sky | `Skyboxes/` |
| **Animation** | a motion, to be replayed on a character | `Modelling/Animations/` |

**Where it lands, not where it lives.** These folders are laid down when the project is created,
alongside `Materials/` which answers to no kind, and are only a starting point: move an asset
wherever you like, rename the folder, empty it. What a file IS does not depend on where it sits —
the studio finds it again, and its entry follows.

---

## Searching and filtering

**The controls sit on their own line, below the title.**

In a narrow column a bar laid on the title line would push the close button out of the frame, so
it lives **below** it. The mechanism still exists for strips, where the row is wide and mostly
empty, but this panel no longer reads in one.

| Control | What it does |
|---|---|
| **Search…** | queries the library, once the typing stops |
| **Type** | keeps only **one** kind of asset — picking one replaces the previous |
| **Origin** | **My library**, what your key owns; **Community**, what other people published. Nothing ticked reads yours; ticking the community **adds** to it rather than replacing it |
| **Icons** / **List** | grid of thumbnails, or dense list |
| **Smaller thumbnails** / **Larger thumbnails** | their size |

**Nothing is filtered here**: the word travels to the API, which looks for it in the name, but
also in the **prompt** and the description — which no local search could do. That is why a result
found on its prompt stays on screen even when its name does not hold the word.

**The Community costs a search** and is therefore read only while it is ticked: the feed is
unbounded, and it would drown your own assets under everybody else's.

The list fills in **as you scroll**: the library hands over its assets in batches, and reaching
the bottom asks for the next one.

> **Search does not ask you for accents.** Typing `foret` finds "Forêt d'hiver", and `ete` finds
> "Été". That holds for the project's assets and in the settings search: you search by typing, not
> by spelling. For the **library** half the API answers, and it decides on its own — as in the
> **Models** panel, which does not search itself either.
>
> It applies to files coming from the Finder too. macOS writes names in a form where the accent is
> a character of its own — invisible to the eye, different to the machine — so an imported asset
> did not always answer to its own name retyped here. Both forms are now treated as one.

Both views are **virtualised**: only what is actually on screen is drawn. A project with several
thousand assets therefore scrolls without stutter.

**A sound shows itself as its waveform** on a tile, rather than as a speaker glyph: two takes of
the same length looked identical until one of them had been played. The waveform is the one the
timeline draws, derived at import — so it appears a fraction of a second after the tile, once it
has arrived.

### When the Library is empty

The message says which of the three cases you are in, because they call for different answers:

| Message | Situation |
|---|---|
| "Nothing in this remote library." | your account hosts nothing of this kind |
| "No result for this filter." | your filters are too narrow |
| "Your library did not answer." | the API refused — a **Retry** button asks again |

**The last is not an end, it is a question left unanswered**: an empty list and a refusal look
alike on screen, and one is worth trying again where the other is a fact.

---

## Downloading from the Library

| Gesture | Effect |
|---|---|
| **Click** | picks the row |
| **⌘-click** *(Ctrl elsewhere)* | adds this row to the pick, or takes it out |
| **Shift-click** | picks the whole range between the last one held and this one |
| **Chevron** | unfolds the row, and shows **which prompt** made the asset |
| **Double-click** | **downloads, then opens** what arrived |
| **Right-click** | **Download** — the whole range when this row is part of it |
| **Drag and drop** | drops the asset wherever you release it; it is fetched **at the drop** |

**The chevron is what makes this panel more than a wall of thumbnails.** Unfolding a row you do
not own shows what the library knows of it — its dimensions, its weight, its date, and above all
the **prompt** that produced it. That is the field one weighs before spending a download.
Unfolding a row you already own shows its catalogue entry instead.

**Double-click does not stop at the download**: stopping there left you guessing that a second
gesture was now needed, and which one.

**One transfer at a time.** While a download runs, double-click and the menu entry do nothing: a
second would not push over the first.

### Picking several assets

Multiple selection exists to **download in one go**: a right-click on a row of the range brings
the whole range down, in a single transfer.

**Shift-click extends, ⌘-click picks.** The first takes everything between the last asset chosen
and the one you click; the second only adds — or removes — that one. A plain click starts over.

**The starting point follows your choices.** After a ⌘-click, that last asset is the anchor for
the next shift-click: you pick three thumbnails here, then extend from the third, not from the
first.

**The Library is reachable from the keyboard too**, like every other list in the studio — see
[Walking a list with the keyboard](15-shortcuts.md#walking-a-list-with-the-keyboard).

---

## Using an asset of the project

Once the asset is on your disk, everything happens in the **Explorer**, left column, lower half.
Right-clicking a file there offers twelve gestures about the file itself, then **two groups**
aimed at the asset:

| Group | What it holds |
|---|---|
| **Send to ▸** | every destination able to take this kind of asset |
| **Asset ▸** | **Name**, **Contact sheet**, **Send** to the cloud, and **Extract its images** for a mesh |

**Two groups and not ten rows**: this menu already offered twelve gestures about the file, and
flattening everything into it made a list nobody reads.

The first three entries of the **Asset** group act on the Explorer's whole **selection**, not only
on the row clicked; their label says the count.

**Send to** lists the destinations, always in the same order:

| Row | Where it sends the asset | For which types |
|---|---|---|
| **Use as sky** | the open sky, Skyboxes workspace | pictures |
| **Add to the scene** | the open 3D scene | meshes |
| **Make the character play it** | the character picked in the open 3D scene | animations |
| **Open in the audio editor** | the open edit, Audio workspace | sounds |
| **Place as a layer** | the open image, Image workspace | pictures |
| **Add to the edit** | the open sequence, Video workspace | all |
| **Use as base colour** | the open material, Materials workspace | pictures |
| **Edit the image** | a tab of its own, Image workspace | channels and skies |

**Rename, Show in folder and Move to bin are elsewhere in the same menu**, among the twelve
gestures about the file: they are gestures on a file, not on an asset.

**Renaming changes the name in this project only** — the one on the remote account stays as it
is. One asset is pulled into several projects and named for what each one does with it. The name
can also be changed in the Inspector, by double-clicking the **Name** row.

**The file follows, and it is the same name everywhere.** A generated asset lands on disk under
its prompt — `Blue alley at dusk.png` — and renaming it really does move the file. What the
Explorer, the Inspector, the tab editing it and your own file manager read is therefore one and
the same thing. A name your file system would refuse is refused here too, rather than silently corrected;
so is a name the folder already holds, rather than overwriting another picture.

> Files that arrived **before** this rule keep the technical name they were given —
> `asset_40f76c36-8ad4-4def-a1b3-9125cba4da98.png`. They take their real name the day you rename
> them, and not before: the studio does not stir your folder on its own.

**Make the character play it asks for two things, and the menu only shows one.** The row lights up
as soon as a scene is open somewhere — but a motion is laid ON a character, and that character is
the one you picked in the scene. **With no character picked, the row stays lit and does nothing**,
without a word. It is the one row of this menu that stays lit while something is missing —
everywhere else, what is missing greys out: pick the character in the scene first, then start the
motion.

**Edit the image is the row that opens a tab**, and it only appears on a channel or a sky already
on disk: those two are assembled in their own workspace — one holds channels, the other a
projection — and neither writes back the picture underneath. Retouching it therefore happens in
Image, and the tab opened is the asset's own.

**Extract its images only speaks to a mesh**, and it is the other half of the same need: the
pictures the model carries inside come out into the project, where they become assets like any
other — and so can be retouched. It lives in the **Asset** group, and stays greyed as long as the
model is not on your disk.

Each destination carries its workspace's icon, the same one as in the title bar. The menu only
shows destinations able to take **that type**: right-clicking a sound does not offer to lay it out
as a sky.

**A destination whose workspace has no open document does stay listed, but greyed out.** That is
deliberate: a menu whose length changes with what is open is a menu you cannot learn. A greyed row
tells you what to do — open a document in that workspace — where a missing row tells you nothing.

It is also what to look at when a send leads nowhere: right-click
shows in one go what this asset can do, and what is missing for it to do it — **with the single
reservation of Make the character play it**, said above.

### Double-click opens the asset, it sends it nowhere

In the **Explorer**, a double-click opens the file at home. That is the other half of the split:
double-click serves **the asset** — it opens it; right-click serves **the document already open** —
it sends the asset there.

**An asset opened by double-click gets a tab of its own**, in the workspace that edits its kind:
a picture in Image, a mesh in 3D, a sound in Audio. There is nothing to open first.

**It never looks at the tab in front of you**: the double-click opens the asset in the workspace
for its kind, whatever is on screen.

**Reopening the same asset returns to its tab**, no second one is born: two tabs onto one
document are two histories of it, and the second save would write over the first.

**A refusal is said out loud**, rather than leaving an empty tab in its place: an asset no editor
takes, or one that has not come down to your disk yet, tells you so.

The asset's kind picks its editor, and nothing else weighs in:

| What you double-click | Where it opens |
|---|---|
| a **picture** | the Image workspace |
| an **image that holds a channel** | the Materials workspace |
| a **sky** | the Skyboxes workspace |
| a **mesh** | the Modelling workspace |
| a **sound** | the Audio workspace |
| a **video** | the Video workspace |

**A double-click that leads nowhere says so**: "This asset could not be opened". That is a kind no
editor takes, or an asset not yet down on your disk — not a broken one.

> **The `+` button on the left rail makes an EMPTY document**, in the workspace you want.
> Double-click opens a document **on an asset**. Those are the two ways to start, and right-click
> is then how you feed material into what is open.

### What drag and drop can do today

| You drag… | Onto… | Result |
|---|---|---|
| any asset | the **timeline** | a clip on a track that can take it |
| a 3D scene, from the Explorer | the **timeline** | it becomes a live clip there |
| an image | the Image workspace **canvas** | it becomes one more layer, armed |
| an image | a **material** preview | it becomes the base colour |
| an image | a specific **channel**'s thumbnail | it becomes that channel |
| a panoramic image | a **sky** preview | it becomes the sky |
| a mesh | the **3D view** | it enters the scene, at the origin |
| a sound | the **audio editor** | it joins the edit as a clip, and that clip is what you edit |
| an asset | an **asset field** of a generation form | it becomes that field's input |
| a motion, or a mesh that carries one | a **sub-track** of the band, in 3D | it becomes a block there, where you release it |
| an image | an image row of the **Inspector** — a material's maps, a sprite's picture | it fills that row, and that row only |
| a sky | the **Sky** row of the Inspector, in 3D as in Materials | it lights the preview |
| any asset | a **folder row** of the Explorer | its file is moved there |

**The timeline does not sort on duration**: an asset with no duration of its own gets a default
one rather than a refusal. It does sort **tracks**, and a release that finds none stays without
effect — see [Placing a first clip](10-video-workspace.md#placing-a-first-clip). In the 3D view
the drop is accepted **anywhere on the view**, toolbar included: a release landing beside it would
be a miss you cannot see coming.

**In the centre, a drop nobody takes is not a drop lost**: over the tabbed area, an asset no
document will have opens in its own workspace, as a double-click would — a picture dropped on the
3D view opens an image document. The same holds when nothing is open: the empty centre takes the
drop.

**In the columns and in the band, a refused drop has no effect at all**, and nothing says so: a
channel's thumbnail takes pictures only, and there is nobody behind it to catch the rest.

**The Explorer is the only one of these drops that does not bring the asset into a document: it
MOVES its file**, as Finder would — and an asset from the library is fetched first. This is a
different gesture from the one in [The Projects panel](04-projects.md#the-gestures), which files a
row **of** the Explorer. The blank counts too — under the
cards it means the folder on screen, under the tree the project root — but that one does not light
up.

**And this drop carries two silences.** An asset the studio holds no file of does not move: the row
lights up all the same, the kind being readable only at the release. The pointer also shows the `+`
of a copy, while the file is in fact **moved**.

---

## An asset's inspector

Select an asset and look at the **Inspector**, in the right column. It shows, according to what it
knows:

| Section | What it holds |
|---|---|
| **Identity** | the name, the type, the **sync state**, the duration, dimensions, size, creation date |
| **Generation** | the model, the seed, the prompt — and two buttons, **Pin this recipe** and **Regenerate** |
| **File** | the **Location** on disk, and nothing else — the group only appears for an asset held locally |

**The Sync state row is the only place left that says where your copy stands with respect to the
library.** It carries the badge described below; that is where it is read for a project asset, the
Library no longer drawing a local row.

The **Show in folder** button steps out of the studio: it opens Finder, Explorer or your file
manager, with the file already selected.

> "**File not found**" means a linked medium has been moved or deleted from its original location.
> See the next section.

---

## Your account's library

Your project is a folder on your disk. Your remote account has a library of its own, online.
The two exist separately, and **nothing travels between them unless you ask**.

> **"Asking" does not mean "asking from one of these two panels".** Two gestures made elsewhere send a picture
> without going through the buttons below: **running a generation** that carries a reference
> picture, and clicking **Describe the style of the references** in the generator (chapter 6). In
> both cases the API has to see the picture to answer, so the studio sends it once, and its badge
> turns to **In sync**. Nothing is sent while you type.

### What a thumbnail's badge tells you

A small mark says where an asset stands with respect to the library:

| Badge | What it means |
|---|---|
| **Local only** | the file is on your machine, the library knows nothing about it |
| **In sync with the library** | both sides hold the same version |
| **Changed here — to send** | your copy has moved since the last upload |
| **Changed in the library — to fetch** | the other side is the one that moved |
| **Changed on both sides** | the two versions have diverged |
| **The last upload failed** | the previous attempt did not go through |
| **Belongs to another project** | the online twin answers to a different API key than the active one |
| **In your library — not on this disk** | the asset exists online under your key, with no file here |
| **Published by somebody else — not on this disk** | it is not yours; a double-click or a drag and drop fetches it |

**Where each badge is read changed with the panels.** The Library only draws the ones that speak
of a remote row — "not on this disk", "published by somebody else", "in sync", "to fetch",
"changed on both sides", "fetching". The others — "local only", "to send", "the last upload
failed", "belongs to another project" — speak of a project row, and are read on the
**Inspector's Sync state row**.

**"In sync" now draws on a thumbnail**, where it used to stay silent. The reasoning inverted with
the panel: in a grid listing the PROJECT nearly everything is in sync, and marking it covered the
screen in useless dots; in a grid listing a remote library, "you already have this one" is the
exception — and the one thing to know before spending a download.

**"Local only" stays silent on a thumbnail**, for the original reason: it is the ordinary state of
a file that never left your disk.

The badge is not stored, it is **recomputed**: it depends on the active account, and an API key
opens onto one project and one only. Switch accounts in the title bar and the badges are read
again — same file, different library on the other end.

> **"To fetch" and "changed on both sides" are now read on the REMOTE side**, on the row you would
> download — that is where they mean something, and they no longer depend on a page of the library
> happening to be in hand. They stay rare: as long as transfers are triggered by hand, nothing
> changes the online version behind your back.
>
> **"Belongs to another project" needs no waiting**: fetch an asset with one key, switch to another
> in the title bar, and it wears the badge. That is the paragraph above at work, not a syncing case.
>
> **None of these badges is a filter.** The **Origin** facet says where a row comes from, not where
> it stands: narrowing by state took nine values, seven of which spoke of a row this panel no
> longer draws.

### Sending a selection

The **Send** entry, in the **Asset** group of the **Explorer**'s right-click, uploads the
**selected** files to your account's library.

Three things describe it better than an introduction would:

- **it never leaves on its own** — it takes a selection, and a click;
- **it refuses to run twice**: during a transfer the entry is inactive, so a second click cannot
  push over the first;
- **it reports asset by asset.** What went through went through; what failed takes the *failed*
  badge and a line in the journal — an upload is not all-or-nothing.

A selection with no file leaves the entry greyed out.

> **The two directions live in two panels, and that is this chapter's split**: you SEND from the
> Explorer, where your files are; you DOWNLOAD from the Library, where what you do not have yet is.
>
> **The entries are greyed out, never hidden**, with no project open or while a transfer is
> running: an entry that comes and goes depending on what is open is one nobody can learn.

### Naming from what the API sees

The **Name** button, next to it, asks the API to look at the selected pictures and give them a
name drawn from their content. The names land in the project's catalogue.

**It only sees pictures the library already knows.** The API describes what it hosts: a picture
that has never been sent is dropped from the request, silently. Send it first, name it after.

> **This button is not the only door, and that is the one thing to take away here.** The
> **Name fetched assets** setting, under **Generation**, is **on by default**: a picture that
> arrives without a useful name is sent to the API with nobody clicking, and that **spends creative
> units**. The chapter [All the settings](14-settings.md) covers it — it is the one place where the
> studio spends of its own accord, and unticking it is enough to stop it.

---

## Importing your own media

Right-clicking the Explorer's **blank** offers **Import media**. The gesture aims at the PROJECT
and not at a row, which is why it lives under the blank, next to **New folder**.

### What can be imported

| Type | Accepted extensions |
|---|---|
| **Video** | `mp4` `mov` `mkv` `webm` `avi` `mxf` `m4v` |
| **Audio** | `wav` `mp3` `aac` `flac` `m4a` `ogg` `aiff` |
| **Image** | `png` `ora` `jpg` `jpeg` `webp` `avif` `gif` `svg` `tif` `tiff` `exr` `hdr` |
| **3D** | `glb` `obj` `fbx` `stl` `ply` `dae` `usdz` — and `bvh` for a motion capture |
| **Documents** | `ora` `gltf` `otio` `mtlx` |
| **Montage with media** | `otioz` |

The same asset list applies to the picker; desktop drops, the application icon and Open with also
accept the standard documents and montage bundles listed above. A document is copied into the
project and opened; an `.otioz` is unpacked with its media as through **File › Import**. A
compatible target is outlined in blue; a refused format is outlined in red and the journal names
the files that did not enter. In a mixed batch, accepted files enter and the rest are reported
together.

**A 3D file becomes a `.glb` as it enters.** The studio works with one 3D container only, binary
glTF: an `.obj`, an `.fbx`, a `.dae`, a `.usdz`, an `.stl`, a `.ply` or a `.bvh` is converted once,
on import, and that `.glb` is what the catalogue, the scene, the character editor and the game
export read from then on. The original is not thrown away: it is filed in a `.sources` folder
beside the converted file, together with what it referenced — an `.obj`'s `.mtl` and textures, a
`.dae`'s pictures — out of the catalogue. What the conversion could not keep is said in the journal
as the file enters: missing materials for an `.stl`, textures that could not be found, shading
that was not physically based and was approximated.

**Model or animation?** The folder the file is dropped in decides first — Models or Animations —
then the content corrects what is impossible: a file with no clip at all is not an animation, a
file with no mesh at all is not a model. A Mixamo `.fbx`, which carries a character and its walk,
stays the animation it was filed as. A `.bvh` is always an animation. Files already in a project
before this rule are left untouched.

> A separate `.gltf` that is not an IA Studio document is not imported as a model yet.

### Audio, video and image media are not copied — on import

**Important.** For audio, video and images, the **Import media** picker does not copy your file into
the project: it creates a **link** to where it sits. 3D files are the exception: they are copied
and then converted as described above.

Two consequences:

- **Upside** — a 12 GB video rush is not duplicated. Your project stays light.
- **Downside** — if you move, rename or delete the original file, the link breaks **silently**:
  nothing reports it until you click **Show in folder**, and it is that click, finding
  nothing, that brings "File not found" up in the inspector.

If you have to take a project elsewhere, take the media it points at too — or copy them into the
project folder yourself before importing them.

**But EDITING one brings it into the project.** A linked medium you retouch and then save — `⌘S`
on an image, **Apply** on a sound take — is written into the project folder, and it is that copy
the studio shows everywhere afterwards: the Explorer, the scene, the inspector. The link is replaced
by a real file, and **Show in folder** now leads there.

**The file you pointed at is not touched.** It stays where it is, in the state you left it in:
writing into a folder you merely showed the studio is a different act from editing an asset. If
you meant to change the original, do it in the tool that made it.

### What happens during an import

A banner appears at the top of the **Explorer** and follows each file, step by step:

| Step | What is happening | Why |
|---|---|---|
| **Queued…** | the file is waiting its turn | |
| **Probing…** | the studio reads what the file actually is | duration, codec, dimensions, frame rate |
| **Hashing…** | it computes a signature of the content | to spot duplicates |
| **Proxy…** | it makes a lightweight copy of the video | to scrub through it smoothly |
| **Waveform…** | it draws the sound's waveform | to see it on the audio track |
| **Ready** | done | |

**Every step is interruptible.** The **Stop preparation** button halts it: you do not have to wait
for the proxy of a twenty-minute rush before starting work. The file stays imported, simply without
its proxy.

Two particular messages:

| Message | What it means |
|---|---|
| **Already in the project** | this exact file is already there — the fingerprint saw it |
| **Unreadable file** | the file is corrupt, or in a format the studio cannot decode |

### If video preparation is unavailable

The proxy and the waveform are made by **ffmpeg**, a video-processing utility.

**The studio ships its own**, on macOS, Windows and Linux. There is nothing to install: that is a
deliberate decision, because an import that needs a proxy is not the moment to teach someone what a
codec is.

The studio tries three candidates, in this order:

1. the binary **shipped with the application**;
2. the path you set in **Settings ▸ Media ▸ Path to ffmpeg**;
3. whatever is on your system's `PATH`.

It keeps the **first that exists**, and stops there: it does not walk back down the list. The
binary it keeps is launched afterwards, but to say whether video preparation is available — not
to choose.

**Two consequences, and the second one surprises.** The settings path only ever matters when the
shipped binary is **absent** — which happens when you run the studio from its source code without
having run `pnpm ffmpeg:fetch`. And if the chosen binary is present but does not run, pointing at
another path in the settings **will not rescue it**: the studio reports the feature unavailable,
and that binary is the one to repair or replace. See
[When something goes wrong](16-troubleshooting.md#the-puzzling-case-ffmpeg-is-there-and-the-studio-says-it-is-not).

When the chosen candidate does not run — or when there is none — an **amber warning triangle**
appears on the **Explorer's** title bar, left of the three view buttons. Hover it, or reach it
with the keyboard, and it says: "Video preparation unavailable: no lighter copy, no waveform."
`Esc` closes the tooltip.

**The import still works.** You only lose comfort: scrubbing through videos will be less smooth,
and audio tracks will not show their drawing.

**This case has become rare.** It now concerns mostly whoever ran the studio from its source code
without having run `pnpm ffmpeg:fetch`.

---

## Where your files really are

**Wherever you put them.** A generated asset lands in one of the seven starter folders — see
[What you find there](#what-you-find-there) — and nothing holds it there: move it, file it in a
tree of your own, the Explorer keeps showing it and its entry follows. The layout of the project
folder is described in [Projects](04-projects.md#what-is-inside).

These are **real files, in real formats**. You can open them with any other software, copy them,
send them.

**Except imported media**, which stay where they were — that is the whole point of the link. Until
you edit them: the saved version is written into the project.

---

[← Generating](06-generating.md) · [Contents](../user-guide.md) · [Next chapter: Image workspace →](08-image-workspace.md)
