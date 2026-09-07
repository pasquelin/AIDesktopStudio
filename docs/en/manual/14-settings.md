# 14. Every setting

[← Skyboxes workspace](13-skyboxes-workspace.md) · [Contents](../user-guide.md) · [Next chapter: Every shortcut →](15-shortcuts.md)

Every setting in the studio, its starting value, its limits, and what it is really for.

---

## Opening settings

`⌘,` (macOS) or `Ctrl+,` (Windows, Linux). Or the menu **Settings…**.

Settings open in **a separate window**. It lives alongside your work: you can leave it open, change
a value, watch the effect in the main window, and start again.

On the left, the list of **sections**. Above it, a **Search settings** field: type "grid",
"language", "ffmpeg", and the window shows the settings that match, whatever their section. If
nothing matches, it says so: "No setting matches this search."

### How a change is saved

Three buttons at the bottom of the window.

| Button     | What it does                                 |
| ---------- | -------------------------------------------- |
| **Apply**  | saves the changes and leaves the window open |
| **OK**     | saves and closes the window                  |
| **Cancel** | throws away the unsaved changes              |

While a setting is changed but not applied, a **dot** appears beside it, with the tooltip "Changed,
not applied yet".

> **Closing the window with pending changes does not lose them silently.** The studio asks: "You
> changed settings without applying them. What would you like to do?" — you choose **Apply** or
> **Don’t apply**.

### Going back to the original value

Each setting carries, on hover, a small **Restore the default value** button. It touches only that
one setting. To reset everything at once, see **Reset everything** in the Advanced section, below.

### A greyed-out setting

Some settings depend on another. **Grid size** is useless if the grid is not shown: it stays
visible, but greyed out, with the reason written underneath — _"Has no effect while 'Show the grid'
is off."_

Nothing is ever hidden: a setting you cannot change right now stays where it is, with its
explanation.

---

## General

_The application’s language, and what it does when it opens._

### Language

**Choice. Starts at: System.**

The language of every text in the application: menus, buttons, messages.

| Value        | Effect                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------- |
| **System**   | follows your computer's own language — **English** if that is neither French nor English |
| **Français** | French                                                                                   |
| **English**  | English                                                                                  |

> **A machine set to German, Spanish or Japanese opens the studio in English**, not in French.

Each language names itself in its own language — "Français" stays "Français" even on an English
screen.

Once applied, the change is **immediate**: nothing needs relaunching. It touches neither your projects nor what
you write in them: a prompt written in English stays in English.

> **The generation form follows too, but not always all the way.** The names of the settings a
> model offers — and the explanatory sentences under them — are written by the model, and the
> generation API only ever returns them in English. The studio translates them itself. A setting it
> does not know yet therefore stays **in English** rather than disappearing, and a model published
> tomorrow arrives in its original wording.
>
> **Seven words stay in English on purpose**: `sampler`, `scheduler`, `LoRA`, `checkpoint`,
> `prompt`, `clip skip`, `denoising strength`. **A word is left in English only where the studio
> never gives it a French name** — not in one of its own surfaces, and not in the
> [glossary](17-glossary.md).

### On opening

**Choice. Starts at: Reopen the last project.**

What the application does when you launch it.

| Value                       | Effect                           |
| --------------------------- | -------------------------------- |
| **Reopen the last project** | puts you back where you left off |
| **Open nothing**            | starts on an empty window        |

"Open nothing" is quicker to start, and calmer if you juggle a lot of projects.

### Show the home screen

**Switch. Default: on.**

The full-width screen the studio opens on: your projects, what you were working on, what is
running, and what the models can do. Unticked, the studio goes straight to the workspace you left.

**This setting and the one above are independent.** "Open nothing" only concerns the project: the
home still appears, offering to create one. To land directly in a workspace, untick this one.

What is set **on the home itself**, and not here: which bands are shown — see
[The window](03-the-window.md#the-home-screen-before-anything-else).

### Model news

**Switch. Default: on.**

The **What is moving** band, at the foot of the home, reads the models trending and the articles
posted on Hugging Face. **This is the studio's only outward call for something other than a model
or a generation**, and it goes to the host every weight of the catalogue already comes from:
nobody learns anything new. Unticked, the studio contacts nobody for that band, which stays and
says it is off.

An answer is kept for six hours, and the band shows eight rows at most, nothing older than a month: these are trends, not a ticker.

---

## Account

_API credentials, encrypted by the system keychain._

This is where you connect the studio to your generation service. Without this step,
anything to do with generation stays inert: the model catalogue is empty, the **Generate** button
does not answer.

### The studio holds several accounts

Not one. You can store as many API keys as you like, each under a name you choose — "Studio",
"Client X", "Personal".

**Why that is useful.** An API key **carries its own remote project**: its models, its assets, its
credit. Switching accounts changes **the remote library** you browse.

> **It never touches your local project.** Your folders, your images, your edits are on your disk
> and belong to no account. Switching accounts changes what you can **go and fetch**, never what you
> **already have**.

### Adding an account

The form, below the list. Three fields:

| Field          | What it is                                                          |
| -------------- | ------------------------------------------------------------------- |
| **Name**       | whatever you like, so you can tell them apart — "Studio, Client X…" |
| **API key**    | your identifier, visible as you type it                             |
| **API secret** | your password, masked with dots                                     |

Take the key and the secret from your provider, in your account
settings. Then **Add an account** — the button reads "Adding…" while it writes.

**The button stays off** until all three fields are valid.

The name obeys three rules, and the studio says which one was broken:

| Rule                             | Message when it is broken                 |
| -------------------------------- | ----------------------------------------- |
| A name is required               | "A name is required."                     |
| 60 characters at most            | "This name is too long."                  |
| Two accounts cannot share a name | "Another account already uses this name." |

Uniqueness is checked **ignoring case**: "Studio" and "studio" are the same name.

**Two other messages can appear here**, more rarely, and they are not fixed the same way:

| Message                           | What happened                                                                           | What to do                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "This account no longer exists."  | you are acting on an account deleted in the meantime — usually by another studio window | close settings and reopen them: the list is read again                              |
| "The account could not be saved." | the write failed without the studio being able to say why                               | try once more; if it recurs, see [When something goes wrong](16-troubleshooting.md) |

The first is never your fault and loses nothing. The second is the only message in this section
that deserves a second attempt.

> **The fields are cleared even on success.** That is not a bug: once sent, the key is encrypted
> by the operating system's keychain and filed out of the display's reach. That is why there is
> **no "show my key" button**.

### The account list

One row per account. On the row of the account **currently in use**, a badge:

| Badge                  | What it says                                            |
| ---------------------- | ------------------------------------------------------- |
| **In use**, green      | this account is the one working, and its key works      |
| **Not connected**, red | this account is the one working, but its key is refused |

The other rows carry none: only the active account can report whether its key works, since it is the
only one being asked.

Three buttons per row:

| Button               | Effect                                                           |
| -------------------- | ---------------------------------------------------------------- |
| **Use this account** | switches to it. Absent on the row that is already active         |
| **Rename**           | replaces the row with a text field, with **Save** and **Cancel** |
| **Remove**           | deletes the account and its key                                  |

### When the list is empty

> "No account yet. Add an API key to reach the remote library."

Nothing is stored, and nothing works: no catalogue, no generation.

### If the keychain is locked

> "The keychain did not give your accounts back. Try again once it is unlocked — nothing was
> changed."

**Nothing has been changed**: the studio refused to write rather than overwrite a list it could
not read back. Unlock your keychain, try again, everything is still there.

---

## Appearance

_Theme and control density._

### Theme

**Choice. Starts at: Dark.**

| Value      | Effect                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| **Dark**   | very dark grey background — rests the eyes in a dimly lit room              |
| **Light**  | light background — reads better in broad daylight                           |
| **System** | follows your computer's setting, and switches on its own when evening comes |

> **The background stays opaque, whatever the theme.** No transparency, no blur behind the window:
> a translucent background would falsify the perception of the colours judged on top of it.

### Density

**Choice. Starts at: Comfortable.**

Sets how big the buttons are and how tall the rows sit.

| Value           | Control height | For whom                                               |
| --------------- | -------------- | ------------------------------------------------------ |
| **Comfortable** | 28 px          | more air, easier to aim at with a mouse                |
| **Compact**     | 24 px          | more on screen, on a small display or with many panels |

### Accent colour

**Colour. Starts at: the theme's own (blue).**

The colour that marks **what is selected or under way**: the outline of the active panel, the
timeline playhead, the frame around a selection.

It changes nothing about what you make — only how the application shows you where you are. Leave it
be to keep the theme’s own.

### Text size

**Slider. From 0.85 to 1.40, in steps of 0.05. Starts at: 1.**

Makes **every text** in the application bigger or smaller at once.

- **1** is the original size, the one the interface was drawn at;
- **above**, words get larger and less fits on screen;
- **below**, the opposite.

**Buttons keep their size**: density is what handles those. The two settings are separate on
purpose — you may want large text on tight controls, or the reverse.

### Limit animations

**Checkbox. Starts at: unchecked.**

Turns off the small movements of the interface: panels appear at once instead of sliding in.

Useful in two cases: if animation tires you or makes you queasy, and on a slower machine where it
stutters instead of smoothing.

---

## Generation

_Generation queue and default models, per family._

### Concurrent generations

**Whole number. From 1 to 16. Starts at: 3.**

How many creations work **at the same time**.

The higher it is, the more you can start at once — but each may take longer to come back, and the
service can turn away the ones arriving on top (see
[Too many requests](16-troubleshooting.md)). **Three is a good balance.**

> **This setting is the only valve.** Every generation goes through the same queue, whatever
> workspace it starts from, and nothing bypasses it.

### Name fetched assets

**Checkbox.**

Automatically names a picture that arrives **without a useful name**, by asking the API what it
sees in it.

> **This is the only place where the studio spends without being asked**: clear it, and nothing
> leaves on its own any more. The naming works in batches, under a bounded queue, and every result
> takes its line in the activity journal.

**What counts as "without a useful name"**, and nothing else:

| What the studio renames                                   | Examples                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| an empty name, or a device prefix followed by a number    | `IMG_4821`, `DSC0001`, `PXL_20260809`, `photo 12`                                        |
| the names operating systems give, in both languages       | `Untitled`, `Download`, `Sans titre`, `Téléchargement`, `Image collée`, `Nouvelle image` |
| a screenshot **followed by its timestamp or copy number** | `Screenshot 2026-08-09 at 10.30.45`, `Screenshot (3)`, `Capture d'écran (2)`             |

**A name you chose is never replaced**, even when it starts with the same words: `Screenshot of
the main menu` stays as it is.

Accents make no difference to this recognition: `Capture d'écran` and `Capture d’écran` are
treated alike, including in the particular form macOS writes inside its file names.

### Max retries

**Whole number. From 0 to 10. Starts at: 4.**

When a generation fails because of a **dropped connection** or a **busy server**, the application
tries again on its own. This number says how many times before giving up.

At **0**, it never tries twice.

> **An invalid API key is never retried**, whatever this setting says. Trying again would not fix it
> — it would only delay the message that tells you what to do.

### Default model, per family

Nine sub-sections: **Image**, **Video**, **3D**, **Audio**, **Materials**, **Skyboxes**,
**Upscaling**, **Background removal**, **Vectorisation**.

The last three have no workspace of their own: they are the families the canvas edits — Upscale,
Cut out, Vectorise — reach for. The **Models** panel only shows the open workspace's family, so
**this is where, and only where, their model is chosen**.

Each holds a single setting: the model the **Generate** panel preselects when you arrive in that
workspace.

| Value                        | Effect                                                  |
| ---------------------------- | ------------------------------------------------------- |
| **Ask every time** _(start)_ | no model preselected, you choose                        |
| _a model_                    | that model is already in place when the workspace opens |

Set it once you have found the model you work with most: it saves a click every session.

> **For Upscaling, Background removal and Vectorisation, this setting is not a convenience.** It is what
> decides whether the matching edit can leave at all: with no model set, **Upscale** opens this
> screen instead of sending the picture.

---

## Workspaces

_What only makes sense inside one space: the 3D view, the edit, the image._

Only one sub-section for now: **3D**.

### Show the grid

**Checkbox. Starts at: checked.**

The squared floor of the 3D view.

It is **not part of what you are making**: it is a landmark, for where things are and how high. Hide
it to judge an image with nothing around it.

### Grid size

**Whole number. From 2 to 500 metres. Starts at: 20.** _(greyed out if the grid is hidden)_

How far the grid reaches, and therefore how many squares it has — **a square is always one metre**.

Make it bigger for a wide scene; smaller for a little object sitting near the camera.

### Fly speed

**Slider. From 0.5 to 20 m/s, in steps of 0.5. Starts at: 4.**

How fast the camera moves when you **fly** through the 3D view.

Too slow and crossing the scene takes ten seconds. Too fast and you shoot past it without seeing it.
4 m/s is roughly the pace of a running person.

### Boost

**Slider. From 1 to 10, in steps of 0.5. Starts at: 3.**

What the speed is multiplied by **while you hold the boost key** (left `⇧`, by default).

At 3 you go three times faster: enough to cross a large scene without touching the setting above.

### Field of view

**Slider. From 30° to 100°, in steps of 5. Starts at: 60.**

How much the camera takes in.

| Angle               | Effect                                          |
| ------------------- | ----------------------------------------------- |
| **narrow** (30–45°) | pulls close and flattens, like a telephoto lens |
| **60°**             | close to what an eye sees                       |
| **wide** (85–100°)  | shows far more, but bends the edges             |

### The three snapping steps

Snapping is switched on in the **scene's toolbar** (the `M` key); these three settings only say
**how far** it advances at each step.

| Setting        | Range               | Starts at | What it does                           |
| -------------- | ------------------- | --------- | -------------------------------------- |
| **Move step**  | 0.001 to 10 m, in 0.1 | **0.5 m** | how far an object advances in one step |
| **Turn step**  | 1° to 90°, in 1     | **15°**   | the angle of one rotation step         |
| **Scale step** | 0.01 to 1, in 0.05  | **0.1**   | how far the scale advances in one step |

**15° is the classic value**: twenty-four positions in a full turn, including every round angle —
30, 45, 90. Rotation counts its steps **from where the turn began**, not from zero.

### Shadow softness

**Choice. Starts at: Soft.**

The grain of a shadow’s edge.

| Value    | Effect                                        |
| -------- | --------------------------------------------- |
| **Hard** | a crisp edge, cut with a knife — the cheapest |
| **Soft** | a softened edge, closer to reality            |

**This setting says what a shadow looks like, not who casts one.** That is decided object by
object, in the Inspector — see [Modelling workspace](09-modelling-workspace.md).

### Shadow detail

**Choice: 512, 1024, 2048 or 4096. Starts at: 2048.**

The size, in pixels per side, of the map each light computes to work out what it lights.

The larger the number, the finer the shadow's edge — and **the dearer it is**: doubling this
number **quadruples** the memory used. 2048 is the right compromise; drop to 1024 if a busy scene
starts to labour, raise to 4096 for a final image.

---

## Shortcuts

_The keys that trigger each action. Click a key to replace it._

This section has its own chapter: [Every shortcut](15-shortcuts.md).

---

## Dictation

_Speaking a text instead of typing it. Everything happens on this computer: nothing you say is
sent anywhere._

The gesture is described in [Generating](06-generating.md#speaking-instead-of-typing); here is
what can be adjusted.

### Enable dictation

Unticked, dictation disappears: no microphone button beside the fields, no shortcut, and the
application loads nothing and never asks for microphone access.

### How it is triggered

**Hold the key** listens for as long as ⌥D is pressed and stops when you let go. It is the
default, and the safest: the microphone is never left open by mistake.

**Toggle on and off** starts on the first press and stops on the next. It rests the hand, which
is better over a long dictation.

### Silence that ends a sentence

In milliseconds, 600 by default. It is how much quiet before what you have just said counts as
finished, is transcribed, and is written into the field.

**Raise it** if your sentences are cut in half because you pause to think. Lower it if the text
feels slow to appear.

### Preview while you speak

In milliseconds, 700 by default. It is the interval between two previews of the sentence being
spoken — the greyed text below the field.

**It is not free**: every preview reads back everything said since the sentence began. On a
machine that struggles, previews space themselves out — the settled text never suffers for it.

**Set it to 0** to remove previews entirely: the text will then appear only at the end of each
sentence, and the machine will work far less.

### Compute threads

From 1 to 8, two by default. How many cores recognition may occupy. Higher is faster up to a
point, but every thread is a core taken away from the rest of the application — the 3D view, the
timeline, the interface.

### Free the memory after

In minutes, ten by default. The loaded model takes around 700 MB; past that long without
dictating, it is released and the memory returned. It loads itself again on the next dictation,
in a few seconds.

**Set it to 0** to keep it resident: dictation then starts instantly, at the cost of 700 MB held
for as long as the studio is open.

### Model folder

Leave it empty in the normal case: the model is downloaded beside your settings. This field is
for pointing at a model already somewhere else — an external disk, or one shared between several
accounts on the machine.

---

## Media

_Preparation of imported files: proxies and waveforms._

### Path to ffmpeg

**File path. Starts at: empty.**

**ffmpeg** is the program that can read and convert just about every video and audio format in the
world. The studio uses it for two things on import:

1. **the proxy** — a lighter copy of the video, which lets you scrub through the timeline smoothly;
2. **the waveform** — the drawing of the soundtrack, those waves that let you see where someone
   speaks.

> **The studio ships its own**, on macOS, Windows and Linux. There is nothing to install, and this
> setting is only for insisting on a different one.

**So leave this field empty**, unless you have a specific reason. The studio tries three in this
order:

1. the ffmpeg **shipped with the application**;
2. the one you point at here;
3. whatever is on your system's `PATH`.

Below the field, the studio says which it kept:

| Message                                                                  | What it means                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| "ffmpeg is available: proxies and waveforms will be prepared."           | all is well — the normal case                    |
| "ffmpeg is still not found. Importing works, without proxy or waveform." | even the application's own is missing: see below |

**The second message has become rare.** It now happens mostly to whoever runs the studio from its
source code without having run `pnpm ffmpeg:fetch`, which downloads the binaries.

> **Even then, importing still works.** Your files enter the project, play, and edit. It is simply
> less comfortable. The studio never blocks you over a missing optional tool.

The **Browse…** button opens your system's file picker.

---

## Versions

_Version tracking of the project folder, by git. Your files only._

This section governs the **Git** panel and the **History** panel. It has nothing to do with the
studio itself: what is tracked is your project folder.

### Path to git

Version tracking needs the **git** program, which is not shipped with the studio. On most
machines it is already there and this setting stays empty.

Fill it in only if you insist on a particular git. **A path holding a space is refused** — a limit
of the component that runs git, not a choice — and the application then behaves as it does when
git is missing altogether.

> **When git is missing**, the Git panel says so and offers no button: there is nothing to offer
> while the program is not there.

### Author name, Author address

What is written into every recorded version. **Leave both empty** if you already use git on this
computer: the studio then takes what git knows, and overwrites nothing.

**Both or neither**: git wants a name AND an address, and filling in only one would make every
recording fail on the other.

> **Nothing leaves or arrives unless you ask for it.** There is no automatic check: the three
> buttons of the Git panel — check, take, send — are the only moments the studio speaks to the
> server.

---

## Storage

_Where your projects are kept on disk._

### Projects folder

**Folder path. Starts at: empty.**

The folder the application **offers** when you create or open a project.

It moves **nothing**: projects already created stay exactly where they are. It is a starting
suggestion for the file picker, not a relocation.

Leave it empty to start from wherever you last were.

---

## Advanced

_What is only needed to understand a problem, or to start over._

### Log detail

**Choice. Starts at: Everything.**

How much the application says about what it is doing, in its log.

| Value                    | What is written        |
| ------------------------ | ---------------------- |
| **Nothing**              | nothing at all         |
| **Errors only**          | what failed            |
| **Errors and warnings**  | and what nearly failed |
| **Everything** _(start)_ | each step              |

"Everything" helps to understand a problem, and is chatty the rest of the time. This setting changes
nothing about what the software does — only about what it says.

**Do not confuse this log with the one on the status line.** This one is the studio's internal log:
it goes to the terminal that launched it, **and to a file**, which the button below shows. The
status line's journal does not depend on this setting — it gets its lines either way.

### Technical log

**Button: Show the technical log.**

Opens your file manager on the internal log, a file named `main.log`. The studio writes to it on
every launch, however you started it.

The file does not grow forever: past one megabyte it is set aside as `main.1.log` and a fresh one
takes over. There are **two at most**, so the trace of one launch survives the one that follows it.

This is the file you will be asked for when something fails without saying anything on screen. What
you find in it follows the setting just above: at "Nothing", not a line is written.

### Settings file

**Button: Show in folder.**

Opens your file manager where your settings are saved, in a file called `settings.json`.

| System  | Where                                                   |
| ------- | ------------------------------------------------------- |
| macOS   | `~/Library/Application Support/AI Desktop Studio/settings.json` |
| Windows | `%APPDATA%\AI Desktop Studio\settings.json`                     |
| Linux   | `~/.config/AI Desktop Studio/settings.json`                     |

Useful to copy them before moving to another machine, or to send to someone helping you understand
a problem.

> **Your API credentials are in this file, but encrypted.** They appear as an unreadable block that
> only **your** session's keychain can decrypt. Copying this file to another machine copies your
> settings there, but **not** your connection: you will have to retype the key and the secret.

### Drive the studio from outside

**Checkbox. Starts at: unchecked.**

Opens a way in **on this machine alone**, through which a program outside — an MCP client such as
Claude Code — can run the same actions the assistant runs.

**Unchecked, nothing is listening.** That is the state of a fresh install, and of every launch for
as long as the box stays unticked.

**Anything that spends, uploads or touches your files asks for a yes on screen**, exactly as if you
had asked for it yourself in the assistant. A program outside cannot give it on your behalf.

> **[Chapter 20](20-driving-from-outside.md) is this setting's own**: what guards that way in, how
> to connect Claude Code to it, the families of actions it reaches and what each one commits.

### Connection command

**Button: Copy.**

Copies the line to paste in a terminal to connect a client:

```
claude mcp add <name> -- "/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio" --mcp-stdio=…
```

**It holds no port and no token**: it names the studio as a program to start, not an address to
reach. Those do change at every start — and it is your client that reads them, at the moment it
needs them. **So the line is pasted once, and holds for every launch after it.**

The path is the one of **your** installation, hence the button rather than a value printed here.

### Developer tools

**Button: Open.**

Opens the technical console of the embedded browser: the log messages, the errors, the internal
state of the display.

**In the build you installed, this button opens nothing** — the console is refused there, for
security. It stays on screen, with no effect. You are missing nothing: **the activity journal
already carries what a report needs**, technical detail included. See
[When something goes wrong](16-troubleshooting.md#the-log).

For troubleshooting only, in a development build. **Nothing in there is needed to use the
software.**

### Reset everything

**Button: Reset.** _(with confirmation)_

Puts **EVERY** setting back to a fresh install: theme, language, shortcuts, default models, all of
it.

The studio asks for confirmation first:

> _Reset every setting? Your projects are untouched, but this cannot be undone._

**Your projects, images and edits are untouched.** Only the settings are.

> **There is no going back.** This button does not pass through the editing buffer: there is no
> **Cancel** to catch it. That is why it asks for confirmation, unlike the other settings.

---

## Dashboard: every starting value

What you have on a fresh install, at a glance.

| Section    | Setting                       | Start                   | Limits                          |
| ---------- | ----------------------------- | ----------------------- | ------------------------------- |
| General    | Language                      | System                  | System, Français, English       |
| General    | On opening                    | Reopen the last project | —                               |
| General    | Show the home screen          | on                      | —                               |
| General    | Model news                    | on                      | —                               |
| Appearance | Theme                         | Dark                    | Dark, Light, System             |
| Appearance | Density                       | Comfortable             | Comfortable, Compact            |
| Appearance | Accent colour                 | the theme's own         | —                               |
| Appearance | Text size                     | 1                       | 0.85 to 1.40                    |
| Appearance | Limit animations              | unchecked               | —                               |
| Generation | Concurrent generations        | 3                       | 1 to 16                         |
| Generation | Name fetched assets           | ticked                  | —                               |
| Generation | Max retries                   | 4                       | 0 to 10                         |
| Generation | Default model ×7              | Ask every time          | —                               |
| 3D         | Show the grid                 | checked                 | —                               |
| 3D         | Grid size                     | 20 m                    | 2 to 500                        |
| 3D         | Fly speed                     | 4 m/s                   | 0.5 to 20                       |
| 3D         | Boost                         | 3×                      | 1 to 10                         |
| 3D         | Field of view                 | 60°                     | 30 to 100                       |
| 3D         | Move step                     | 0.5 m                   | 0.001 to 10                     |
| 3D         | Rotate step                   | 15°                     | 1 to 90                         |
| 3D         | Scale step                    | 0.1                     | 0.01 to 1                       |
| 3D         | Shadow softness               | Soft                    | Hard or Soft                    |
| 3D         | Shadow detail                 | 2048                    | 512, 1024, 2048, 4096           |
| Dictation  | Enable dictation              | on                      | —                               |
| Dictation  | How it is triggered           | Hold the key            | Hold the key, Toggle on and off |
| Dictation  | Silence that ends a sentence  | 600 ms                  | 200 to 2000                     |
| Dictation  | Preview while you speak       | 700 ms                  | 0 to 2000                       |
| Dictation  | Compute threads               | 2                       | 1 to 8                          |
| Dictation  | Free the memory after         | 10 min                  | 0 to 120                        |
| Media      | Path to ffmpeg                | empty                   | —                               |
| Storage    | Projects folder               | empty                   | —                               |
| Advanced   | Log detail                    | Everything              | Nothing → Everything            |
| Way in     | Drive the studio from outside | unchecked               | —                               |
| Way in     | Let it touch files without asking | unchecked           | —                               |
| Way in     | Let it upload without asking  | unchecked               | —                               |
| Way in     | Let it publish to a server without asking | unchecked    | —                               |
| Way in     | Creative units spendable without asking | 0                 | 0 to 10,000                     |

---

## Two settings that do not exist yet

Two values live in the settings file with no control editing them:

- **the last project opened** — written on its own every time a project opens. That is session
  memory, not a preference: nothing to set;
- **where assets are kept** — a choice between "on your disk" and "in the cloud", the second of
  which does not exist yet. See [What does not exist yet](18-limits.md).

---

[← Skyboxes workspace](13-skyboxes-workspace.md) · [Contents](../user-guide.md) · [Next chapter: Every shortcut →](15-shortcuts.md)
