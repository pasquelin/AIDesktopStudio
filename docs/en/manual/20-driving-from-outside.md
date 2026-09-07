# 20. Driving the studio from outside

[← How do I…](19-recipes.md) · [Contents](../user-guide.md)

---

So far you have driven the studio by hand: a click, a shortcut, a menu row. This chapter covers
the other way — **saying what you want, and letting the studio do it**.

It has two doors, and **they open onto the same room**:

| The door | Where it is | Who speaks |
|---|---|---|
| **The assistant** | in the window, on `⌘K` | you, in English or in French |
| **The way in** | shut to start with, opened in the settings | a program outside, such as Claude Code |

Both read **the same catalogue**, and **nothing that commits anything goes out without your seeing
it on screen** — wherever the request came from.

**The way in offers them all** — everything a program drives deliberately: the file tree, the
layer stack, the edit, the sky, the material, the 3D scene, a character's skeleton, the git
repository, the remote library, the studio's panels.

**The assistant gets as many of them as the model answering you can hold.** The whole catalogue
where there is room — a chat cloud, a local model with a wide window — and only the actions a
spoken sentence needs where there is not: open a workspace, find a model, prepare a generation. In
that case it is left with a way to **ask for the rest** mid-course, which costs it one round trip.
There is nothing for you to set: it follows the model picked in the assistant's window.

---

## The assistant

**`⌘K`**, or **View ▸ Assistant** in the menu bar. A window opens over the studio, with a field,
and that is all.

You write what you want to do, in an ordinary sentence:

> *Open a new 3D file*
> *Search for a material model for stone*
> *Prepare an image generation at 1024 by 1024*

The assistant reads the sentence, picks one or more actions from the catalogue, and runs them.
Each step shows in the thread, with what it returned.

### What the assistant can read

**Your sentence, the last ten exchanges, and the state of the studio.** It knows which workspace
is open, which document is in front and whether it holds unsaved changes, which model is armed for
that workspace, what is selected in it, and what the project's own notes say
([chapter 4](04-projects.md#the-projects-context)). That is what lets it read "make me a bicycle"
as a generation in the workspace you are in, rather than as a document to create.

**It still does not see your documents**: neither your images nor their contents — it knows the
*catalogue* of actions and their parameters, and the state of the window, not what your files
hold.

One exception, and it is explicit: **Describe the style of the references** reads the reference
images already sitting on the Generator's form. It is the only place the assistant looks at an
image, and you have to have asked for it.

### Choosing who answers you

The picker is **in the assistant's own window**, not in the settings — the moment one wants a
steadier model is the middle of a sentence that was not understood. It lists everything that can
answer, grouped by where it runs:

- **On this machine** — the models installed here, Ollama included. Nothing leaves the computer.
- **Your keys** — the services you hold a key for in *Settings ▸ API keys*. The exact model name is
  set beside the service, in *Settings ▸ AI models*.
- **The studio** — the remote catalogue, on one of the four models below.

It is the same choice as *Settings ▸ AI models ▸ Assistant*: changing it here changes it there, and
it applies to the open project once that project is what settled it.

| Studio model | What it is worth |
|---|---|
| **Haiku 4.5** *(start)* | the fastest and the cheapest |
| **Sonnet 4.6** | the balance |
| **Opus 4.8** | the steadiest over a request in several steps |
| **Gemini 3.5 Flash** | the quick alternative |

The cheapest is enough to open a workspace or search for a model. The others hold up better on a
request that chains three or four actions.

> **Under *The studio*, there is no second account and no second key to enter.** The assistant
> thinks on a model of the remote catalogue, over the connection you already have. That is also
> why **thinking is paid for** — see just below. A service of your own, or a model on this
> machine, spends no creative units at all.

### What it costs

**Thinking spends creative units.** Not many, but it is not free, and it is separate from what the
generation the assistant prepares will cost.

**The window shows the running total for the conversation under way**, at the bottom.

**Closing the window does not reset it**, and does not clear the thread: reopening the assistant
finds both where you left them. The counter runs **until you quit the studio**.

> **That total counts thinking alone.** What a generation costs is the jobs bar's to report, and
> the [Generating](06-generating.md) chapter covers it. The two do not blend, and the assistant
> starts no generation without asking you.

### Dictation works there

The microphone beside the field is the same one as everywhere else, with the same settings
([chapter 14](14-settings.md#dictation)). Speaking to the assistant rather than typing changes
nothing about what it does with the sentence.

---

## The way in for a program outside

This is the second door: **another program installed on your machine can drive the studio as you
would**. A coding assistant such as Claude Code, for instance, or any client speaking the **MCP**
protocol.

**This door is shut to start with, and stays shut until you open it.**

### What guards it

Four things, and a request needs all four to get through:

| The lock | What it stops |
|---|---|
| **Off by default** | nothing is listening on a fresh install |
| **This machine alone** | the way in listens on `127.0.0.1` only: nothing on the network reaches it, neither the home Wi-Fi nor the office one |
| **A fresh token every launch** | a request without the token of the launch under way is refused |
| **No web page** | a request coming from a site open in your browser is refused on that ground alone |

> **And above the four, the fifth, which is you.** Anything that spends or uploads shows on screen
> and waits for your yes, exactly as if you had asked for it yourself. A program outside cannot
> give it on your behalf.

### Opening it

**Settings ▸ Way in (MCP) ▸ Drive the studio from outside.** Tick the box; the way in starts at
once.
Untick it, it stops and **nothing is listening any more**.

---

## Connecting Claude Code

This is the common case, and it takes three gestures.

### 1. Copy the connection line

**Settings ▸ Way in (MCP) ▸ Connection command ▸ Copy.** The studio puts a line of this shape on
your clipboard:

```
claude mcp add <name> -- "/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio" --mcp-stdio=…
```

**No port, no token, no address.** What you paste names **the studio as a program to start**, not
a place to reach. That is what makes this line true for every launch — see below.

### 2. Paste it in a terminal

Open a terminal **in the project folder where you work with Claude Code**, and paste the line.
Claude Code now knows the studio.

### 3. Open the door

Back in the same section, tick **Drive the studio from outside**. It then says which port the
studio is listening on, what a client can do, and what guards the door.

**That order is not a requirement** — it is the one on screen, and it only makes sense now that
what you copy holds no address: the box can be ticked before, after, or already be ticked.

**Ticking is what makes the tools appear**: with the door shut your client finds the studio and
is told it is not answering. To check, ask it for its MCP servers — the studio should be there,
connected.

### A client configured by a file

Not all of them are driven from a terminal. For those, **Configuration block ▸ Copy the JSON**
puts the same connection on the clipboard, in the shape a configuration file expects:

```json
{
  "mcpServers": {
    "ia-studio": {
      "command": "/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio",
      "args": ["--mcp-stdio=…"]
    }
  }
}
```

Paste it into your client's MCP configuration file. Like the command, it holds no port and no
token.

### There is nothing to redo

**The port and the token do change every time the studio starts**: the two middle locks are intact,
and deliberately so — a fixed port and a permanent token would hold from one session to the next,
and would hold just as well for any program that had read them once.

**But your client does not know them.** It starts the studio, and it is that program which reads
the current launch's address — at every message it carries, never once and for all.

**A line pasted once therefore holds for every launch after it**, including the ones where the port
and the token are new, which is all of them. A client already registered under the same name is
replaced; there is nothing to remove first.

> **Studio closed, or box unticked**: your client is told the studio is not answering, rather than
> left waiting. Open it again and it picks up — with nothing to paste again.

### What you can ask it for

Once connected, Claude Code speaks to the studio the way you would speak to the assistant, but
from your code project:

> *Open the Modelling workspace in the studio and create a document*
> *Find me a night skybox model*
> *List the generations under way*
> *Prepare an image generation with this prompt, but do not send it*
> *Sort this week's rushes into a folder per day*
> *Generate a stone material, wait for it, and place it in the scene*
> *Add a text layer saying “Credits” at the bottom of the image, at 64 points*
> *Put a sphere two metres to the right of the cube and light it warm*
> *Record a version with a message describing what we have just done*

**That last sentence is worth reading twice.** Preparing and sending are **two distinct actions**,
and only the second spends. A program outside can fill the form as much as it likes: until **Start
the prepared generation** has had your yes on screen, nothing has gone out.

---

## The catalogue

**Fifteen families.** The table below says what each family covers and what it **commits** — that
last column is what decides whether the studio will ask you anything. Neither the count nor the
exact list is copied out here: they move, and **your client reads them at the source** when you ask
it for its tools, with every parameter of every action.

| The family | What it covers | What it commits |
|---|---|---|
| **The studio** | what is open, which document is in front, what has just happened | nothing |
| **Files** | open a project, rename it, list, search, move, copy, rename, bin, show in the system file manager, undo and redo the last batch | **files**, for whatever moves or destroys |
| **Documents** | open, bring to the front, rename, close, export into the project | **files**, for closing, renaming and exporting |
| **Generating** | read a model's inputs, price them, prepare, start, wait, cancel | **creative units** for starting, and for starting alone |
| **The library** | search, read, tag, caption and remove assets, find the ones whose file has gone, pull a model's images out | **files** for removing, **a server** for removing from the remote library too |
| **The remote library** | browse your own and the public feed, find likenesses, plan, fetch, send | **an asset**, for sending |
| **The image** | the layer stack: add, style, place, group, merge, crop, set a mask, lay and move the guides | nothing |
| **The edit** | Video and Audio: lay a clip, move it, trim it, cut it, set fades, level and speed, keep the tracks. Exporting the document writes the **cut** as OpenTimelineIO, never a film — the frame-by-frame render needs a session nothing outside can hold | nothing, except the export |
| **Sky and material** | adjust a sky's image, place its sun, choose the projection to look at it under, fill a material's channels, remap them, choose the shape to judge it on, and render it | nothing |
| **3D** | the scene: place an object, turn it, cut it to size, light it, paint it, dress it in maps, set a text, draw a rail, reparent it, and look at it — from one side, in one of the ways of drawing, and take a still of it. The setting too: what lights the scene, what hangs behind it, its haze, its ground, its rendering, and the ready-made worlds | nothing |
| **Characters** | make a model animatable, add or remove a bone, tie it to a joint of the standard, put a handle on it, list what it can play, lay an animation block and set it, lay and take back keys, keep the channels, set length and rate | nothing |
| **The project's context** | read the cards that say what the project is about, add one, rewrite one, turn it on or off, delete it | **files**, for rewriting a card's text and for deleting one — adding and turning off destroy nothing |
| **Versions** | read the repository and its history, stage, record, branch, shelve, settle a conflict, fetch, publish | **files**, for whatever rewrites the working tree; **a server**, for publishing |
| **Settings** | read and change the settings, press the buttons of the window, list the accounts, switch to one, rename one | **files**, for the two buttons nothing takes back |
| **Around the documents** | the window, the account, updates, fonts, pinned recipes, material styles, the studio's panels, dictation, and the three windows of the Help menu | **files**, for deleting a style and for installing an update |

**What the assistant knows comes to eleven**, and they are the ones a spoken request needs: run a
command, open a workspace, search for and pick a model, prepare a generation, start it, list the
jobs, rework or translate a prompt, describe the style of the references, and close the
conversation. The rest is driven from a program.

> **A command only ever reaches the document in front.** That is true of the keyboard shortcut and
> of the outside client alike, and it is the first thing to know about driving it: ask the studio
> for its state, bring the right tab forward, then act.

### The five commands that are the exception

**Run a command** commits nothing — except when the command aimed at is one of these five:

| Command | What it does with your picture |
|---|---|
| **Regenerate the region** | flattens it and uploads it |
| **Cut out** | same |
| **Upscale** | same |
| **Vectorise** | same |
| **Extend** | same |

All five **upload the canvas picture**, which then becomes a permanent asset of your library. They
cost no creative units — they only prepare the form — but they leave something behind them, and
that is what earns them a question.

---

## What the studio asks you, and when

Three questions, all on screen, in the window in front.

**When an action is about to spend:**

> *This action will spend 12 creative units.*

The figure is **estimated before** anything is committed. When the studio cannot estimate it, it
says so rather than inventing one:

> *This action will spend creative units. The studio could not estimate how many, and does not
> invent a figure.*

**When an action is about to upload:**

> *This action will upload an image, which then stays in your library. It costs no creative units.*

**When an action is about to touch your files:**

> *This action will change what your project holds — files, or the assets in its library. It
> costs no creative units.*

This one is deliberately **narrow**: moving, renaming, binning, closing a tab that holds unsaved
work, putting a git-tracked file back, rewriting the version last recorded. Making a folder or
duplicating a file takes nothing away from anyone and asks you nothing — a studio that asked
about those would teach you to click **Allow** without reading.

**Narrow does not mean recoverable.** The Explorer takes back a move, a rename or a binning. It
takes back nothing a git-tracked file had never recorded, nothing of a rewritten version, and
nothing of an asset removed from the remote library as well.

**When an action is about to publish off this machine:**

> *This action will publish to a server, off this machine. It costs no creative units, and nothing
> here takes it back.*

Two requests carry that level, and they are worth naming: **sending a branch to a remote git
repository**, and **removing an asset while asking that it be removed from the remote library
too** — the API has neither a single-asset delete nor an undo. Every other one stops at the edge
of the machine, fetching included — and pulling, which rewrites your working copy and therefore
asks you on the files ground instead.

In all four cases, two buttons: **Allow** and **Don’t allow**. Declining runs nothing, and the
assistant takes it into account for what follows.

> **The question cannot be walked around.** Neither `Esc` nor a click outside closes it: an action
> is waiting for the answer, and making it vanish would leave that action waiting for good. It has
> to be answered.

**You have two minutes.** Past that the request is given up on, and the program that made it gets a
refusal rather than waiting. That is the time it takes to read "this will spend 12 units" and
decide — not a network timeout.

### Working while you are not there

While nothing is armed, a client acting with nobody in front of the screen stops at the first
question. That is the default, and it is deliberate.

The advanced settings open four lines that change it, each under **Drive the studio from outside**
and each with no effect while that is off. The first three let one level of commitment through
without asking — touching files, uploading, publishing to a server. The fourth is an amount in
creative units: what a client may spend in this window before the studio starts asking again. At
zero, every spend is asked about.

> **Three things to know before arming anything.** A generation the API declines to price is
> **never** started without you, whatever the amount allows — an unknown cost cannot be capped.
> The count is kept per window and starts again at each launch: two windows open each carry the
> whole amount. And **no client can arm these four lines itself** — they are written only in this
> settings window, because an authority a program grants itself is not one.

---

## When it refuses

A refused action always says why. The grounds, and what they mean:

| The message | What happened |
|---|---|
| *No such command exists in the studio.* | the identifier asked for matches nothing |
| *No surface of the studio was there to take that command.* | open the document or the panel it speaks to, and ask again |
| *The Generator was not open. It is now.* | nothing failed: ask for the same thing again |
| *The Generator has no model armed at the moment.* | pick a model before preparing |
| *The generation did not go out.* | sending failed downstream — nothing was spent |
| *The parameters given do not suit this action.* | what was passed does not match the expected fields |
| *The studio is not answering.* | the window could not be reached |
| *That action needs a yes, and no window was there to give one.* | never a silent yes: with no screen, it is no |
| *You turned that action down.* | that one is you |
| *No studio window was in front to run that action.* | the studio is running with no window in front: open one |
| *The request stood on screen unanswered, and was given up on.* | the two minutes went by |
| *The form carries no reference image to read a style from.* | put an image on the form first |
| *The form changed after the cost was quoted. Nothing was sent — ask again for a fresh figure.* | what was quoted is what goes, never anything else |
| *What you named is not there.* | the request was well formed and its target is absent — the most frequent ground of all, and it is about an identifier rather than about parameters |
| *No project is open.* | a path is relative to a project, and there is none to be relative to |
| *An outside client may not do that.* | never your own refusal: arming the delegation is written in the settings window and nowhere else |
| *The document in front carries nothing this could render.* | an empty sky, a material with no channel, a scene with no camera |
| *It was tried and it did not go through.* | the recent activity holds the reason; what was passed was not it |

The window grounds — *no window in front*, *no window to give a yes* — **are only ever met from a
program outside**. The assistant is in the window: there is always someone there to be asked.

---

## What this route does not do

- **It never returns an API key or a secret.** It can say which accounts exist, which one is
  active, and rename the label of one — never what they hold, and it can neither add one nor
  delete one. What goes to the provider goes as usual, with your credentials, from your machine.
- **It arms nothing for itself.** The four lines that let a commitment through without a question
  are written in the settings window and nowhere else: a client asking to change them is told no.
- **It never spends on its own.** One action spends — starting the prepared generation — and it
  asks, with its estimate.
- **It does not outlive the studio.** With the studio closed the way in no longer exists, and the
  launch's token with it. What your client keeps is not an address but a way to start the studio:
  nothing it holds opens anything while the studio is not running with the box ticked.

> **It does read and change your project folder**, which the first versions of this way in did not.
> That is what lets a coding assistant work with you rather than beside you — and it is why
> everything that moves or destroys is put to you on screen.

---

## Alongside this chapter

- **[Generating](06-generating.md)** — what the assistant prepares, and what sending it costs.
- **[Every setting](14-settings.md)** — the box and the button, in their section.
- **[Every shortcut](15-shortcuts.md)** — `⌘K` among the others.
- **[When something goes wrong](16-troubleshooting.md)** — when the door will not open.

---

[← How do I…](19-recipes.md) · [Contents](../user-guide.md)
