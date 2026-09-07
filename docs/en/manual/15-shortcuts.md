# 15. Every shortcut

[← Every setting](14-settings.md) · [Contents](../user-guide.md) · [Next chapter: When something goes wrong →](16-troubleshooting.md)

The complete list of keys, by context, and how to change them.

---

## Reading a shortcut

Keys are written with symbols, the same ones throughout the studio.

| Symbol | Key | Where |
|---|---|---|
| `⌘` | Command | macOS. It is `Ctrl` on Windows and Linux |
| `⇧` | Shift | everywhere |
| `⌥` | Option / Alt | everywhere |
| `⌃` | Control | macOS |

So `⌘Z` reads "Command + Z" on a Mac, and "Ctrl + Z" elsewhere. The symbols are written together:
`⇧⌘Z` means all three keys at once.

> **On Windows and Linux, `⌘` reads as `Ctrl` everywhere**, including the shortcuts a surface
> listens for itself. What is left to fix is the display: the tooltip and the shortcuts screen
> draw the Mac symbol instead of writing `Ctrl` — see
> [What does not exist yet](18-limits.md).
>
> **Three shortcuts differ, because the desktop itself decides otherwise**:

| Action | macOS | Windows and Linux |
|---|---|---|
| **Full screen** | `⌃⌘F` | `F11` |
| **Move workspace left** | `⌥⌘←` | `Ctrl+PageUp` |
| **Move workspace right** | `⌥⌘→` | `Ctrl+PageDown` |

---

## One idea to grasp: the printed letter

**A shortcut is named by the character written on the key, never by where it sits.** `⌘Z` is the
key marked `Z`, wherever that is on your keyboard: middle-left on AZERTY, bottom-left on QWERTY.
You press what you read.

That is the rule every other application follows, and it holds for what the system keeps to
itself too: `⌘Q` quits the studio, `⌘M` minimises the window. No command here can
take those keys.

> **A key printing nothing the studio can read keeps its position.** That is the case for the
> brackets `[` and `]`, which a French keyboard only reaches through `⌥`: you then press in the
> same place as an American keyboard, whatever symbol is engraved. Flying in the scene follows
> the same logic, for a different reason — see below.

---

## One idea to grasp: context

**The same shortcut does not do the same thing everywhere.**

`S` splits a clip in the edit, and scales an object in the 3D view. `Delete` removes a clip here, an
object there. This is not a collision: it is **by design**.

The studio files each action under a **context** — the surface where it makes sense. Only one
surface listens at a time, the one you are looking at. A key shared between two contexts can
therefore never be ambiguous.

Nine contexts:

| Context | Where it applies |
|---|---|
| **Anywhere in the application** | any window, any workspace |
| **In the bar of spaces** | the top bar, while the focus is on one of its tabs |
| **In the explorer** | the project folder panel, in every workspace and on the home |
| **In the 3D view** | the viewport of the Modelling workspace |
| **In the edit** | the timeline of the Video and Audio workspaces |
| **In the image** | the canvas of the Image workspace |
| **In the sky** | the view of the Skyboxes workspace |
| **In the take editor** | the waveform of the Audio workspace |
| **In the material** | the preview and channels of the Materials workspace |

**A surface can listen to a key without being a context, and the guarantee above does not cover it
then.** The Modelling workspace's animation band is that case, and it listens to **four** keys:
`Delete` and `Backspace` take off whatever is chosen — the key, or the animation block — `⌘D`
duplicates the chosen block end to end, and `S` cuts it at the playhead. All four are bound to the
band rather than to the register of contexts: they do not appear on the shortcuts screen, and
cannot be changed. Right-clicking a block carries the three gestures that concern it — see [the
Modelling workspace](09-modelling-workspace.md).

One context is special: **Anywhere in the application**. Its keys go through the operating system's
menu, which catches them before anybody else. They are therefore the only ones that can never be
"covered" by another context — and the only ones whose conflict is always a real conflict.

**One exception, and only one: `⌥D`, dictation.** It is **held** rather than tapped, and a system
menu has nothing to report a release with — so the window hears it, and it has no menu row. That
is also what lets it write into a text field, see below.

---

## Anywhere in the application

| Action | Key | What it does |
|---|---|---|
| **New…** | `⌘N` | opens the window that makes a project or a document, from any screen |
| **New project** | `⌥⌘N` | creates an empty project and opens it, without going through the window |
| **Open project** | `⌘O` | opens an existing project in place of the current one |
| **Save document** | `⌘S` | writes the document in front into the project — **and rewrites the asset it came from**, in the Image workspace |
| **Save as** | `⇧⌘S` | writes a copy of the asset beside the original and carries on with it, asking for no name |
| **Settings** | `⌘,` | opens the settings window |
| **Assistant** | `⌘K` | opens the window where you say what you want to do, by voice or by keyboard |
| **Dictate** | `⌥D` | listens to the microphone and writes what you say at the caret |
| **Full screen** | `⌃⌘F` (`F11` off macOS) | makes the window take the whole screen |
| **Reset layout** | *none* | puts the panels back where they started |

**Reset layout** deliberately has **no** default key: it is an action you reach for once every six
months, and giving it a shortcut would mean occupying a key for nothing. It is in the **View** menu,
and you can assign one to it (see below).

**Dictate is the only shortcut that works while you are typing into a field** — every other one
stays quiet in that case. See [Generating](06-generating.md#speaking-instead-of-typing).

It is **held** rather than tapped: press, speak, let go. It can be set to toggle instead, in the
[settings](14-settings.md#how-it-is-triggered).

> **The open project saves as it goes.** `⌘S` concerns only the **document** in front — a 3D scene,
> for instance — not the project itself. The tab carries a dot (`•`) as long as what is on screen is
> not what is on disk.

### Walking a list with the keyboard

Every list in the studio is crossed the same way: the Explorer, the Library, the layers, the models,
the scene tree.

| Key | Effect |
|---|---|
| `Tab` | steps into the list, or out of it |
| `←` `→` | the previous cell, the next one |
| `↑` `↓` | the same column, one row up or down |
| `Enter` | opens |
| `Space` | picks |

**A row that only opens leaves `Space` to scrolling.** That is the Explorer's case: opening a
document may take you to another workspace, and `Space` promises that nowhere else in the studio.

`Tab` brings you back where you were: a list keeps a single way in — your selection if there is
one, the first visible cell otherwise.

**In the Explorer, the selection can also be plural** — `⌘` picks, `Shift` extends. See
[Picking several assets](07-assets.md#picking-several-assets).

### Walking a menu with the keyboard

Menus are crossed like lists, with one difference: **they take the focus as they open**, on their
first row. There is nothing to do to step in.

| Key | Effect |
|---|---|
| `↑` `↓` | the previous row, the next one — wrapping at both ends |
| `Home` `End` | the first row, the last |
| `Enter` | chooses the row |
| `Escape` | closes, and hands focus back where it was |
| `Tab` | closes too — a menu is not somewhere you tab through |

**To open a tool group's menu: `⌥↓`.** Most menus open on a click, and so on `Enter`. A group
**with a tool armed** is the exception: there the click picks the tool, and the menu only opened
under the pointer. `⌥↓` is the keyboard's way in; `Enter` goes on arming the tool, exactly as the
click does.

A group that arms nothing — 3D's **Add**, which is only a list of actions — opens on a click like
any other menu: there is no tool to pick in its place.

Like the walking keys above, `⌥↓` belongs to the button rather than the registry: it cannot be
changed.

**Greyed rows are stepped over.** A row the mouse cannot choose cannot be taken from the keyboard
either, and stopping on one would make the walk look stuck.

**A ticked row says what its tick means.** Some are alternatives — a tool's mode, the active
account, the view of one quarter of the Modelling workspace: ticking one unticks the rest. Others answer for themselves,
like a layer's two padlocks. A screen reader announces the first kind as radio buttons and the
second as checkboxes.

### Arranging the workspace bar

| Key | Effect |
|---|---|
| `⌥⌘←` / `Ctrl+PageUp` | moves the focused workspace one place left |
| `⌥⌘→` / `Ctrl+PageDown` | moves the focused workspace one place right |

**Not the bare arrows**: those belong to whoever walks the bar, and taking them would
trade one gesture for another. These are the keys Safari, Chrome and VSCode give the same gesture,
each on its own system. Dragging and right-clicking do the same thing — see
[The title bar](03-the-window.md#arranging-the-workspaces-in-the-order-that-suits-you).

Both keys can be changed like any other, under the **In the bar of spaces** context of the
shortcuts screen.

---

## In the explorer

The one context that is not a workspace: it is the project folder panel, and it listens wherever
that panel is open — in all six workspaces as on the home. The shortcuts screen names it exactly
as this heading does.

**It only listens while the focus is inside it.** Click a row, or `Tab` into it: while you are
elsewhere, these keys belong to the open document. That is what lets `⌘Z`, `⌘C` and `⌘V` exist
here without ever treading on the canvas's own.

| Action | Key | What it does |
|---|---|---|
| **New folder** | `⇧⌘N` | creates an empty folder inside the one on screen, and opens its name for typing |
| **Duplicate** | `⌘D` | lays a copy of each chosen item beside the original, under the first free name |
| **Cut** | `⌘X` | holds the selection, to be moved on the next paste |
| **Copy** | `⌘C` | holds the selection, to be copied on the next paste |
| **Paste** | `⌘V` | drops what the clipboard holds into the folder on screen |
| **Move to trash** | `⌘⌫` | sends the selection to the system trash |
| **Undo the last file gesture** | `⌘Z` | puts the last batch moved, renamed, duplicated or created back where it was |
| **Redo the file gesture** | `⇧⌘Z` | redoes the batch just undone, exactly as it was |

**Cut moves nothing**: the rows being held are drawn dimmed, and nothing shifts until you paste.
**A folder is duplicated with everything inside it.**

**A paste refuses one by one, not in bulk.** If a name is already taken in the destination, that
item is the one refused; the rest go through.

**`⌘⌫` rather than `⌫` alone**, and it is deliberate: this is the one gesture of this context the
studio cannot undo, and a bare delete key is too close to what a hand does while reading a list.

> **Four menu gestures are not in this table**, and they are not on the shortcuts screen either.
> **Open** answers to `Enter`, but it is the tree that listens for that key, not the registry: it
> cannot be changed. **Show in folder**, **File information** and **Rename** answer to no key at
> all — they live in the right-click menu, and nowhere else. See
> [Projects](04-projects.md#right-clicking-twelve-gestures-in-four-groups).

---

## In the 3D view

### The tools

| Action | Key | What it does |
|---|---|---|
| **Select** | `V` | the basic tool: click an object to choose it, without doing anything to it |
| **Move** | `G` | drag the coloured arrows to slide it |
| **Rotate** | `R` | drag the coloured circles to turn it |
| **Scale** | `S` | drag the handles. `⇧` keeps its proportions |
| **All snaps** | `M` | turns all four snaps on or off at once — surface, grid, angle, scale. The bar at the top of the viewport sets them one by one |
| **Local frame** | `L` | aligns the handles with the object's orientation rather than the world's |
| **Projection** | `O` | switches between perspective and orthographic projection |
| **Display mode** | `Z` | cycles the nine ways of drawing |
| **Four views** | `⇧Q` | splits the viewport in four: the current view, top, front, side |
| **Quad edges** | `⇧W` | in wireframe, erases the diagonals triangulation added |
| **Show skeletons** | `B` | draws the bones of every rigged model over the scene |
| **Pose mode** | `P` | clicking then picks the **bones** of a rig instead of objects |
| **Frame selection** | `F` | brings the camera in so the object fills the view |
| **Delete** | `Delete` | removes the chosen object. `⌘Z` brings it back |

### Assemble and duplicate

| Action | Key | What it does |
|---|---|---|
| **Group** | `⌘G` | files the selected objects under one group |
| **Duplicate** | `⌘D` | puts a copy of the selection at the same place, and selects it |
| **Copy** | `⌘C` | holds the selection, without touching the scene |
| **Cut** | `⌘X` | holds it and takes it out of the scene |
| **Paste** | `⌘V` | puts what was held into the current scene |

> This clipboard is the studio's: it does not touch the system one, and `⌘C` stands aside as soon
> as text is selected on screen.

### Undo and redo

| Action | Key |
|---|---|
| **Undo** | `⌘Z` |
| **Redo** | `⇧⌘Z` |

### Flying through the scene

These keys are **held** rather than pressed: while you hold, the camera moves.

| Direction | Key (QWERTY keyboard) | Key (AZERTY keyboard) | Arrow |
|---|---|---|---|
| **Forward** | `W` | `Z` | `↑` |
| **Back** | `S` | `S` | `↓` |
| **Left** | `A` | `Q` | `←` |
| **Right** | `D` | `D` | `→` |
| **Up** | `E` | `E` | — |
| **Down** | `Q` | `A` | — |
| **Boost** | left `⇧` | left `⇧` | — |

The arrows do exactly what the four letters do: they are added, they replace nothing. Altitude has
none, the four being already taken by movement along the ground.

> **Why two columns.** The studio listens to the **position** of the key on the keyboard, not the
> letter printed on it. The four direction keys are therefore always the same square, top left:
> `WASD` if your keyboard is American, `ZQSD` if it is French. There is nothing to set.
>
> **One exception: the keypad's Enter.** It is a position of its own, distinct from the main
> Enter, but the studio reads it as that one. Both keys therefore do the same thing, and
> remapping either moves both — you cannot tell them apart. The rest of the keypad keeps its own
> positions: with Num Lock on or off those keys mean different things, and the studio cannot
> guess which one you meant.

Speed and boost are set in [settings](14-settings.md#workspaces).

> **`S` carries two meanings, and the mouse button settles which.** No button down, `S` picks the
> **Scale** tool; a button held in the view — left or right — it moves the camera back and leaves
> the tool alone. The arrows work the same way: during a flight they drive the camera, and the
> list that had the focus never sees them.

### What the mouse does, with no shortcut

| Gesture | Effect |
|---|---|
| **Left click** | chooses the object under the cursor — or the nearest **bone**, in pose mode (`P`) |
| **Right click held + move** | turns your head, on the spot |
| **A button held + keyboard** | moves the camera — see [the Modelling workspace](09-modelling-workspace.md) |
| **Wheel** | moves forward or back |
| **Click a handle + drag** | applies the current tool |

---

## In the edit

### Playback

| Action | Key | What it does |
|---|---|---|
| **Play / Pause** | `Space` | starts playback, or stops it where it is |
| **Go to start** | `Home` | brings the playhead to the very beginning |
| **Go to end** | `End` | sends the playhead past the last clip |

> **`Space` does not repeat.** A held key repeats thirty times a second; playback starting and
> stopping thirty times a second is a strobe, not a shortcut. The studio ignores repeats.

### Editing

| Action | Key | What it does |
|---|---|---|
| **Split clip** | `S` | cuts in two at the playhead |
| **Return window** | `F` | opens the edit in a window of its own, to put on a second screen |
| **Delete clip** | `Delete` | removes the clip from the edit. The original file stays in the assets |

**`F` serves twice, and clashes with nothing.** It **frames the selection** in the 3D view. Both
belong to different contexts, which are never listening at the same time.

### Zoom

| Action | Key | What it does |
|---|---|---|
| **Zoom in** | `⌘=` | spreads the edit out to see the detail |
| **Zoom out** | `⌘−` | tightens it to see more at once |
| **Fit to view** | `⇧Z` | fits the whole edit on screen |

### Undo and redo

| Action | Key |
|---|---|
| **Undo** | `⌘Z` |
| **Redo** | `⇧⌘Z` |

---

## In the image

### Arming a tool

Every tool in the bar is a command: its key arms it, and remaps like the rest.

| Key | Tool | | Key | Tool |
|---|---|---|---|---|
| `V` | Move | | `U` | Rectangle |
| `H` | Hand | | `⇧U` | Line |
| `C` | Crop | | `A` | Arrow |
| `M` | Rectangular selection | | `O` | Ellipse |
| `L` | Lasso | | `B` | Brush |
| `T` | Text | | `⇧B` | Pencil |
| `G` | Paint bucket | | `E` | Eraser |
|  |  | | `I` | Eyedropper |

**Three tools have no default key** — elliptical selection, polygon and star — and you can give
them one in the settings. **Image…**, in the Shapes group, has none either, but for another
reason: it is not a command, so it does not appear in the list to remap.

> **Five tools carry the key they carry elsewhere.** Brush is on `B` and Pencil on `⇧B` as in
> every image editor, Crop on `C`, the shapes on `U` and `⇧U`. `R`, `F` and `P` are free in the
> image, and keep their meaning in the other workspaces.

### The size of the stroke

| Action | Key | What it does |
|---|---|---|
| **Smaller brush** | `[` | narrows the diameter by one notch |
| **Larger brush** | `]` | widens it by one notch |

One diameter for three tools: the brush, the eraser and the shape stroke. The notch is a ratio,
about ×1.4, never a fixed count of pixels.

> **These two keys are found by position, not by symbol.** On a French keyboard the same two
> places carry `)` and `^` — you press where an American keyboard would, whatever letter is
> printed on the key.

### Cropping

These two keys act **only** while a crop frame is placed on the picture, and only in the tab in
front. Everywhere else they keep their usual meaning.

| Action | Key | What it does |
|---|---|---|
| **Apply the crop** | `⏎` | trims the document to the frame. `⌘Z` gives the frame back, not the pixels |
| **Abandon the crop** | `⎋` | takes the frame away without trimming anything |

### Zoom and framing

| Action | Key | What it does |
|---|---|---|
| **Zoom in** | `⌘=` | enlarges the view one step, around the centre |
| **Zoom out** | `⌘−` | reduces the view one step |
| **Fit to window** | `⌘0` | frames the whole image, with a margin, never enlarging it |
| **Actual size** | `⌘1` | one image pixel to one screen pixel |

> **`⌘1` is the only scale where you judge sharpness.** At any other zoom, what you see is a
> calculation, not the image.

### Guides

| Action | Key | What it does |
|---|---|---|
| **Rulers** | `⌘R` | shows or hides the two graduated strips |
| **Guides** | `⌘;` | shows or hides the guides placed on the image |
| **Snap** | `⇧⌘;` | makes what you drag stick to guides, edges and centre |
| **Clear guides** | *none* | removes every guide. Undoable |

**Hiding guides does not erase them**: those are two different actions, and that is why the second
has no shortcut — you do not want to reach it by accident.

### Selection

| Action | Key | What it does |
|---|---|---|
| **Deselect** | `⌘D` | drops the selected region: the brush reaches the whole layer again |
| **Make a mask of the selection** | *none* | hides the armed layer outside the selected region |

### Asking the model

Five commands that send the image to the service. None has a default key: they cost credit, and a
key pressed by mistake has no business spending any.

| Action | What it does |
|---|---|
| **Regenerate the region** | has the masked region of the armed layer repainted |
| **Extend** | has the model paint beyond the edges of the image |
| **Cut out** | removes the background of the flattened image |
| **Upscale** | raises the definition of the flattened image |
| **Vectorise** | turns the flattened image into paths |

**None of them leaves on its own.** Each flattens the document, sends it, then **fills in the
Generation panel's form** and shows it to you. You are the one who presses Generate, having seen
what is going and with which settings.

**They have two doors, and neither is the keyboard**: the last five entries of the **Image** menu,
and the **Model edits** group in the toolbar — the same action on both sides. Cut out, Upscale and
Vectorise each ask for a model of a family that has no workspace of its own; it is set in
**Settings ▸ AI models**. Until one is set, the edit request does not leave and opens the screen
where you choose it.

### Exporting

| Action | Key | What it does |
|---|---|---|
| **Export the image** | `⇧⌘E` | writes the flattened document to disk, as a PNG |
| **Merge down** | `⌘E` | joins the active layer and the one just below it, at the same level |

The five other **Image** menu entries — Flatten, both mirrors, both rotations — ship with no key.
You can give them one in [settings](14-settings.md).

### Undo and redo

| Action | Key |
|---|---|
| **Undo** | `⌘Z` |
| **Redo** | `⇧⌘Z` |

---

## In the sky

The Skyboxes workspace answers the keyboard like the others.

| Action | Key | What it does |
|---|---|---|
| **Change the view** | `V` | cycles through the four ways of looking at the sky: immersive, panoramic, cross, faces |
| **Light probes** | `P` | shows or hides the witness spheres |
| **Undo** | `⌘Z` | |
| **Redo** | `⇧⌘Z` | |

> **The probes are not a gadget.** A sky is judged by what it lights, not by its own picture: the
> witness spheres show what your panorama does to a matte surface and to a mirror one.

> **`V` cycles through all four views, and all four draw.** The three flat ones — Equirect, Cross
> and 6 faces — turn the backdrop and the test objects off while they are in front, and the field
> of view only affects the immersive one. See [The Skyboxes workspace](13-skyboxes-workspace.md).

---

## In the take editor

The seventh context: the audio editor listens for undo, and for the space bar.

| Action | Key | What it does |
|---|---|---|
| **Undo** | `⌘Z` | drops the last step off the chain — a fade, a normalise, a crop |
| **Redo** | `⇧⌘Z` | |
| **Play / Pause** | `Space` | the bottom monitor, the one carrying the chain — see [The Audio workspace](11-audio-workspace.md) |

> **Nothing is written until you apply.** Every tool appends a step to a chain replayed over the
> decoded take, which is what makes undo free and A/B instant. See
> [The Audio workspace](11-audio-workspace.md).

The tools themselves — the fades, the normalise, the silence trim — have no key yet: they are
taken from the bar, under the waveform.

---

## In the material

The last context on the list, and the shortest: the Materials workspace listens for undo alone.

| Action | Key | What it does |
|---|---|---|
| **Undo** | `⌘Z` | takes back the last channel edit, or the last style applied |
| **Redo** | `⇧⌘Z` | |

> **An applied style is one undo.** `⌘Z` puts back exactly what was set before, in one go — see
> [The Materials workspace](12-materials-workspace.md).

---

## One important thing about ⌘Z

**Each document has its own undo stack.**

`⌘Z` undoes the last action **of the current tab**, not the last action you took in the studio. If
you retouch an image, move to a 3D scene, then press `⌘Z`, it is the scene that steps back — the
image has not moved.

> **"⌘Z seems to do nothing."** It is almost always this: the action you have in mind belongs to
> another tab. Activate the tab, then undo.

**And one stack belongs to no document: the files'.** Moving, renaming, duplicating, creating a
folder touches no tab — those gestures belong to the project, and so does their stack. It
therefore outlives closing a document, and it is the same one in every window.

`⌘Z` picks between the two by the focus, and by nothing else: **inside the Explorer it steps back
one file gesture; anywhere else it steps back one notch in the document in front of you.** The
trash gesture enters neither.

**While you are typing, `⌘Z` undoes your text.** Rename a layer or a track, make a typo, press
`⌘Z`: the word you have just typed steps back, not the last brush stroke. The studio stands aside
as long as the caret is in a text field, and takes over again the moment you leave it.

The same holds for `⌘X`, `⌘C` and `⌘V`: in a field they work on the text; anywhere else, on what
the workspace has selected.

**One shortcut crosses a text field**: a command has to declare it to be heard there, and **`⌥D`,
dictation, is the only one that does** — it exists precisely to write into the field you are
already in. That is also why it carries a modifier: without one, it would swallow a letter.

---

## Changing a shortcut

Settings (`⌘,`) → **Shortcuts**.

Each action is a row: its name, a sentence explaining what it does, and a button carrying its
current key.

**To change it:**

1. **click the key button**. It turns blue and reads "Press…";
2. **press the combination** you want. It is recorded immediately.

Nothing to type, nothing to spell. That is deliberate: nobody knows what `⌘[` is called, and
everybody knows how to press it.

| Situation | What happens |
|---|---|
| You press `Esc` | the capture stops, the key does not change |
| You press a modifier alone (`⇧`, `⌘`…) | nothing: a modifier on its own is not a shortcut, it is what you hold while pressing one |
| The action has no key | the button reads "None" |

**To go back to the original key**: the small circular arrow to the right of the button. It is off
until you change something.

> **A changed shortcut is not saved right away.** Like every setting, it waits for **Apply** or
> **OK**. **Cancel** returns it to what it was.

### Conflicts

If two actions in the **same context** — or one action and one from the **Anywhere in the
application** context — end up on the same key, both rows turn red, with a warning triangle and the
message:

> *Two actions are fighting over this key: only one will answer.*

The studio **does not stop you** from doing it. It shows you, and you either leave it or fix it.

**Two different contexts sharing a key are not in conflict** and never show red: `S` in the edit and
`S` in the 3D view is the intended behaviour, not a mistake.

### Finding what a key does

At the top of the shortcuts screen, a **Find by key** button.

Click it, press the combination that puzzles you, and the list keeps only the actions that answer to
it. If none appear, the studio says so:

> *No action uses this key: it is free.*

That is the question people actually ask — "what does `⌘K` do again?" — rather than the reverse. The
**Show all** button restores the full list.

### What cannot be changed yet

**The flying keys** (`W A S D Q E` and boost) are not on this screen. They are fixed for now. See
[What does not exist yet](18-limits.md).

**The animation band's four keys** are not either — `Delete`, `Backspace`, `⌘D` and `S` — for the
reason given above: they are bound to the band, not to a context.

---

## Crib sheet, all on one page

The columns are the workspaces. **The Explorer has its own table, below**: it is the one context
that is not a workspace — it is open in all of them at once — and one more column would suggest
`⌘D` or `⌘Z` do there what they do in the workspace of the column next to it.

| Key | Anywhere | Bar | 3D view | Edit | Image | Sky | Audio | Material |
|---|---|---|---|---|---|---|---|---|
| `⌘N` | New… |  |  |  |  |  |  |  |
| `⌥⌘N` | New project |  |  |  |  |  |  |  |
| `⌘O` | Open project |  |  |  |  |  |  |  |
| `⌘S` | Save |  |  |  |  |  |  |  |
| `⇧⌘S` | Save as |  |  |  |  |  |  |  |
| `⌘,` | Settings |  |  |  |  |  |  |  |
| `⌘K` | Assistant |  |  |  |  |  |  |  |
| `⌥D` | Dictate |  |  |  |  |  |  |  |
| `⌃⌘F` / `F11` | Full screen |  |  |  |  |  |  |  |
| `⌘Z` |  |  | Undo | Undo | Undo | Undo | Undo | Undo |
| `⇧⌘Z` |  |  | Redo | Redo | Redo | Redo | Redo | Redo |
| `⌘G` |  |  | Group |  |  |  |  |  |
| `⌘D` |  |  | Duplicate |  | Deselect |  |  |  |
| `⌘C` / `⌘X` / `⌘V` |  |  | Copy / Cut / Paste |  |  |  |  |  |
| `O` |  |  | Projection |  | Ellipse shape |  |  |  |
| `Z` |  |  | Display mode |  |  |  |  |  |
| `B` |  |  | Show skeletons |  | Brush tool |  |  |  |
| `V` |  |  | Select |  | Move tool | Change the view |  |  |
| `P` |  |  | Pose mode |  |  | Light probes |  |  |
| `G` |  |  | Move |  | Paint bucket tool |  |  |  |
| `R` |  |  | Rotate |  |  |  |  |  |
| `S` |  |  | Scale *(and back up)* | Split clip |  |  |  |  |
| `M` |  |  | All snaps |  | Rectangular selection |  |  |  |
| `L` |  |  | Local frame |  | Lasso |  |  |  |
| `F` |  |  | Frame selection | Return window |  |  |  |  |
| `H` |  |  |  |  | Hand tool |  |  |  |
| `C` |  |  |  |  | Crop tool |  |  |  |
| `U` |  |  |  |  | Rectangle shape |  |  |  |
| `A` |  |  |  |  | Arrow shape |  |  |  |
| `T` |  |  |  |  | Text tool |  |  |  |
| `I` |  |  |  |  | Eyedropper tool |  |  |  |
| `E` |  |  |  |  | Eraser tool |  |  |  |
| `⇧Q` |  |  | Four views |  |  |  |  |  |
| `⇧W` |  |  | Quad edges |  |  |  |  |  |
| `⇧U` |  |  |  |  | Line shape |  |  |  |
| `⇧B` |  |  |  |  | Pencil tool |  |  |  |
| `[` / `]` |  |  |  |  | Smaller / Larger brush |  |  |  |
| `Delete` |  |  | Delete object | Delete clip |  |  |  |  |
| `W A S D` |  |  | Fly |  |  |  |  |  |
| `Q` / `E` |  |  | Down / Up |  |  |  |  |  |
| left `⇧` |  |  | Boost |  |  |  |  |  |
| `Space` |  |  |  | Play / Pause |  |  |  |  |
| `Home` / `End` |  |  |  | Start / End of edit |  |  |  |  |
| `⌘=` |  |  |  | Zoom in | Zoom in |  |  |  |
| `⌘−` |  |  |  | Zoom out | Zoom out |  |  |  |
| `⇧Z` |  |  |  | Fit to view |  |  |  |  |
| `⌘L` |  |  |  | Unlink picture and sound |  |  |  |  |
| `⌘0` |  |  |  |  | Fit to window |  |  |  |
| `⌘1` |  |  |  |  | Actual size |  |  |  |
| `⌘E` |  |  |  |  | Merge down |  |  |  |
| `⌘R` |  |  |  |  | Rulers |  |  |  |
| `⌘;` |  |  |  |  | Guides |  |  |  |
| `⇧⌘;` |  |  |  |  | Snap |  |  |  |
| `⇧⌘E` |  |  |  |  | Export the image |  |  |  |
| `Enter` |  |  |  |  | Apply the crop |  |  |  |
| `Esc` |  |  |  |  | Abandon the crop |  |  |  |
| `⌥⌘←` |  | Move left |  |  |  |  |  |  |
| `⌥⌘→` |  | Move right |  |  |  |  |  |  |

**In the explorer** — while the focus is in the panel, and only then:

| Key | What it does |
|---|---|
| `⇧⌘N` | New folder |
| `⌘D` | Duplicate |
| `⌘X` / `⌘C` / `⌘V` | Cut / Copy / Paste |
| `⌘⌫` | Move to trash |
| `⌘Z` / `⇧⌘Z` | Undo / Redo the file gesture |

---

[← Every setting](14-settings.md) · [Contents](../user-guide.md) · [Next chapter: When something goes wrong →](16-troubleshooting.md)
