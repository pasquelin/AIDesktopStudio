# 3. The window, explained

[← First steps](02-first-steps.md) · [Contents](../user-guide.md) · [Next chapter: Projects →](04-projects.md)

The studio's window looks like an editing suite, not a web page. This chapter takes it apart,
piece by piece.

---

## The home screen, before anything else

The studio opens on the home — a screen saying where you were, what the studio knows how to
start, and what everyone else has published. It closes as soon as you step into a workspace.

**It has the same frame as a workspace**: both rails, both columns of panels, the status line at
the bottom. What differs is the centre — a page you scroll, instead of tabs. **It has no tabs**,
because it opens no document of its own: it leads to the other workspaces'.

### The banner, at the top

It shows one thing at a time:

| What it shows | When |
|---|---|
| **Pick up where you left off** | a document was open last time |
| **_n_ generations running** | something is still working |
| **Connect an API key** | no key is stored |
| **Ready when you are** | none of the cases above |

While the studio reads your projects, it stays silent rather than announcing "Ready when you are"
and then correcting itself.

### The four bands

The centre stacks four bands, in this order:

| Band | What it shows | It needs |
|---|---|---|
| **Where you left off** | the banner: resume, connect, or create | nothing |
| **Tools** | what the studio knows how to start, and the way to create or open a project | nothing |
| **Your models** | what this studio can run, and with what | nothing |
| **What is moving** | the models trending outside, and the articles beside them | the setting, ticked by default |

**None of the four needs an API key any more.** The rule has not changed — a band that lacks what
it needs is not greyed out, it is not there — but it has no case left: the feed of what everyone
was publishing held the third place until now, and an API key was needed to draw a single tile.

**Tools** lists the workspaces in the same order as the workspace bar, with **New project**,
**Open project** and **Settings** beside them. It is the band that still says something on a
machine with no key, no project and no history.

Everything else on the home is a panel, held in its two columns.

### Your models, what the studio can run

It answers the question everybody has on the second launch: **what is installed, what is running,
and what is missing.** It reads top down, from the verdict to the detail.

**At the head, where you stand**: "5 operations of 23 have a model", a bar, then one or two lines of
advice. The advice is ranked by what it COSTS rather than by what it unlocks — choosing among what
is already on the disk costs nothing, installing costs gigabytes, a key costs money. So you are
never offered a way to spend before being told you already hold the answer.

**Then two columns**, side by side when the centre is wide enough and stacked when it is not. The
CENTRE decides, not the window: opening a panel on the left narrows the band, and it falls back to
one column.

**On the left, what you have to work with** — one source per line. The name and its button share
the first line, the reading sits under both: what acts on a source is beside it, not at the other
end of the screen.

| Line | What it says | The button |
|---|---|---|
| **On this computer** | how many models are installed, what they weigh, how many are held in memory | **Manage** |
| **Ollama** | whether it is there, whether it answers, and the models it listed | **Install** or **Choose** |
| **Online** | the accounts a key has been entered for, one by one | **Add a key** or **Manage keys** |
| **Machine** | memory, chip, video memory, disk — one short line per figure, each naming its subject | none: it reports, and nothing here acts on it |

**Neither column is stretched to the other**: a card pulled to its neighbour's height reads as a
card with something missing.

**On the right, your workspaces** — one line per family, a gauge in dots, and the served fraction.
A workspace with a single operation names what serves it outright. A rule closes the list before
the Assistant and Dictation: they belong to no workspace.

**"Operation" is the generation panel's own word**, not one more: it is what that panel already
calls an Operation — Text to image, Inpaint, Rigging. A family holds several, and one model can
serve several at once.

**Under them, what one download covers.** This is the reading the manager cannot give at a glance:
the catalogue holds twenty-five models for nineteen operations, and what separates them is not
the quality. An image model that also does materials answers six operations for four gigabytes
where another answers one for a hundred and thirty-three. The families it spans are named, not
counted. What the machine cannot hold stays on screen, marked **beyond this machine** — hiding it
would make the catalogue look smaller than it is.

**Nothing is installed from this band**: every button opens the settings section where the gesture
lives — see [Models](05-models.md).

**It speaks on a bare machine**, which is half its point: with no key and no model, it says so,
with the way to fix it.

### What is moving, outside the studio

What other people publish — **the models trending** on Hugging Face, and **the articles** posted
there. The chips above the band filter: Image, Video, 3D, Audio, or Articles. One category shows
at a time, and that is one request.

**No Material or Sky chip**, and that is not an oversight: nothing publishes either as a category
of its own — the studio serves both with image models — so a chip for one would repeat the Image
list under another name.

**Eight rows, and nothing older than a month.** The article feed carries five hundred; a home
band is not a feed reader. Past a month it is not news, it is history.

**A click opens the page in your browser.** Nothing is downloaded, nothing is installed: these are
somebody else's models and somebody else's articles.

> **This is the studio's only outward call for something other than a model or a generation.** It
> goes to `huggingface.co`, the host every weight of the catalogue already comes from, so nobody
> learns anything new. **Settings ▸ General ▸ Model news** switches it off; the band then stays,
> and says it is off.

**The last two bands can be hidden**; the first two are pinned.

### Clicking a tile opens it

**That is the rule for the whole page.** A click on a picture opens it in its workspace. Anything
that is not "open" is a secondary action, revealed on hover in the corner of the tile.

**Making another image costs no network call.** "Make another one with…", in the corner of each
creation, reopens the form already filled in — model, prompt and settings are kept beside the
asset.

**Fetching a remote asset no longer happens on this screen**: the panel that listed what your
account holds online has left the home. The gesture lives in the **Library** panel, on a
right-click over a library tile — see [Assets](07-assets.md).

### Tidying the page

**Hide this section**, when a band's heading is hovered. Hidden sections are counted at the foot
of the page — "1 section hidden" — with a **Show them again** button.

**Your models** and **What is moving** carry that button; **Where you left off** and **Tools** are
pinned, and that is what keeps this screen from ever being empty.

### The left column

Cut in two, as in the workspaces: above, what one produces with; below, what one browses. **The
home makes no document of its own** — it leads to the other workspaces' — so its upper half goes
to what one produces IN: the projects.

| Panel | Half | What it shows | It needs |
|---|---|---|---|
| **Your projects** | 1st | the ones you opened recently, with their folder, reopened with a click — [its per-row menu](04-projects.md#the-home-screens-project-list) | nothing |
| **Explorer** | 2nd | the open project, read as a folder | an open project |
| **Git** | 2nd | what has changed in that folder since the last recorded version | an open project |

**It is the same Explorer as in the workspaces**, in the same place — see
[Projects](04-projects.md#walking-the-project--the-explorer-panel). It shows the whole folder:
your documents, your assets, and everything you put there yourself.

**With no project open, neither is there at all** — the only panels on the home that behave this
way. Elsewhere a panel stays and says what it lacks; here they would say "no project open" right
beside the panel whose whole job is to open one.

The **Git** panel reads the same folder as the Explorer, from another angle: not what it holds,
but what has changed in it since you last recorded a state. The two take turns in the same half —
their icons sit side by side in the rail. How to use it is in
[Projects](04-projects.md#recording-versions--the-git-panel).

### The right column

**The home has none.** That is not an oversight: in every workspace the right column is where what
acts on the document in front of you lives, and the home opens no document. The one panel that had
stood there listed what your account holds online; it has left the screen, and what it said about
your means is said by the **Your models** band, across the full width.

**"It needs" does not mean the same for a panel as for a band.** A band missing what it needs
disappears; **a panel stays and says what it lacks** — which is what the Explorer and Git do in
the left column.

> **The home can be skipped.** **Settings ▸ General ▸ Show the home screen**: unticked, the studio
> goes straight to the workspace you left. What you hide is set on the home itself.

---

## The overall plan

```
┌──────────────────────────────────────────────────────────────┐
│  TITLE BAR — home and the six workspaces                     │
├──┬────────────────────────────────────────────────────────┬──┤
│  │                    top zone                            │  │
│ R├────────────────────────────────────────────────────────┤ R│
│ A│         │                                    │         │ A│
│ I│  left   │          DOCUMENT ZONE             │  right  │ I│
│ L│  zone   │        (the tabs live here)        │  zone   │ L│
│  │         │                                    │         │  │
│ l├────────────────────────────────────────────────────────┤ r│
│  │                   bottom zone                          │  │
├──┴────────────────────────────────────────────────────────┴──┤
│  STATUS LINE — project — document                            │
└──────────────────────────────────────────────────────────────┘
```

Five elements, in the order you meet them:

1. the **title bar**, carrying the workspaces;
2. the **rails**, against the left and right edges: strips of icons;
3. the **zones**, where the panels live;
4. the **document zone**, in the centre;
5. the **status line**, at the very bottom.

**The colours mean something.** The general background — the *chassis* — is mid grey; the panels
on it are **darker**, with rounded corners.

---

## The title bar

It does not carry the file name, but the **six workspaces**:

**Image** · **Video** · **3D** · **Audio** · **Materials** · **Skyboxes**

A click switches workspace; the active one is lighter than the others. Switching does three
things:

- **the panels rearrange** — each workspace shows the tools it needs;
- **the tabs change** — each workspace has its own open documents;
- **the catalogue filters** — Models shows only the models capable of that kind of content.

On macOS, the three traffic lights stay where they always are, on the left.

### Arranging the workspaces in the order that suits you

| Gesture | How |
|---|---|
| **Drag** | pick up a workspace and drop it onto another |
| **Keyboard** | `⌥⌘←` / `⌥⌘→` (`Ctrl+PageUp` / `Ctrl+PageDown`) on the focused workspace — the bare arrows walk the bar |
| **Right-click** | **Move left** / **Move right** |

Both keys can be remapped under the *In the workspace bar* context of the
[shortcuts screen](15-shortcuts.md).

**Home does not move** and stays first. The order is the same in the home screen's **Tools**
section, and it is remembered from one session to the next.

> **A workspace added by an update does not land at the end of your bar.** It lands where the
> studio files it by default, after the last of its earlier neighbours you kept.

### The account switcher

On the right of the title bar: a coloured dot, a name, a chevron.

| What you see | What it says |
|---|---|
| **Green** dot | the displayed account's key works |
| **Grey** dot | it does not, or there is no account |
| **The name** | the account currently in use |
| **"Not connected"** | no account is stored |

One click opens the list of your accounts, the current one ticked, plus **Manage accounts…**,
which leads to the settings. With no account stored, the button goes straight to the settings.

> **Switching accounts changes the library, not your work.** Each API key carries its own remote
> project — its models, its assets, its credit. Your local project is on your disk and belongs to
> no account.

Keys are typed in the settings, and nowhere else.

---

## The rails

The two vertical strips of icons, against the edges. **A rail never disappears**: even when you
have closed everything, every panel stays one click away.

A click on an icon **opens** the panel; a second one **closes** it. A **separator** marks a
zone's cut: the icons above it open in the first half, those below in the second.

### Moving a panel

**Drag its icon along the rail** and drop it where you want it: in the other half of the same
column, in the other column, in the bottom band. A dashed frame shows where the panel will land,
and an empty half opens during the gesture to offer itself.

A panel **that was on screen** still is where it lands; a closed one moves without opening — the
gesture does not force a column on you that you never asked for.

> **Each workspace keeps its own arrangement.** Moving the Layers in the Image workspace moves
> nothing in Video, nor on the home. What the six workspaces still share is what is **open** — a
> library opened in Image is still open in Video.

**View ▸ Reset layout** brings every panel back to its original place, everywhere.

### The left rail

| Element | What it does |
|---|---|
| **+** (blue button) | creates a **new document** in the active workspace — on the home, a **new project** |
| *separator* | |
| **Upper half** icons | Models, Generate, then Library — what the provider offers; the home puts **Your projects** there |
| *separator* | |
| **Lower half** icons | the Explorer then Git, on the home as in the workspaces |
| At the bottom | Timeline then History, depending on the workspace; on the home, History alone |

> **The + button makes what the screen makes.** In a workspace it is greyed out while no project
> is open: a document is a file in a project folder. **On the home it is never greyed out** — it
> makes the project, and making a project needs none.

### The right rail

The right column's icons — Layers, Scene, Lights, Meshes, Animations, whichever the workspace
declares, in that order — then, below the separator, Inspector.

In **Video**, **Audio**, **Materials** and **Skyboxes** the upper half of that column is empty:
none of those four declares anything there, and the rail then carries the Inspector alone — what a
sky or a material IS is described by the inspector itself.

On the home it carries none: this screen has no right column.

### The rail only shows what the workspace can do

An icon appears only if the workspace really has that panel: Layers do not exist in the Audio
workspace.

**Generate is a special case**: its icon is absent while no model is chosen. It appears as soon
as you pick one in **Models**, and stays if you have set a default model for that family.

---

## Zones and panels

Four zones — **left**, **right**, **top**, **bottom** — each cut into two halves, and each half
shows **one panel at a time**:

- two panels in the **same half** take turns: opening the second closes the first;
- two panels in **different** halves of the same zone show **together**.

> **The top zone hosts no panel for now.** It exists in the structure and stays reserved.

### Resizing

**Drag the space between two panels** — the *gutter* is itself the handle.

The studio always keeps **at least 240 pixels** for the document zone and **at least 140** for
each side zone: you cannot crush the centre by accident.

Starting sizes: left column 320 px, right column 260 px, bottom strip 240 px.

### Closing, reopening, putting everything back

A panel closes; it does not collapse. Three ways to get back what you closed:

| Means | Effect |
|---|---|
| Click its icon in the rail | reopens that panel |
| **View ▸ Tool windows** | the same thing, from the menu |
| **View ▸ Reset layout** | puts **all** panels back where they started |

> **Resetting the layout does not touch your work.** It only moves panels.

### When a panel gets narrow

Its heading gives ground gradually: its own controls — a filter, a view button — go first. **The
close button never goes**, and the panel's name keeps its size.

---

## The complete list of the workspaces' panels

| Panel | Zone | Half | Visible in | What it is |
|---|---|---|---|---|
| **Models** | left | 1st | everywhere | the remote catalogue, filtered on the active workspace |
| **Generate** | left | 1st | everywhere *(if a model is chosen)* | the chosen model's form |
| **Library** | left | 1st | everywhere | what your key owns online, what the community publishes, what is being made — **absent without an API key** |
| **Layers** | right | 1st | Image | the layer stack of the open image |
| **Scene** | right | 1st | 3D | the tree of the open scene |
| **Lights** | right | 1st | 3D | the scene's light sources |
| **Meshes** | right | 1st | 3D | the scene's objects, and the button that adds one |
| **Animations** | right | 1st | 3D | what a character can be made to play: the sequences its file brought, and those shipped with the studio |
| **Explorer** | left | 2nd | everywhere | the project folder, folders and files |
| **Git** | left | 2nd | everywhere *(with a project open)* | what has changed in the project folder since the last recorded version |
| **Inspector** | right | 2nd | everywhere | what is selected, adjustable live |
| **Timeline** | bottom | 1st | Video, Audio, 3D | the sequence being edited, or the animation |
| **History** | bottom | 1st | everywhere *(with the project folder tracked by git)* | the project's recorded versions, and what each one changed |

> **"Everywhere" means the workspaces, not the home screen.** The home has panels of its own —
> five — that this table does not list. **Three belong to both**: the Explorer and Git in the
> left column, and History in a bottom strip the home did not have before. The Explorer and Git
> appear only with a project open, and **History only if that project is tracked by git**: with
> no project, the home is the screen it has always been — two columns and nothing below.

**The left column reads in two parts: what the provider offers, then what is already yours.** Above,
**Models**, **Generate** and the **Library**, which take turns — a model to choose, its form, and
what the account hosts. Below, the **Explorer** and **Git**, which take turns as well: your
project folder, and what has changed in it.

The cut between the two halves is what makes the gesture possible: the Library and the Explorer
hold the screen **together**, and nothing enters the project without passing from one to the other.

**The right column belongs to the open document**: what it holds, what lights it, what is
selected. The panels take their turn in the upper half; the **Inspector** always holds the lower
one.

### A half shows what the workspace puts there

Open the bottom strip in Video: it is the edit. Switch to Image: the same strip becomes History,
with nothing to reopen.

**What you opened is a zone**, and it stays one. Closing the half empties it everywhere.

- **nothing is overwritten**: go back to the original workspace and you find what you had;
- **a Generate panel with no model gives way to Models.**

### A half you have not chosen for opens on the workspace's first panel

Until you have clicked an icon of a half, it shows the first panel the workspace declares there.
That is what you see on first opening, and what **View ▸ Reset layout** restores.

The upper left half opens on **Models** in every workspace — choosing a model is where everything
starts, and the Explorer is asked for. The lower half opens on the **Explorer**, everywhere too.

| Workspace | The upper right half opens on | The bottom strip on |
|---|---|---|
| **Image** | Layers | History |
| **Video** | *nothing* | Timeline |
| **3D** | Scene | Timeline |
| **Audio** | *nothing* | Timeline |
| **Materials** | *nothing* | History |
| **Skyboxes** | *nothing* | History |

> **History needs a folder tracked by git.** Until tracking is in place — no project open, or a
> project whose folder is not tracked — the bottom strip of those three workspaces **goes away**:
> it takes no room at all. The Git panel says where this project stands, and carries the button
> that sets tracking up.

As soon as you click an icon, that half remembers **your** choice and does not move again, until
you click another one or reset the layout.

**The Explorer is visible everywhere.** A double-click on a document opens it, switching
workspace if it belongs to another; on a file under `assets/`, it opens in the workspace that
edits its kind; on anything else, it hands it to the system.

---

## The document zone

The centre, where what you are making lives. **It only takes documents**: an open file and its
toolbar. No panel can enter it.

### The tabs

Every open document has its tab, at the top of the centre; one click moves between them. They can
be **moved**, **reordered**
and **placed side by side**: drag a tab towards an edge of the centre, a drop area appears, let
go.

### The dot beside the name

A tab whose work is not on disk carries **a dot** (`•`). It goes at save time (`⌘S` / `Ctrl+S`)
and comes back on the next change. Undo back to the exact point where you saved, and it goes too.

> **All six document kinds save** — layered images, 3D scenes, materials, sequences, edited sounds
> and skies. What does not survive one save to the next is the undo history. See
> [What does not exist yet](18-limits.md).

### Closing a tab

The cross closes the document. **If it carries the dot**, the studio asks first:

- **Save** writes and then closes — that is what `⏎` picks;
- **Don’t save** closes and loses the work done since the last `⌘S`;
- **Cancel** closes nothing — it is also what `⎋` answers.

If writing fails, the tab stays open and the reason goes to the activity journal.

### A tab's menu

**Right-clicking** a tab opens four gestures:

| Row | What it does |
|---|---|
| **Rename** | opens the name in the tab; a double-click does the same |
| **Close tab** | like the cross, question included |
| **Close other tabs** | closes them one by one; a *Cancel* stops the run |
| **Delete document…** | **removes the file from the project folder** |

Renaming changes the name **everywhere at once** — the tab, the Explorer, the document list, the
status bar — and the file on disk with it, since it is the same name.

**Deleting cannot be undone**, and it is the only gesture in the studio that erases a file you
made. The studio asks for confirmation, and this time *Cancel* is the default button.

### Each workspace has its own tabs

Going from "Image" to "3D" closes nothing: it files Image's tabs away and brings out 3D's.

---

## The status line

The thin strip at the very bottom. On the left, it says **where you are**:

| What appears | Situation |
|---|---|
| *No project open* | nothing is open |
| `My project` | a project is open, no document in front |
| `My project — Cliff` | the document "Cliff" is in front |

### Generations, on the right of the status line

Your running requests. **There is no Jobs panel**: a generation must be readable from any
workspace. What you see, when something is working:

```
3 generations  ▓▓▓▓▓░░░░░  45 %  ⌃
```

| Element | What it says |
|---|---|
| **"3 generations"** | how many are working right now |
| **The bar** | their average progress |
| **The percentage** | the same figure, spelled out |
| **The chevron** | one click opens the full list |

**When nothing is working, the area disappears** — **unless something failed**: "2 failures"
stays on screen after the jobs end.

**Clicking opens the list**, in a small window above the status line: one line per job, its
model, its state, its bar, and the button that cancels it. Under the bar, what the generation
cost — or, if it failed, why.

### The journal, next to it

A second icon, on the same line: the **activity journal**. It keeps what the studio did and what
it failed at — a generation, an import, an upload to the library, a save. **It is always there**,
unlike the generations, which vanish when nothing is running.

| What you see | Situation |
|---|---|
| a small grey clock | all is well, the journal can be read |
| an alert and "2 failures" in red | two things failed and have not been read |

**One click opens the list and marks everything read.** Two filters wait there: the **level**
(information, warning, failure) and the **subject** (generation, import, library, document,
project, interface). **Each is a menu**: the button says what it keeps — "Level: Failure", or
"Level: All" — and opening it gives the tick boxes. The **All** row, at the top of the menu,
releases the whole filter.

**Interface is the studio itself** rather than what it holds: a panel that could not be drawn, a
stored layout gone unreadable — [see chapter 16](16-troubleshooting.md).

**To close it**: a click outside, `Esc`, switching to another application, or clicking the icon
again. That holds for everything floating above the window.

### The toasts that do not fade

A failure raises a **toast** in the bottom-right corner, above the status line.

- **Only failures raise one.** An asset imported successfully gets its line in the journal.
- **They do not go away on their own.** A toast goes when you close it, and closing it marks it
  read.

---

## The native menu

The system menu — at the top of the screen on macOS, at the top of the window elsewhere.

**Three of them only appear in the workspace that uses them**: Tools and Image while you are
editing a picture, Add while you are editing a scene. A missing menu is not a greyed menu — it is
simply not there.

| Menu | What is in it |
|---|---|
| **AI Desktop Studio** | *macOS only*: About, **Settings…**, and the system's commands |
| **File** | New project…, Open project…, Save, Save as…, Import ▸, Export ▸. **Off macOS, Settings… is here** |
| **Edit** | Undo, Redo, and the system's text commands |
| **Tools** | *Image workspace*: the eighteen tools of the bar, plus **Smaller** and **Larger brush** |
| **Image** | *Image workspace*: the twelve entries described in [the Image workspace](08-image-workspace.md) |
| **Add** | *Modelling workspace*: **Mesh ▸**, **Light ▸**, **Object ▸** |
| **View** | **Assistant**, Tool windows ▸, Reset layout, Full screen — plus whatever the workspace adds |
| **Window** | the system's window commands |
| **Help** | **User manual**, Usage…, Licences. **Off macOS, About is here** |

The shortcuts shown in the menus are **the ones you have set**.

**View ▸ Tool windows** only lists what the workspace can open, like the rail.

**View changes length with what you are editing.** A picture adds the four zooms, Rulers, Guides,
Clear guides and Snapping; a scene adds **Display mode ▸**, **Point of view ▸**, **Capture the
view ▸**, then the projection, the four views, the quad edges, the skeletons and pose mode.

> **Assistant is the only door to `⌘K`.** The command is global: it is fired by this menu rather
> than by the window, so without that row the shortcut would reach nothing at all.

### The usage window

**Help ▸ Usage…** says **what your keys have spent**. Top right, the period: **7, 31 or 120
days**, 31 by default.

| Section | What it shows |
|---|---|
| **Overview** | the total spent over the period, discounts, how many generations, and the spend per day and per account |
| **Models** | which models cost what, how many generations each served, and the share that went through an API key |
| **Activities** | what was done, and the assets that came out of it |
| **Journal** | every billed event, newest first, by pages |

Activities and Journal name their rows in the window's language: you read "Image generation", not
`images-generation`. An event kind the studio does not know yet shows the API's raw name.

**The window says itself what its figures do not** — under the amount for the first, in the
window's footer for the others:

- **the euro amount is indicative.** Computed from the public prepaid pack grid: an order of
  magnitude, not an invoice;
- **there is no balance.** The generation API only exposes what has been spent, never what is left.
  No figure will tell you how much you can still generate;
- **this screen's days and hours are counted in UTC**, as the API dates them. A day's bar therefore
  need not follow your own calendar;
- **the total mixes accounts billed separately** — that one only appears with several keys. The sum
  shown then matches no real invoice, and the Overview breaks it down per account.

**A key that does not answer does not skew the figures silently**: the window names the keys that
stayed quiet and states that the totals are the other keys'. With no key stored at all, it says
so and points to the settings.

### The licences window

**Help ▸ Licences** lists the software AI Desktop Studio ships with: name, version, and the short
licence name (`MIT`, `Apache-2.0`…). Click a row: the **full text** unfolds, and the link to its
sources appears when the licence requires it.

Three texts, three scopes:

| What it covers | Under which terms | Where to read it |
|---|---|---|
| **The studio's source code** | PolyForm Noncommercial 1.0.0 — reusable for any **noncommercial** purpose | `LICENSE`, in the repository |
| **The application** you installed | its own terms of use | `EULA.md`, in the repository |
| **The third-party components** | each keeps its own | this window, and `THIRD-PARTY-NOTICES.md` |

**ffmpeg is a case apart**: it is not linked into the application, it is launched **alongside**,
as a separate program. Its licence differs by platform — GPL on macOS, LGPL elsewhere — and **its
corresponding sources are attached to every published release**.

---

## What the studio remembers on its own

You have nothing to save for this:

- **your panel layout**, per workspace and per project;
- **the size of each zone**;
- **the open tabs**, per workspace;
- **the last project opened**, reopened on the next launch — adjustable, see
  [Every setting](14-settings.md);
- **the chosen model**, per family.

---

## Closing the last window quits the studio

On macOS, the convention is that an application outlives its windows. **That is not what the
studio does**: closing the last window quits it, on all three systems.

> Your documents do not go with it: anything unsaved is **asked about before** the window closes.

---

[← First steps](02-first-steps.md) · [Contents](../user-guide.md) · [Next chapter: Projects →](04-projects.md)
