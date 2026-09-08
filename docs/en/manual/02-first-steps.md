# 2. First steps

[← Discovering](01-discovering.md) · [Contents](../user-guide.md) · [Next chapter: The window →](03-the-window.md)

This chapter goes from no software at all to your first image, in eight steps. Allow a quarter of
an hour the first time, ten minutes of which are waiting for the install.

---

## Step 1 — Install the studio

There are two ways to get the studio onto your machine.

### You received a ready-made application

The simplest case. Double-click and follow what your system offers.

| System | What you receive | What to do with it |
|---|---|---|
| **macOS** | a `.dmg` file | open it, drag the application into **Applications** |
| **Windows** | an `.exe` installer | run it, follow the wizard |
| **Linux — Debian, Ubuntu** | a `.deb` package | open it with your desktop's installer, or `sudo apt install ./<file>.deb` |
| **Linux — everything else** | an `.AppImage` | make it executable, then launch it — nothing gets installed |

> **macOS may refuse to open the application** if it has not been signed by Apple. The message
> talks about an "unidentified developer". In that case: right-click the application → **Open** →
> **Open** again in the dialogue. This detour is only needed the first time.

### You are starting from the source code

You need **Node 24** — the version `.nvmrc` carries, and the one CI uses — and
**[pnpm](https://pnpm.io)**. Then, in a terminal, at the root of
the folder:

```bash
pnpm install          # downloads dependencies — a few minutes
pnpm rebuild:native   # recompiles the local database for your machine
pnpm ffmpeg:fetch     # downloads the ffmpeg the application ships with
pnpm start            # launches the studio
```

The second command is not optional: the studio keeps its catalogue in a small database that has to
be compiled for your exact system. Without it, the studio starts and then fails to open a project.

The third almost is: without it, importing videos works, but with no lighter copy and no waveform.
The distributed application already carries those binaries.

---

## Step 2 — Get an API key

The studio makes nothing itself. It asks the generation service, and that service needs to know who is asking. That
is what the **API key** and the **API secret** are for: a username and a password, reserved for
programs.

1. Create or open your account with your generation provider.
2. Find the API keys section in your account settings.
3. Create a key. The site gives you **two strings**: a key and a secret.
4. **Copy them straight away.** The secret is often shown only once.

> These two strings are worth your account. Do not paste them into an email, a message, or a
> shared file. If you think you have left them lying around: go back to the site, delete the key,
> create another. It takes ten seconds and invalidates the old one.

---

## Step 3 — Connect your account

1. Open settings: `⌘,` on macOS, `Ctrl+,` on Windows and Linux. Or through the menu —
   **AI Desktop Studio ▸ Settings…** on macOS, **File ▸ Settings…** elsewhere, since only macOS
   has an application menu.
2. In the list on the left, click **Account**.
3. Give it a **name** — whatever you like: "Studio", "Personal", your first name.
4. Paste your key into **API key**, your secret into **API secret**.
5. Click **Add an account**.

**Why a name?** Because the studio holds several. An API key carries its own remote project, and
you can move between them from the title bar. For a first account the name does not matter — put
down whatever comes to mind.

The studio checks with the provider immediately. Three possible answers:

| What appears | What it means |
|---|---|
| A green **In use** badge on the account's row | all is well, you can close settings |
| **Invalid API key or secret.** | one of the two strings is wrong — often a stray space at the start or end |
| **Cannot reach the generation service. Check your connection.** | it is not your key, it is your internet connection |

**Where your credentials go.** They are encrypted by your system's keychain — Keychain on macOS,
the credential manager on Windows, the desktop keyring on Linux — and filed with the studio's
settings. The part of the software that draws the screen never receives them: it only asks "am I
connected?".

> If your system offers no encryption at all, the studio **refuses to store them** rather than
> writing them to disk in the clear. This is rare, and happens mostly on Linux systems with no
> keyring.

<!-- SCREENSHOT: the Settings window, Account section, one account listed with its "In use" badge.
     Save to ../../images/settings-account.png -->

---

## Step 4 — Choose your language (optional)

Still in settings, section **General**, setting **Language**.

Three choices: **System** (your computer's language), **Français**, **English**.

**A setting you have chosen is not yet a setting you have saved.** Click **Apply**, which leaves
the window open, or **OK**, which closes it. That is the difference with the previous step, where
**Add an account** wrote straight away: settings are held aside until you confirm. A dot marks the
changed setting meanwhile, and **Cancel** drops those changes.

Once applied, the language change shows straight away — nothing needs restarting — and it touches
neither your projects nor what you write in them.

---

## Step 5 — Create your first project

`⌥⌘N` / `Alt+Ctrl+N`, or menu **File ▸ New project…** — or `⌘N`, which opens the window
offering a project as well as a document

The studio asks for **a folder**, and that folder *becomes* the project — nothing is built above
or below it. Make one from the picker if you need to (**New Folder**) and give it the name you
want the project to carry: that is the name it takes.

What it lays inside:

```
My first project/          ← the folder YOU chose
├── Images/           one folder per section of the studio: what you make there
├── Video/              and what you generate there land together
├── Audio/
├── Materials/
├── Skyboxes/
├── Scripts/
├── Scenes/           your scenes
├── Models/           your meshes
├── Animations/       your motions
├── .project.json     the project's identity card — hidden
└── .index/           the catalogue and its caches — keep this, hidden
```

The project's name appears at the top of the window. You always know what you are working in. To
change it later, double-click its row in **Your projects**: that renames the project, not the
folder.

Three answers are possible, and none of them overwrites anything:

- **the folder is already a project** — the studio opens it instead of creating one over it;
- **it already holds files** — the studio asks before settling in, and touches nothing that is
  already there;
- **it sits inside a project, or holds projects** — the studio refuses: two overlapping projects
  would claim the same files. Pick a folder beside it instead.

The chapter [Projects](04-projects.md) details each folder.

---

## Step 6 — Choose a workspace and a model

At the top of the window, click **Image**.

On the left, the **Models** panel fills up. These are the remote catalogue models capable of
making images. There are many.

For a first try, pick one at random among the featured ones: click a thumbnail. Its name appears
at the top of the panel — that is the one that will work.

> **Panel empty and talking about credentials?** Go back to step 3: the key is not stored, or it
> was refused.

---

## Step 7 — Write your first prompt

Once a model is chosen, its **Generate** icon appears in the left rail. Click it: the **Generate**
panel takes the place of Models — they share the same half of the column and take turns — and
shows a form.

**This form is not always the same.** It is built from what the chosen model can accept: two
different models do not have the same settings, and the studio discovers them instead of guessing.
That is why a model published tomorrow will also get the right form.

The field that matters is called **prompt**. Write a sentence in it. For example:

```
a small red lighthouse on a cliff, morning light, calm sea
```

English is not compulsory, but most models understand it markedly better.

The other fields all have a reasonable starting value. Leave them as they are for this first try —
the chapter [Generating](06-generating.md) explains them one by one.

---

## Step 8 — Generate, wait, collect

Press **Generate**.

Bottom right, the **status line** shows "1 generation" and a progress bar. Depending on the model,
allow ten seconds to two minutes. You do not have to sit and watch: the bar advances on its own, and
you can do something else meanwhile.

When the line reads **Done**, your image has arrived. It is filed in the **Explorer** — the
project's folder — and on your disk, in `Images/`.

**Click the thumbnail**: the **Inspector**, on the right, shows everything known about it — its
size, its weight, the model that made it, the prompt you wrote, and the *seed* that will let you
come back to it.

The **Show in folder** button, in the inspector, opens your file manager on it. That is
where you take it from to send it to anyone.

> **To retouch it**, move to the **Image** workspace: the `+` button on the left rail opens a
> document, then drag your picture onto the canvas — it becomes a layer there, and the brush, the
> eraser and the shapes apply to it. The chapter [Image workspace](08-image-workspace.md) covers
> the three ways of bringing it in.
>
> **To keep it:** `⌘S` writes the document into the project, layers and masks included, and it
> reopens just as it was — the **Explorer** panel lists what the project holds. `⇧⌘E` gets a
> flattened PNG out, which is an export and not a save.
>
> To transform the picture rather than paint it: go back to the **Generate** panel with an
> *image to image* model, and give it your picture as the starting point.

<!-- SCREENSHOT: the Generation panel with a model's form, and the status line below with a running
     generation. Save to ../../images/generate.png -->

---

## What now?

| If you want to | Chapter |
|---|---|
| Understand every piece of the screen | [The window, explained](03-the-window.md) |
| Choose your model better | [Finding a model](05-models.md) |
| Write better prompts | [Generating](06-generating.md) |
| Paint and draw | [Image workspace](08-image-workspace.md) |
| Know what the studio cannot do yet | [What does not exist yet](18-limits.md) |
| Tour every setting | [Every setting](14-settings.md) |

---

[← Discovering](01-discovering.md) · [Contents](../user-guide.md) · [Next chapter: The window →](03-the-window.md)
