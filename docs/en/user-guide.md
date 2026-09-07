# AI Desktop Studio — the manual

Welcome. This manual explains **everything** AI Desktop Studio does, from your first launch to
everyday work.

It is written to be read by someone who has never opened a creative application, without lying to
someone who opens one every day. When a difficult word is unavoidable, it is explained where it
first appears, then repeated in the [glossary](manual/17-glossary.md).

> 🇫🇷 Ce manuel existe aussi [en français](../fr/guide-utilisateur.md).
> Looking for how the software is **built** instead? See [architecture.md](architecture.md).

---

## In three sentences

AI Desktop Studio is an application that installs on your computer. It can **make** images, videos,
sounds, 3D objects, materials and skies — by asking artificial-intelligence models, online, at
a generation provider. And it can then **assemble, adjust and file them**, on your
machine, without sending them anywhere.

---

## The manual, chapter by chapter

### Getting started

| | Chapter | What you will find |
|---|---|---|
| 1 | [Discovering the studio](manual/01-discovering.md) | What it is for, who it is for, and the eight words to know before starting |
| 2 | [First steps](manual/02-first-steps.md) | Install, connect your account, create your first project, make your first image |
| 3 | [The window, explained](manual/03-the-window.md) | Every piece of the screen, what it does, how to move it or bring it back |

### Everyday work

| | Chapter | What you will find |
|---|---|---|
| 4 | [Projects](manual/04-projects.md) | What a project is, what is inside it, how to save and move it |
| 5 | [Finding a model](manual/05-models.md) | The catalogue, search, filters, and how to choose |
| 6 | [Generating](manual/06-generating.md) | The form, the prompt, the job queue, errors and retries |
| 7 | [Assets and the Library](manual/07-assets.md) | The remote library, downloading, importing your own files |

### The workspaces

| | Chapter | What you will find |
|---|---|---|
| 8 | [Image workspace](manual/08-image-workspace.md) | Paint, erase, crop, stack layers |
| 9 | [Modelling workspace](manual/09-modelling-workspace.md) | Fly through a scene, place objects and lights, adjust them |
| 10 | [Video workspace](manual/10-video-workspace.md) | Edit a sequence, cut, adjust tracks |
| 11 | [Audio workspace](manual/11-audio-workspace.md) | Trim a sound, fade it, normalise it |
| 12 | [Materials workspace](manual/12-materials-workspace.md) | Judge a material on a lit object |
| 13 | [Skyboxes workspace](manual/13-skyboxes-workspace.md) | Make a 360° sky and adjust it |

### Appendices

| | Chapter | What you will find |
|---|---|---|
| 14 | [Every setting](manual/14-settings.md) | Each setting, its starting value, its limits, what it is for |
| 15 | [Every shortcut](manual/15-shortcuts.md) | The complete list, by context, and how to change them |
| 16 | [When something goes wrong](manual/16-troubleshooting.md) | The messages, what they mean, what to do |
| 17 | [Glossary](manual/17-glossary.md) | Every word in the software, explained plainly |
| 18 | [What does not exist yet](manual/18-limits.md) | The greyed-out buttons, the work in progress, what not to expect |
| 19 | [How do I…](manual/19-recipes.md) | Sixteen step-by-step recipes, from the first click to the result |
| 20 | [Driving the studio from outside](manual/20-driving-from-outside.md) | The assistant, and the way in for a client such as Claude Code |

---

## The five-minute tour

If you only read one thing, read this. It is the whole path, from a closed application to a first
image in your project.

**1. Connect your account.**
Open settings with `⌘,` (macOS) or `Ctrl+,` (Windows, Linux). Go to **Account**. Give the account a
**name**, then paste your **API key** and **API secret**, taken from
your provider's dashboard. Click **Add an account**: the studio checks them
straight away and puts a green **In use** badge on the row.

**2. Create a project.**
`⌥⌘N` / `Alt+Ctrl+N` — or `⌘N`, then **New project**. Choose a folder and a name. A project is a **folder on your disk**: everything
you make will land inside it.

**3. Choose a workspace.**
At the top of the window, six tabs: **Image**, **Video**, **3D**, **Audio**, **Materials**,
**Skyboxes**. Click **Image**.

**4. Choose a model.**
On the left, the **Models** panel shows the catalogue. Click a thumbnail you like. The chosen
model's name appears at the top of the panel.

**5. Describe what you want.**
The **Generate** icon has just appeared in the left rail: click it, and the **Generate** panel
takes the place of Models and shows a form. The most important field is called the
**prompt**: it is your instruction sentence, preferably in English.
For example: `a small red lighthouse on a cliff, morning light`.

**6. Press Generate.**
The request leaves. Bottom right of the window, the status line shows "1 generation" with a bar that
fills. Click it for the detail. You can keep working while it runs.

**7. Collect the result.**
When the job reaches "Done", the image arrives in your account's **Library** — and in the folder
and on your disk, in the `Images/` folder. Click it: the **Inspector**, on the right, shows
its model, its prompt and its seed, and can open the folder holding it.

That is all. The rest of the manual details each of these seven steps, and the five other
workspaces.

---

## How to read this manual

**You do not have to read it in order.** Each chapter stands on its own and points to the others
when it needs to.

Three conventions recur throughout:

| What you see | What it means |
|---|---|
| `⌘S` / `Ctrl+S` | A keyboard shortcut. The first form is macOS, the second Windows and Linux |
| **Generate** in bold | The exact name of a button, panel or menu, as written on screen |
| > A quoted box | A warning, or a limit worth knowing before you hit it |

The keyboard symbols, once and for all:

| Symbol | Key | Where |
|---|---|---|
| `⌘` | Command | macOS. Replaced by `Ctrl` elsewhere |
| `⇧` | Shift | everywhere |
| `⌥` | Option / Alt | everywhere |
| `⌃` | Control | macOS |

---

## One important thing, before everything else

**Your credentials never leave your machine.** They are encrypted by your operating system's
keychain — the same vault that holds your passwords — and only the part of the software that talks
to the provider can reach them. The screen you are looking at never knows what your key is: it only
knows whether it is connected.

**Neither do your files.** Your projects are ordinary folders on your disk. What goes to the provider
is what you ask it to generate: the text of your prompt and, where relevant, the image you supply
as input.

**One exception, and it is ticked by default** — but it does not touch your files. The **Name
fetched assets** setting, under **Settings ▸ Generation**, asks the API to name a picture that
arrives without a useful one. **No byte leaves your disk**: that picture is already at the provider,
since that is where it came from, and the studio sends only its id. What does get spent is
**creative units**, with no click from you — the one place where the studio spends of its own
accord. Untick it and that stops; [chapter 14](manual/14-settings.md) covers it.
