# 6. Generating

[← Finding a model](05-models.md) · [Contents](../user-guide.md) · [Next chapter: Assets →](07-assets.md)

This is the heart of the studio: you describe, it makes.

---

## The principle, in three beats

**1. You fill in a form and press Generate.**

**2. The request leaves.** It does not come straight back. It becomes a **job**, visible in the
panel of the same name, with a progress bar.

**3. The result arrives** in your account's **Library**, then on your disk.

In between, you can keep working, switch workspace, open another document. Nothing blocks.

---

## The form

Choose a model in the **Models** panel, on the left, then open the **Generate** panel: its icon has
just appeared in the rail, and the panel takes the place of Models in the same half of the column.

**The form is not written by hand.** It is built from what the chosen model declares it can accept.
Two models therefore do not have the same form, and a model published tomorrow will have its own
too — with no update to the studio.

> If a model offers a setting the studio cannot represent, it still appears, as free text. A form
> never disappears because one field is unknown.

### The kinds of field you will meet

| What you see | What it is | What goes in it |
|---|---|---|
| A **large text area** | the *prompt* | your description |
| A **text line** | a short text | a word, a name, a value |
| A **number** | a quantity | often with a minimum and a maximum |
| A **checkbox** | yes or no | — |
| A **dropdown** | a list of imposed choices | a format, a style, a size |
| An **empty frame** reading "Drop an image…" | an input image — a reference, a mask, the image to edit | drag a project asset onto it, or paste its id |
| A **colour square** | a colour | a click opens the system picker |
| A **number with a die** 🎲 | the *seed* — see below | a number, or a click on the die |

> **A picture placed on a form goes up to the provider when you generate.** The model runs on
> the provider's servers: it can only read what the account's library holds. So the studio sends the
> project asset up, remembers the link between the two, and sends nothing the next time. You will
> find it in the **Library** panel, among what the account's library holds.
>
> A picture edited since it went up is sent again: otherwise the generation would run on a version
> you no longer see.

Fields are **grouped** when the model groups them, and some **only appear when another has the
right value** — no point offering an effect's strength when the effect is switched off.

A required field left empty **stops the send**: the form flags it rather than letting a request
leave that the server would refuse.

---

## The prompt

This is the field that matters. A few principles, in order of importance.

### Write in English if you can

The great majority of models were trained on English descriptions. A prompt in another language
sometimes works, but less well. Grammar counts for little, words count for a lot.

**You do not need a translator elsewhere**: the **Translate to English** button, above the field,
does it. See the next section.

### Describe what is there

Models understand negation badly. "Without a car" has a good chance of producing a car. Describe
the scene as you want it instead: "an empty street at dawn".

### Go from subject to detail

A structure that almost always works:

```
[the subject], [what it is doing or how it looks], [the setting], [the light], [the style]
```

For example:

```
a small red lighthouse, standing on a rocky cliff, calm grey sea behind,
soft morning light, photographic
```

### Be concrete

| Vague | Precise |
|---|---|
| "something nice" | "a clearing at sunset, low mist" |
| "a character" | "an old woman in a wool coat, three-quarter view" |
| "warm colours" | "ochre, brick red, pale gold" |

### One word per idea, not ten

Stacking forty adjectives does not make the image forty times better. Beyond thirty words or so,
most models dilute. One accurate sentence beats three vague ones.

---

## Speaking instead of typing

A button shaped like a microphone sits **in the bottom right corner of the field**. It appears on
**every** long text field of the form, not only on the prompt: a negative prompt is worth
dictating too.

**Everything happens on your computer.** Nothing you say is sent anywhere, there is no key to
enter, and dictation works with no connection at all.

### The first time

Recognition needs a model, which weighs 640 MB and is downloaded **once**. The studio never
fetches it on its own: it offers, you decide. While it downloads, the application stays entirely
usable — you can generate, draw and edit as if nothing were happening.

Your computer will also ask you to allow the microphone. If you refuse, a link takes you straight
to the system settings to change your mind: once refused, macOS never asks again.

### Dictating

Two ways, chosen in the settings:

- **Holding ⌥D** (the default). Press, speak, let go: the text appears. It is the safest — the
  microphone is never left open by mistake.
- **Toggling**: one press starts, the next stops. It rests the hand, which is better over a long
  dictation.

The shortcut works **from the field you are already writing in**, which is the whole point, and
the text lands **at the caret** — not at the end. What you had already typed is never overwritten.

This holds for every field in the studio, not only the prompt: the asset search, renaming a
layer, naming a document.

**A field's own microphone follows the same rule**, which is why it keeps the caret at home:
pressing it does not leave the field, and the sentence lands there as if you had typed it.

### What you see while it listens

While you speak, a greyed sentence appears **at the foot of the field, left of the microphone**:
it is what recognition believes it is hearing, and it corrects itself as the words come. It does
not enter the field. When you pause — or let go of the key — the sentence is settled, punctuated,
and **only then** written into the field.

A small indicator beside the microphone rises and falls with your voice. If it does not move,
the microphone is hearing nothing: check which one your computer is using.

### Worth knowing

- **Speak normally**, as you would to someone. Punctuation is added on its own; there is no need
  to say "comma".
- **One sentence at a time.** Half a second of quiet closes it. If your sentences are cut in half
  because you think out loud, lengthen that delay in the settings.
- **French works**, along with twenty-four other European languages, recognised without being
  told — you announce nothing. But remember that image models read English: dictate in your own
  language, then use **Translate to English** just below.
- **The memory is returned** after ten minutes without dictating. The next time takes a few
  seconds to load again, and that is all.

---

## Getting help writing the prompt

Three buttons sit above the field. They are not on every form: **the model is the one naming the
field to assist**, and the studio follows. A model that does not flag one shows no buttons — the
studio does not try to guess which of its fields is a prompt.

| Button | What it does |
|---|---|
| **Suggest variants** | has your draft rewritten by the model that will read it |
| **Translate to English** | rewrites your text in the language the models learned on |
| **Describe the style of the references** | sends the pictures on the form if they are not in the library yet, then writes what they have in common |

While it works, "Writing variants…" appears and all three buttons are inactive.

### What a variant offers, and how you take it

Each variant appears in its own box, with up to three things:

- **the rewritten text**, the one you will adopt;
- **the reason** for the rewrite, in italics, when the model gives one;
- **the settings** it suggests alongside the text — a ratio, a step count — listed in plain sight
  below the proposal.

Two buttons, and the difference between them matters:

| Button | Effect |
|---|---|
| **Use the text** | replaces the prompt, **and nothing else** |
| **Text + settings** | replaces the prompt **and** applies the suggested settings |

**The second only appears when there are settings to apply.** Separating the two gestures is
deliberate: overwriting a ratio you have just chosen is not a decision a suggestion makes on its
own.

> Suggested settings are **filtered against what the model declares it accepts** before being
> applied. A value out of bounds is dropped, never forced back into range.

### When these requests have nothing to do

| The request | What happens |
|---|---|
| **Translate a prompt into English**, on text that is already English | **nothing is refused**: the text comes back as it was, and the answer carries the language that was recognised |
| **Describe the style of the references**, with no image on the form | "The form carries no reference image to read a style from." |

Neither is a failure, and nothing is spent.

> **These requests do not enter the queue**: they do not show in the status line, and there is
> nothing to cancel. **Suggesting variants costs no creative units** — that is measured, not
> assumed. For translation and style reading the studio measures nothing: treat them as ordinary
> calls.
>
> **One exception to how fast they are: the first click on "Describe the style of the
> references".** A picture the library does not know yet has to go up before the API can look at
> it, and that transfer is a whole file — on a large PNG the wait is counted in seconds. The
> picture's badge then goes from **Local only** to **Synced**, and later clicks on the same
> picture are immediate. This is intended: the gesture is explicit, so the transfer is expected.
> **Nothing of the sort happens while you type** — the cost estimate never sends a picture.

---

## The project's context, in the form

If the open project carries a context, the panel shows it above the form, as it will be sent, with
a ticked box:

```
☑ Apply the project's context
┌────────────────────────────────────────┐
│ Project context —                      │
│ World: Middle Ages, 13th century…      │
│ Art direction: oil paint, chiaro…      │
└────────────────────────────────────────┘
```

**Unticking the box leaves the context out of that one shot**, without going to turn a card off in
the Context panel. The box stays as you left it for as long as the panel is open.

The price under the **Generate** button accounts for the context: what is quoted is what will be
sent.

The block is not drawn when there would be nothing to say — no card on, or a model with no
description field. What a context holds, how it is written and where it is kept are in the
[Projects](04-projects.md#the-projects-context) chapter.

---

## The settings you meet most often

They are not the same everywhere, but these names recur:

| Common name | What it does | Advice |
|---|---|---|
| **prompt** | your description | see above |
| **negative prompt** | what you want to avoid | keep it short: "blurry, text, watermark" |
| **seed** | the starting point of randomness | see below |
| **steps** | the number of calculation steps | higher = longer, not necessarily better |
| **guidance** / **cfg** | how closely the model obeys the prompt | too high and the image turns harsh and saturated |
| **width** / **height** | the dimensions | often constrained to multiples of 8 or 64 |
| **num images** | how many images at once | each one consumes credit |
| **strength** | how much a starting image is transformed | 0 = unchanged, 1 = unrecognisable |

### The seed

A number that fixes randomness.

**Two generations with the same prompt, the same model and the same seed give the same image.**
Change the seed and you get a variant.

That is what makes an image **reproducible**. Got something almost right? Keep the seed, adjust the
prompt: you explore around the same result instead of starting over.

The **die button** 🎲 beside the field draws a new random seed.

---

## Generating

The **Generate** button, at the bottom of the form.

> **No form at all?** The panel asks for a project before it draws one: it shows "Open a project
> to generate." and the two buttons that open or create one. A result has to land somewhere, and
> a generation launched without a project collects nowhere.

### The price, before you pay it

The button carries an estimate: **`~12 CU`**, next to the word Generate. That is what the
generation would cost if you pressed it now.

The figure follows the form. Change the size, the number of images, the model: it refreshes on
its own, once you have stopped typing. It is not asked for while a required field is empty —
there would be nothing to price.

> **Asking for the price costs nothing and generates nothing.** The studio sends a *dry* request:
> the API prices it and stops there. No creative unit is spent, no asset appears.

**No figure on the button?** Three cases look alike on screen, and none of them is a problem:
nothing has been asked yet, the API declined to price that model, or the request did not go
through. A price is a courtesy; its absence never stops you from generating.

> **A reference picture is not counted in the estimate.** The price is asked on every keystroke,
> and pricing a picture would mean sending it up each time. The form is therefore priced without
> it, while the API does bill for it: on a model that reads a reference, **the figure shown is
> lower than what you will pay**.

> **It is an estimate, not an invoice.** What you actually spent reads afterwards, on the
> generation's own line, and in **Help ▸ Usage…**.

---

## Following your generations

They live **in the status line**, bottom right of the window — not in a panel.

That is deliberate. A generation is minutes of waiting you spend elsewhere: it has to be readable
from any workspace, and a panel could only be in one. There, it costs no space at all.

### The summary

```
3 generations  ▓▓▓▓▓░░░░░  45%  ⌃
```

| Element | What it says |
|---|---|
| **"3 generations"** | how many are working right now |
| **The bar** | their average progress |
| **The percentage** | the same figure, spelled out |
| **The chevron** | one click opens the detail |

**When nothing is working, the summary disappears.** Unless something failed: "2 failures" stays on
screen, because a failure that vanished with the last running job is a failure nobody would have
read.

### The detail

One click opens the list above the status line. One line per generation, with the model's name and
its state.

| State | What is happening |
|---|---|
| **Queued** | the request is waiting its turn |
| **Running** | the model is working — the bar advances |
| **Done** | it is finished, the result has arrived in your assets |
| **Failed** | something went wrong — the line says what |
| **Cancelled** | you stopped it |

The **Cancel job** button stops anything not yet finished.

**Under the bar, the line says what the generation cost** — `3 CU` — or, if it failed, why.
Never both: a failed generation has no price to announce.

> **A resumed generation shows its price as soon as the studio asks where it stands again** — the
> figure travels with the job, not only with the request that started it. Until it comes back the
> line says nothing: better silent than wrong.

### The queue

The studio does not launch everything at once. It runs **three at a time** by default, and queues
the rest.

That number is adjustable: **Settings ▸ Generation ▸ Concurrent generations**, from 1 to 16.

> **Raising this number does not speed up the service.** It only makes it likelier that the provider
> refuses your surplus requests. The queue exists precisely to spread a burst rather than have it
> rejected. Three is a good balance.

### Automatic retries

When a request fails because of a dropped connection or a busy server, the studio **retries on its
own**, waiting a little longer at each attempt.

The number of attempts is adjustable: **Settings ▸ Generation ▸ Max retries**, from 0 to 10.
Four by default.

> **An invalid API key is never retried.** Retrying would not fix it. The studio distinguishes what
> is worth another attempt from what is not.

### Closing the studio does not cancel a generation

**A generation you started keeps running on the provider's side, whether the studio is open or not.**
What was missing was its ability to find it again on the way back: that is done. On the way out it
notes the requests still running; on the next launch it picks them up where they are, and their
result joins your assets as if nothing had happened.

Three things decide what you will actually see:

- **resuming is per project.** Reopen the project the request came from and it reappears in the
  status line. Another project does not show the first one's jobs, and does not lose them either;
- **resuming is per account.** A request is asked about again with the key that started it —
  another key would be turned away, and no retry repairs that;
- **past a week, a forgotten request is swept.** Long enough for training a model, which runs for
  hours, and short enough that a project abandoned mid-generation does not keep its notes for
  ever.

**Cancelling, for its part, really stops the request** — on the provider's side, not just in the
display.

### Switching accounts does not interrupt a running generation

**A job finishes on the account that launched it.** It captures its key the moment you press
Generate and keeps it to the end — including for dropping the result into your assets.

So you can launch a ten-minute video, switch to another account to go and find a model, and the
first one carries on quietly.

> What does change is **the catalogue**: moving from one account to another clears the previous
> one's remote models and assets. That is intended — they are two different libraries, and mixing
> them would have you choose a model your key cannot reach.

---

## When the result arrives

The line turns to **Done**, and the asset appears:

- in your account's **Library**, from which you can download it;
- on your disk, in `Images/`, `Video/`, `Models/`… depending on its type — or in `Materials/` when
  it is a picture that serves a material — until you file it elsewhere.

**What you can then do with it depends on its type**, and this is where the studio surprises
people most often:

| The result is… | What is possible today |
|---|---|
| a **picture** | paint on it in an **image** document, use it as the starting point of another generation, or set it as a **sky** or as a material's **base colour** |
| a **video** or a **sound** | drop it on a **timeline** (Video workspace), or edit it (Audio workspace) |
| a **panorama** | place it in a **sky** document (Skyboxes workspace) |
| a **3D object** | open it in a **scene** (3D workspace), which is born with it inside |

**A reminder about the gesture**, because it misleads: double-click **opens the asset in a tab of
its own**, in the workspace that edits its kind, without looking at what you have in front of you.
No document is needed first. To send it into a tab **already open**, use right-click or drag and
drop. See [Assets](07-assets.md).

> **A generated picture is retouched in the Image workspace**: double-click it, or drag it onto
> the canvas of an image document already open — it becomes a layer there. `⌘S` saves that
> document, layers and all, and `⇧⌘E` gets a PNG out of it. See
> [Image workspace](08-image-workspace.md).

<!-- SCREENSHOT: the Generation panel with a model's form, and the status line below with a running
     generation. Save to ../../images/generate.png -->

---

## Regenerating with the same settings

Select an asset in the Explorer and look at the **Inspector**, on the right. If it knows the
generation that produced it, it shows the model, the prompt and the seed — and offers
**Regenerate**.

One click fills the generation form with those values. Change a single one and relaunch: that is
the fastest way to explore a direction.

> The values stay in the form until another "Regenerate" replaces them. Read it as "the last
> settings used".

---

## The errors, and what they mean

| Message | Cause | What to do |
|---|---|---|
| **No credentials saved.** | no API key | **Settings ▸ AI models ▸ API keys** |
| **Invalid API key or secret.** | one of the two strings is wrong | check it, often a stray space |
| **This API key lacks the required permissions.** | the key exists but cannot do this | check your plan with your provider |
| **Too many requests. Retrying…** | you exceeded the allowed rate | nothing, the studio retries on its own |
| **The generation service is temporarily unavailable.** | server-side outage | try again later |
| **Cannot reach the generation service. Check your connection.** | your internet connection | check the network |
| **The generation failed.** | the model refused the request | often an out-of-range parameter, or a refused prompt |
| **Could not save the result to disk.** | the project folder is no longer reachable | disk full, project moved, write permissions |
| **Invalid value.** | one field of the form | the offending field is flagged |

The chapter [When something goes wrong](16-troubleshooting.md) covers these cases in detail.

---

[← Finding a model](05-models.md) · [Contents](../user-guide.md) · [Next chapter: Assets →](07-assets.md)
