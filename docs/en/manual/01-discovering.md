# 1. Discovering the studio

[← Contents](../user-guide.md) · [Next chapter: First steps →](02-first-steps.md)

---

## What this software is for

You describe what you want, in words. A distant computer makes it. You get the result on your own
machine, and you carry on working with it.

That is the whole idea. What AI Desktop Studio adds, compared to a website where you type a sentence
and download an image, is **everything that comes after**:

- your creations are **filed** in a project, on your disk, not in an overflowing "Downloads"
  folder;
- you can **assemble them** without switching applications — put a material on a 3D object, drop
  a video into an edit, build a sky, trim a sound;
- you can **find out how you made them** — the model, the prompt and the seed stay attached to
  each file, and one button replays them;
- **nothing leaves**: your files stay with you.

> **One thing worth knowing straight away:** all six document kinds save into the project
> folder and open back exactly as they were, and closing a tab that holds unsaved work asks
> before losing it. What never comes back is the undo history. The complete and honest list of
> what is still missing is the chapter [What does not exist yet](18-limits.md) — it exists to be
> read, not hidden.

## Six ways of working

The studio is not six different applications. It is one application that **rearranges itself**
according to what you are making. Those six arrangements are called **workspaces**.

| Workspace | What you make there | An example |
|---|---|---|
| **Image** | still images | a poster, an illustration, a material map |
| **Video** | moving sequences | a ten-second shot, an edit of several takes |
| **3D** | scenes with volume | a set, an object under a light |
| **Audio** | sounds and music | an ambience, a sound effect, a musical bed |
| **Materials** | materials | wood, rusted metal, fabric — to dress a 3D object |
| **Skyboxes** | 360° skies | what you see around you when you look up in a scene |

You switch workspace by clicking its name, at the top of the window. The panels rearrange
themselves, and the model catalogue filters down to what can make that kind of thing.

## The eight words to know

These are the only words you cannot do without. All the others are in the
[glossary](17-glossary.md).

### 1. A **project**

A folder on your disk, holding all your work: the files you have made, the ones you have imported,
and the way you have arranged them.

A project opens, closes, copies onto a USB stick, gets sent to someone. It is an ordinary folder —
you can open it in your file browser and look inside.

> **Without a project open, you cannot generate.** That is deliberate: an image that has been made
> has to land somewhere.

### 2. An **asset**

A raw-material file in your project: an image, a video, a sound, a 3D object, a sky.

Keep this in mind: **an asset is a finished file you can reuse**.

Assets live in the **Explorer** once they are on your disk, and in the **Library** while they are
only online.

### 3. A **document**

A work in progress, open in a tab, in the centre of the window.

The difference from an asset is the one between **material** and **work**: a generated image is an
asset; the image you are painting on, with its layers and its history, is a document.

There are six kinds of document, one per workspace:

| Workspace | Document | File extension |
|---|---|---|
| Image | a layered image | `.ora` |
| 3D | a scene | `.gltf` |
| Video | a sequence | `.otio` |
| Audio | a sound being edited | `.otio` |
| Skyboxes | a sky | `.gltf` |
| Materials | a material | `.mtlx` |

### 4. A **model**

The distant program that makes things. There are several hundred in the remote catalogue, and
they cannot all do the same thing: one draws images from text, another turns an image into a 3D
object, a third composes music.

**Choosing the right model matters as much as writing a good prompt.** The chapter
[Finding a model](05-models.md) explains how to navigate them.

### 5. A **prompt**

Your instruction sentence. The text you write to describe what you want.

It is the most important field in the generation form. A few principles, developed in
[Generating](06-generating.md):

- **write in English** if you can: most models were trained on it;
- **describe what is there**, not what is not;
- **be concrete**: "a red lighthouse on a cliff, morning light" beats "something nice".

### 6. A **job**

A request being made.

You press **Generate**, and the request leaves for the provider. It does not come straight back:
depending on the model, it takes anywhere from a few seconds to several minutes. Meanwhile, the
request lives in the **status line**, at the bottom of the window, with a progress bar, and you can
keep working — or cancel it.

A job goes through five states: **Queued** → **Running** → **Done**. Or else **Failed**, or
**Cancelled** if you stop it.

### 7. A **panel**

A small window inside the big one. Each panel does one thing: show the layers, list the models,
display what is selected.

You open and close them with a click on the **rails** — the strips of icons stuck to the left and
right edges of the window. The chapter [The window](03-the-window.md) describes them all.

### 8. A **layer**

A transparent sheet stacked on the others, in the Image workspace.

Picture tracing paper laid one sheet on another: you draw on the top one without spoiling the ones
below. You can hide one, move it up, move it down, delete it. That is what makes an image
**editable** instead of a final flat.

---

## What you need

| | |
|---|---|
| **A computer** | macOS, Windows or Linux |
| **An internet connection** | to generate. To work on what you already have, no |
| **An account with a generation provider** | with an API key and an API secret — see [First steps](02-first-steps.md) |

**What you do not need**: to know how to draw, how to program, or what a neural network is. The
studio is made to be driven, not understood.

---

## What the studio does not do

Better said now — it saves you looking.

- **It does not work offline to generate.** The making happens on the provider's servers. Without a
  connection you can open, edit, adjust and save, but not create new content.
- **It is not free to use.** Every generation consumes credit on your remote account. The studio
  does not bill you — it only forwards — but your account does count.
- **It does not replace Photoshop, Blender or Premiere.** It does a useful part of each, in one
  place, around generation. The chapter [What does not exist yet](18-limits.md) says exactly where
  the edges are.

---

[← Contents](../user-guide.md) · [Next chapter: First steps →](02-first-steps.md)
