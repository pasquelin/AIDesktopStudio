# 9. Modelling workspace

[← Image workspace](08-image-workspace.md) · [Contents](../user-guide.md) · [Next chapter: Video workspace →](10-video-workspace.md)

The workspace where you build a scene with volume: objects, lights, a camera that moves through it.

---

## Opening a scene

The **+** button on the left rail creates a fresh scene. A project must be open.

The window that opens asks for a name, then **what the scene opens on**: ten templates, under
the name. The choice applies at creation only — an open scene does not change template.

| Template                                         | What it lays down                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Empty**                                        | three lights and nothing else. The starting point for building everything yourself                                                                                       |
| **Basic**                                        | a floor, a sun, a fill light, a camera, and a one-metre cube — the cube says how big a metre is, so delete it as soon as an object of your own arrives                   |
| **Photo studio**                                 | a white curved backdrop, a floor, and three lights placed as in a studio                                                                                                 |
| **Cinematic**                                    | a wide floor, a raking light, a camera and its **rail** — the shot is already a move                                                                                     |
| **Architecture**                                 | a very wide floor, a low sun, a sky, and a camera at eye height                                                                                                          |
| **First person**, **Third person**, **Top down** | all three open on the **test level** below, and differ only in where the camera stands                                                                                   |
| **Car**                                          | the same test level, with a car parked at the start — four suspended wheels, an engine, steering. `W` `S` accelerate and brake, `A` `D` steer, `Space` is the hand brake |
| **Aircraft**                                     | an airfield, a runway, and a plane **already flying** at 120 m. `W` `S` pitch down and up, `A` `D` roll, `Q` `E` yaw, `⇧ Shift` and `Ctrl` open and close the throttle   |

A scene is black until a light is placed: that is normal, and the Lights panel says so. Only the
**Empty** template can take you there, by deleting its lights.

### The test level

The three character templates open on a set built to be **walked**: a floor 40 m by 32, a wall
around it, a sunken court with its stair, a plank across it, a terrace and its ramp, a walkway
spanning the court, three jump blocks at widening gaps, pillars, and a blue pad on the floor
marking the start.

Every part is a shape of the studio, filed under three groups — **Ground**, **Enclosure**,
**Course** — in the Scene panel. Everything there moves, resizes and deletes like any other
object: it is a working set, not a fixed one.

The colours say a role: grey for what is walked on, dark grey for walls and what is gone round,
**orange for everything that is climbed** — ramp, steps, blocks, walkway.

---

## Moving through the scene

Three ways to move, which coexist.

### Orbiting the scene — the mouse alone

| Gesture                              | Effect                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| **Alt + left-click + drag**          | turns the view                                                         |
| **Left-click + drag**                | draws a **selection rectangle** — see _Selecting more than one object_ |
| **Middle button + drag**             | slides the view sideways                                               |
| **Shift + Alt + left-click + drag**  | the same, for a trackpad with no middle button                         |
| **Wheel**                            | moves forward and back, **towards whatever the pointer aims at**       |
| **Alt + right-click + drag**         | moves forward and back, towards the point the view turns around        |
| **Two fingers** on a touch screen    | pinching moves in and out, dragging slides sideways                    |
| **Right-click + drag** _(see below)_ | flies                                                                  |

This is the default mode. You turn **around** the scene, as if walking round it. These are the
gestures of Unity, Unreal and Maya: if you come from any of the three, there is nothing to relearn.

> **The wheel travels towards what you aim at, and stops at nothing.** The point the view turns
> around moves onto whatever the pointer names, and the camera **crosses** it if you keep going —
> there is no invisible wall to slow down against and never reach. The step follows the distance
> of what you aim at: wide far off, fine up close.

#### What the view turns around

This is the question that loses you your scene when nobody answers it. Three answers, in order:

1. **What is selected**, while it is on screen — the very point the gizmo sits on. That is the
   _Orbit around selection_ setting, on out of the box;
2. **What the pointer is over** as the gesture begins, if you turned _Orbit under the cursor_ on
   in the settings;
3. otherwise, **the last point looked at** — the one the wheel, a sideways slide or <kbd>F</kbd>
   put there.

Both preferences live in **Settings ▸ Workspaces ▸ Modelling**. A selection off screen never serves as a
point of rotation: the view would set off to find it.

> **<kbd>F</kbd> frames the selection**, and puts the point of rotation back on it. That is the
> gesture to remember when you no longer know where you are — it is the same in Blender, Unity,
> Unreal and Maya.

> **<kbd>⇧F</kbd> frames it AND follows it.** While the follow holds, whatever moves takes the
> view along with it, at the angle and the distance you chose: enough to watch a character walk
> without running after them. A second press lets go, and so does an emptied selection.

### Driving the view like another application

Coming from Unreal, Unity, Blender or Roblox Studio, there is nothing to relearn: **View ▸
Navigation** in the menu, or **Settings ▸ Workspaces ▸ Modelling**, changes the scheme of
gestures AND of shortcuts in one go.

| Scheme            | Turn        | Slide sideways                     | Move in and out   | WASD                                            | Move / Rotate / Scale |
| ----------------- | ----------- | ---------------------------------- | ----------------- | ----------------------------------------------- | --------------------- |
| **AI Desktop Studio**     | Alt + left  | middle                             | Alt + right       | a button held                                   | `G` `R` `S`           |
| **Unreal**        | Alt + left  | middle, or **right added to left** | Alt + right       | **right button held**                           | `W` `E` `R`           |
| **Unity**         | Alt + left  | middle                             | Alt + right       | **right button held**                           | `W` `E` `R`           |
| **Blender**       | **middle**  | **Shift + middle**                 | **Ctrl + middle** | Walk/Fly mode, on <kbd>Shift</kbd>+<kbd>`</kbd> | `G` `R` `S`           |
| **Roblox Studio** | Alt + left  | middle                             | Alt + right       | **always**                                      | `G` `R` `T`           |
| **Custom**        | your choice | your choice                        | your choice       | your choice                                     | yours                 |

**The bare left button no longer turns the view, under any scheme**: it draws the selection
rectangle, as it does in Unity and Blender. Turning is Alt + left — the gesture three of the five
already give.

**Unreal's two-button pan**: press the **left** button first, then add the **right** one. In that
order and no other — here the right button flies the camera, and a flight already armed does not
hand the view back to a sideways slide.

> **A scheme only replaces what its own application does differently.** Everything it says
> nothing about keeps AI Desktop Studio's keys — including the commands the others have no equivalent
> for. And your own remaps, made in **Settings ▸ Shortcuts**, always win over the scheme.

> **Going back to "AI Desktop Studio" resets the shortcuts.** It is the scheme every other one falls back
> to: choosing it gives each command the key the software declares.

**Roblox moves two shortcuts, and it cannot be helped.** There the letters belong to the camera
with nothing held, so `S` can no longer scale: it moves to `T`, and _Add_ moves from <kbd>⇧A</kbd>
to <kbd>⇧N</kbd>. Avoiding exactly this is why Unity and Unreal ask for the right button. The
arrow keys stay with the interface in every case.

**Blender brings its keypad too.** Under that scheme alone: <kbd>1</kbd> front, <kbd>3</kbd>
right, <kbd>7</kbd> top, each with <kbd>Ctrl</kbd> for the opposite side; <kbd>5</kbd> switches
between perspective and orthographic, <kbd>0</kbd> draws the view through the chosen camera and
steps back out on a second press, and <kbd>.</kbd> frames the selection. These are the keys **of
the keypad**, told apart from the digits of the top row whether the number lock is on or not.

**The custom scheme** opens four more choices in the settings — what to turn with, what to slide
with, what to move in and out with, and when the letters belong to the camera. The keyboard
itself is customised from the shortcuts screen, whichever scheme is chosen.

### Flying through the scene — a button held

**Hold a mouse button**, left or right, and the keys below move the camera. Without letting go:

| Key             | Movement                   |
| --------------- | -------------------------- |
| `W` `A` `S` `D` | forward, left, back, right |
| `↑` `←` `↓` `→` | the same four directions   |
| `E`             | up                         |
| `Q`             | down                       |
| `⇧ Shift`       | boost                      |

You move **through** the scene instead of around it, as in a video game. Release the button and
the camera returns to its normal mode.

The button keeps everything it already did: the left one goes on turning around the scene and
picking on release. The keyboard is added, it replaces nothing.
One reservation: while you hold a tool's handle the keys do not move the camera — otherwise one
gesture would move both the object and the point of view.

> **The keys are read at their physical position.** WASD on a QWERTY keyboard and ZQSD on an AZERTY
> one are **the same four keys**. There is nothing to reconfigure.

### Navigating continuously — the mode, holding nothing

The **Navigate** button in the toolbar, or the <kbd>`</kbd> key (the one under Escape), arms a
mode where there is **nothing left to hold**:

- the **mouse becomes the view** — it disappears, and the view follows it;
- the **same keys** as above move the camera;
- the **wheel sets the speed** instead of moving the camera, for the length of the session;
- <kbd>Esc</kbd> gives the mouse back and leaves the mode.

The keys are recalled for a few seconds at the bottom of the viewport each time the mode is armed.

> **While the mode is armed, the letters belong to the camera.** <kbd>S</kbd> backs away and does
> not call the Scale tool; the tools take their keys back the moment you leave.

Three settings govern flying: **Settings ▸ Workspaces ▸ Modelling**

| Setting           | What it does                         | Default |
| ----------------- | ------------------------------------ | ------- |
| **Fly speed**     | metres per second                    | 4       |
| **Boost factor**  | what Shift multiplies the speed by   | 3       |
| **Field of view** | what the camera takes in, in degrees | 60      |

---

## The toolbar

| Tool                | Shortcut | What it does                                                                            |
| ------------------- | -------- | --------------------------------------------------------------------------------------- |
| **Select**          | `V`      | picks an object without arming a handle                                                 |
| **Move**            | `G`      | drags the object along the coloured arrows                                              |
| **Rotate**          | `R`      | turns the object with the coloured circles                                              |
| **Scale**           | `S`      | grows or shrinks it with the handles                                                    |
| **All snaps**       | `M`      | turns all four snaps on or off at once; a second press gives back the ones that were on |
| **Local frame**     | `L`      | lines the handles up with the **object's** orientation rather than the world's          |
| **Display mode**    | `Z`      | cycles the nine ways of drawing; hovering offers them one by one                        |
| **Frame selection** | `F`      | recentres the camera on the chosen object                                               |
| **Navigate**        | `` ` ``  | arms continuous flight: the mouse holds the view, the keys travel                       |

The bar carries only what the hand asks for **without letting go of the mouse**. The rest is in
the native menu:

| What is not in the bar                                   | Where to find it                                |
| -------------------------------------------------------- | ----------------------------------------------- |
| Projection, four views, quad edges, skeletons, pose mode | **View**, as ticked rows                        |
| The six sides, the nine display modes                    | **View ▸ Point of view** and **▸ Display mode** |
| Adding a mesh, a light, an object                        | **Add**                                         |
| Duplicate, group, delete                                 | **Edit**                                        |
| Copy, cut, paste                                         | **the keys alone** — see below                  |

**Snapping is for lining things up.** Without it an object lands 1.0374 m from the previous one;
with it, at a round 1 m.

### The bar at the top — what you set while manipulating

A second bar floats **at the top of the viewport**, horizontal. It carries no tools but
**behaviours**: what you change _while_ manipulating, without letting go of the mouse.

Each entry is a group of **two zones**. The icon, on the left, **turns that one snap** on or off
and nothing else. The value, on the right, **opens a menu** on hover, as the tool bar's own menus
do — a click on it puts the menu away. Choosing a step **arms that snap along with it**: reaching
for a step is asking for the snap, and leaving it off cost a second click on every first use.

The steps are laid out **in columns**, not as a list: a value is found by eye, and a column of
nine steps covered the very scene it was about to change. The step in force is **painted where it
stands** — not marked by a tick at the other end of a list.

| Entry            | What the icon toggles                            | What the menu sets                                         |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **Camera speed** | _(nothing: it has no toggle)_                    | rungs from 0.5 to 20 m/s, and a free run between them      |
| **Surface snap** | lays what you drag on the first surface below it | whether it follows the slope, and how far above it floats  |
| **Grid snap**    | advances a move in even steps                    | the step, from 1 cm to 10 m                                |
| **Angle snap**   | turns in even steps                              | the angle, as an increment or as a division of a full turn |
| **Scale snap**   | changes the scale in even steps                  | the ratio                                                  |

The bar sits at the **top right** of the viewport; the tool column already owns the left.

**The four are independent.** Laying a prop on a table while its angle stays free is the gesture
the single toggle could not spell. The **All snaps** button of the vertical bar, and the `M` key,
turn every one of them off at once — and a second press gives back exactly the ones that were on.

**The speed on the bar is the speed of flight.** It is the same value the wheel sets while the
Navigate mode is armed: the two cannot contradict each other.

The steps themselves are **settings**, shared by every document; the four switches belong to the
document in hand. The same steps are in **Settings ▸ Workspaces ▸ Modelling** and in the
**Environment** panel.

**The surface snap is the one that counts in no steps**: it casts a ray downwards from what you
are dragging and lays it on whatever it meets. It only acts during a **move** — not during a
rotation or a resize.

**The handles never grow past the object they hold.** On a small part they follow its size and
shrink with it as you pull back; beyond that they keep one size on screen rather than growing
without end — or they would be impossible to grab from afar. The ceiling is set in
**Settings ▸ Workspaces ▸ Modelling ▸ Handle size**.

A light and a camera have no volume to measure: their handles keep the size of the setting, or
there would be nothing left to grab.

**The local frame shows on a turned object.** With world handles, the red arrow always points
east. With local handles it points to the **object's** right: which is what you want to drive a
car forwards along the way it faces.

### The coloured handles

When a manipulation tool is armed and an object is chosen, handles appear around it. The colour
code is universal:

| Colour    | Axis | Direction      |
| --------- | ---- | -------------- |
| **Red**   | X    | left ↔ right   |
| **Green** | Y    | down ↔ up      |
| **Blue**  | Z    | forward ↔ back |

Drag an arrow to move along that axis only.

> A complete drag — from press to release — counts as **one** action in the history. `⌘Z` undoes it
> in one go.

---

## Placing objects

Three paths lead to the same place:

- the **Add** menu, which files the three families — mesh, light, object;
- the **+** buttons of the **Meshes** and **Lights** panels;
- dragging and dropping, for a model coming off the Explorer.

The object lands at the **scene origin** — the centre of the world, where the axes cross.

### Bringing in an existing model

The shapes below are the ones the studio can **build**. A model from elsewhere — generated by a
_text to 3D_ model, or imported from a `.glb` — comes in through the Explorer:

| Gesture                                 | Result                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Double-click** a mesh in the Explorer | the **Model tab** opens on the file — `.glb`, `.fbx`, `.obj`, `.stl`, `.ply` or `.usdz`. A `.gltf` is a **scene**, and opens as one |
| **Drag and drop** onto the 3D view      | it enters the scene **in front of you** — anywhere on the view, toolbar included                                                    |
| **Right-click ▸ Add to the scene**      | the same, without aiming at the view — a scene open anywhere is enough                                                              |

**Double-click never looks at the tab in front**: it opens the asset in the workspace of its kind,
whatever is on screen. It is the studio-wide rule, described in [Assets](07-assets.md) — to bring a
mesh into the scene you have in front of you, use drag and drop or right-click.

**Only meshes come into the scene** — but a missed drop is not a lost one. A picture, a sound or a
video dropped on the 3D view **opens in its own workspace**, exactly as a double-click would.
Nothing says so before you let go: the pointer shows the same `+` as for a mesh.

Like everything else, the model lands **at the origin**. It sometimes arrives tiny or enormous — a
`.glb` carries its own scale, which has no reason to match yours. The scale handle (`S`) settles
that in one gesture, and `F` frames the camera on it.

### The available meshes

A _mesh_ is a geometric object.

| Shape            | What it looks like                        |
| ---------------- | ----------------------------------------- |
| **Box**          | a box                                     |
| **Sphere**       | a ball                                    |
| **Capsule**      | a cylinder with rounded ends, like a pill |
| **Circle**       | a flat disc                               |
| **Cylinder**     | a solid tube                              |
| **Plane**        | a flat sheet                              |
| **Ring**         | a disc with a hole                        |
| **Torus**        | a doughnut                                |
| **Torus knot**   | an interwoven doughnut                    |
| **Tube**         | a bent pipe                               |
| **Lathe**        | a shape made by spinning a profile        |
| **Tetrahedron**  | 4 triangular faces                        |
| **Octahedron**   | 8 faces                                   |
| **Dodecahedron** | 12 faces                                  |
| **Icosahedron**  | 20 faces                                  |

### Text — words in volume

**Add ▸ Object ▸ Text** drops a text into the scene, already written and already readable. The
inspector shows three things about it: the **content**, the **font**, and the numbers that give
the letters their shape — the **size**, the **depth** (set it to zero for flat letters) and the
**curve segments**, which decide how finely the curves are cut.

A text is lit like a mesh and wears the same **material**: colour, roughness, metalness, and the
five images. It casts and receives shadows.

#### The fonts on offer

The list opens on the **three fonts the studio ships** — Lato, IBM Plex Serif, IBM Plex Mono —
then on **whatever your machine has installed**. The first three travel inside the application: a
scene that uses them opens identically on any machine.

A system font does not. It stays written in the document, but if you open the scene elsewhere and
the font is not there, two things happen: the list shows its name followed by **"(missing)"**, and
the letters are drawn in the default embedded font so the text stays visible. The document itself
is not rewritten — go back to the machine that has the font, and the scene is what it was.

> Some older system fonts will not open: the font-reading library the studio uses does not read
> every table format they use. The name stays in the list, the text falls back to the default
> font, and the log says which one failed.

### The sprite — a picture facing the camera

A _sprite_ is not a mesh: it is a flat picture that always turns towards you, whatever the view
does. It is what you use for a spark, a glow, a marker, a label above an object — anything that
has to stay readable from wherever you look.

**Add ▸ Object ▸ Sprite** puts one at the origin. It arrives with no picture: choose one in the Inspector,
under **Sprite**, from the project's own images — the same ones a material takes into a channel.

| Setting     | What it does                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| **Colour**  | tints the picture. On a sprite with none, it is the colour of the quad itself |
| **Opacity** | from transparent to opaque                                                    |
| **Image**   | the picture shown, taken from the project's assets                            |

Four things to know:

- **Its size is its scale.** A sprite has no width of its own: you resize it with the scale handle,
  like any other object. It shrinks with distance, like everything else in the scene.
- **It does not turn.** Selected on its own it gets no **Rotate** handle and no **Rotation** row
  in the Inspector. Two cases do turn it for real:
  - **Objects hang under it.** It gets its handle and its row back: turning the whole thing swings
    the children around it.
  - **It is caught in a selection of several objects, and you drag the handle.** That turns the
    group around a shared pivot, which carries the sprite through space. **The Inspector's
    Rotation row does not do the same thing**: a typed angle is **absolute** and lands on each
    object around its own origin, with no shared pivot, so the sprite does not move. The row stays
    visible as long as one object of the selection turns, and the typed angle goes to those.
- **It has nothing to do with shadows.** It throws none and catches none; the Inspector therefore
  shows it no Shadows section at all.
- **It is not lit.** Its colour is the one you give it, not the one the scene's lights make of it.

### The path — a camera's rail

A _path_ is a curve laid into the scene. It never shows up in a rendered picture: it is a rail, and
a camera can run along it during a shot.

**Add ▸ Object ▸ Path** puts one at the origin, with two points. Its **knobs** — one bead per
point — only appear while it is being worked on: the path selected, or a selected camera that
rides it during a shot. They keep their size on screen, wherever the view stands.

Four gestures, in the scene:

| Gesture                           | What it does                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Click a knob**, path selected   | picks it: the move handles attach to it, and it is dragged like an object                                                             |
| **⌥ + click on the curve**        | puts a new point in the stretch clicked, and picks it straight away                                                                   |
| **⌥ ⇧ + click anywhere**          | **extends the path**: the point lands at its end, where you just aimed. This is the gesture that draws a trajectory click after click |
| **Delete**, or right-click a knob | takes the picked point away. A path always keeps its last two points                                                                  |

**⌥ ⇧ + click lands on whatever you click** — the floor, a wall, a crate. Where the ray meets
nothing, the point lands **at the height of the point before it**, which keeps a trajectory level
when clicking into the void. Every click is one `⌘Z`, so a trajectory unwinds point by point.

**Whatever is not scenery is passed through**: workshop markers — a camera's body, a lamp's bulb —
paths themselves along with their knobs, and anything hidden by the eye in the Scene explorer. A
camera standing on its own rail is therefore no obstacle to the gesture that extends that rail.

> **One path has to be the one worked on.** The gesture serves the selected path, or the one the
> selected camera rides. With two paths worked on at once it extends neither, rather than
> choosing for you — **and it does nothing else either**: `⌥ ⇧` is reserved for drawing, and
> never changes the selection mid-trajectory.

The Inspector, section **Path**, holds **Tension** — from sharp corners to a round curve — and
**Closed**, which loops it back onto the first point. The **+** on the **Points** row adds a
point at the end, without aiming in the view: the path carries on in the direction it was
taking. On a **closed** path, which has no end, the point lands in the stretch that comes back
to the first one.

### The available lights

Without a light, the scene stays black.

| Light           | What it does                                     | When to use it                     |
| --------------- | ------------------------------------------------ | ---------------------------------- |
| **Ambient**     | lights everything, evenly, with no shadow        | to lift the blacks                 |
| **Directional** | parallel rays, like the sun                      | the main light of an outdoor scene |
| **Hemisphere**  | one colour from the sky, another from the ground | a soft, natural outdoor look       |
| **Point**       | radiates in every direction from a point         | a bulb, a candle                   |
| **Spot**        | a cone of light                                  | a stage spot, a lighthouse         |

**To start with**: a **directional** for the main light, plus a weak **ambient** so the shadows are
not completely black. That is the classic recipe.

---

## Looking at the scene differently

Three buttons, between the toggles and the framing. They change nothing of the scene: they change
how it is looked at. None of it is saved with the document, and `⌘Z` never touches it.

### Projection — `O`, or **View ▸ Projection**

In **perspective**, receding lines converge: that is what an eye sees, and it is the default. In
**orthographic**, parallels stay parallel and an object keeps its size whatever its distance.

That is what lets an alignment be judged. Two cubes set side by side look offset in perspective; in
orthographic they either are or they are not.

The swap keeps whatever sits at the centre at the same size — the camera moves to do so, and how
far away it stands therefore changes.

### Stand at — **View ▸ Point of view**

**Front**, **back**, **left**, **right**, **top**, **bottom**. The camera goes and stands on the
matching axis, at the distance it already had, looking at the point it was turning around.

Together with the orthographic projection, that is the classic plan view — the one you align on.

### Display mode — `Z`, or **View ▸ Display mode**

| Mode                     | What is drawn                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Shaded**               | surfaces painted by their material, edges left out                                  |
| **Wireframe**            | the edges alone — which is what shows how dense the mesh is                         |
| **Shaded and wireframe** | surfaces painted, with the edges drawn over them                                    |
| **Solid**                | plain clay on every surface: the shape, without the materials                       |
| **Material preview**     | the materials under the studio light alone, with the scene’s own lights out         |
| **Matcap**               | lighting captured on a sphere: it is the relief that reads, not the colour          |
| **Density**              | green to red by triangles per unit of surface: what is red is what to optimise      |
| **Translucent**          | surfaces barely there, so the joints inside can be seen                             |
| **Skeleton only**        | no surface at all: the bones are all that is left, to be put right without guessing |

The button wears the current mode and cycles it on each click; its menu picks one directly. `Z`
does the same from the keyboard — **and in four views, on the quarter under the
pointer**: each quarter keeps its own mode.

**Shaded and wireframe** is the costly one: the edges are one more object per mesh, built when it
is turned on and thrown away when it is turned off. On an imported model of several thousand
meshes, it shows.

### Four views — `⇧Q`, or **View ▸ Four views**

The viewport splits in four. **The top-left quarter keeps the framing you had**; it returns to
perspective if you were in orthographic projection. The other three arrive orthographic: **top** at
the top right, **front** at the bottom left, **left side** at the bottom right.

**All four are work surfaces**, not previews: the transform handles follow the quarter your pointer
is in. You can select and move in any of them.

**A view's name, in the top right of its quarter, is also how you change it.** Seven choices: the
free view and the six sides. Nothing ties you to the starting layout — two perspectives and two
axes are just as askable.

**Only the free view turns.** Dragging inside a side quarter does not spin it: a top view that tips
over is no longer a top view, which is exactly what it is there for. **The view decides, never the
projection** — putting the free view into orthographic with `O` does not stop it turning. Panning
and zooming work everywhere.

**Changing one quarter's view reframes every side quarter** onto the whole scene: they have no
framing of their own to return to. Only the free view keeps its own.

### Quad edges — `⇧W`

In wireframe, the studio redraws the edges **without the diagonals triangulation added** — a cube
loses the ones that crossed its faces, one per face.

**It is a reconstruction, not a reading of the file**: a GLB stores triangles only. Two triangles
whose shared edge separates near-coplanar faces are read back as one quad. **On a strongly curved
surface the reconstruction is wrong** and erases an edge the modeller meant to keep.

---

## Selecting more than one object

**A click replaces the selection. A click with `⇧`, `⌘` or `Ctrl` adds to it or removes from it** —
clicking an already-chosen object again takes it out of the selection.

| Gesture                                | Effect                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| **Click** an object                    | it becomes the selection, alone                                 |
| **`⇧`/`⌘`/`Ctrl` + click**             | it joins the selection, or leaves it if it was in               |
| **Click in the void**                  | everything is deselected                                        |
| **`⇧`/`⌘`/`Ctrl` + click in the void** | **nothing changes** — a miss must not undo patient sorting      |
| **Left-click + drag**                  | draws a rectangle: everything it touches is chosen              |
| **`⇧`/`⌘`/`Ctrl` + drag**              | the rectangle **adds** to the selection instead of replacing it |

**The rectangle takes what it touches**, not only what it encloses whole: a floor is always
larger than the rectangle drawn on it. A drag that crosses nothing empties the selection, as a
click in the void does. In pose mode it names a **bone** — the one nearest the camera among those
it crosses — and never an object.

Everything that follows — moving, turning, deleting, grouping, duplicating, adjusting in the
Inspector — acts on the **whole** selection, not only on the last object clicked.

---

## Grouping

**`⌘G`**, or **Edit ▸ Group**.

A group files several objects under one parent. **Moving the group moves them all**, and it folds
away with one click in the Scene panel — a scene of thirty objects becomes readable again.

Two ways to undo or redo a filing:

- **`⌘Z`** takes the grouping back, like any other action;
- **dragging one line onto another**, in the Scene panel, files it underneath. To take an object
  **out** of its group, release it on the **first line**, the one carrying the scene's name: that
  is the root.

The receiving branch **unfolds by itself** after the drop — otherwise the object you have just
filed would vanish from the screen, and you would think it lost.

> **A group cannot descend into its own contents.** The studio refuses the drop rather than
> building a loop. Likewise, releasing a line where it already was does nothing — no action, no
> history entry.

---

## Carve, join, intersect

**Edit ▸ Carve**, or the toolbar buttons, after the grouping one.

Set a cube inside a wall, select both — **in whichever order you like** — then **Carve**: the wall
gains a window. That is the whole principle. **The biggest shape is the material**, the others are
the tools that carve it, and the order of the clicks changes nothing.

One way to mark, three to combine, and two to go back:

| Button            | What it does                                                               |
| ----------------- | -------------------------------------------------------------------------- |
| **Negate**        | marks the chosen shapes as **tools** — they turn red and translucent       |
| **Carve**         | cuts the smaller shapes out of the biggest one — the cube opens the window |
| **Join**          | merges the shapes into a single solid                                      |
| **Keep overlap**  | keeps only the part where the shapes overlap                               |
| **Separate**      | gives the original shapes back, each where it stood                        |
| **Flip the fold** | `I` — folds the same shapes the other way round, with no undo              |

**If the fold runs backwards, do not look for the reason: press `I`.** Flip the fold runs the same
fold the other way round — what was carved becomes the matter — in one click and with no undo. It
is a row of the right-click menu on the solid too.

**To say in advance which shape will be carved**, mark the tool: select it, press `N`, and it shows
translucent red. A marked shape is **always** cut out of the others, whichever button follows
— so **Join** with a negative in the selection pierces rather than merges. Press `N` again to take the mark off.

> **The mark shows; the order of the clicks did not.** That is the whole reason for the button:
> before it, nothing on screen said which object was about to be carved, and since adding a shape
> selects it, the natural gesture nearly always ran the wrong way round.

**Nothing is lost.** The solid remembers the shapes it was made of: **Separate** hands them back
where they stood, and `⌘Z` undoes the cut like any other action. So you can try things freely.

> **What was carved comes back marked.** A shape that served as a tool is handed back translucent
> red, so folding the same selection again gives the same solid. Press `N` to take the mark
> off and make it an ordinary shape again.

The resulting solid behaves like an ordinary object: it carries a name, moves, turns, wears a
material, and the window follows the wall when you move it.

> **The calculation does not run while you drag the cube**, but when you click the button — and it
> runs beside the window, without freezing the screen. On a very detailed shape the solid may
> therefore show up **whole for a moment** before the hole appears: that is not an error, it is the
> calculation not having answered yet.

> **A lone shape cannot be carved.** It takes at least two, and the buttons do nothing until then.
> **Separate** applies to one solid at a time.

---

## Duplicate, copy, paste

The four shortcuts you already know. **Duplicate** has its row in **Edit**; the _Cut_, _Copy_ and
_Paste_ rows you will see higher up there **are not the scene's**.

| Gesture       | Shortcut | What it does                                                   |
| ------------- | -------- | -------------------------------------------------------------- |
| **Duplicate** | `⌘D`     | puts a copy of the selection at the same place, and selects it |
| **Copy**      | `⌘C`     | holds the selection without touching the scene                 |
| **Cut**       | `⌘X`     | holds it and takes it out of the scene                         |
| **Paste**     | `⌘V`     | puts what was held into the current scene                      |

> **The Edit menu's rows act on TEXT**, not on the scene: they are what lets you copy the name of
> a layer you are renaming. The keys know the difference — highlighted text keeps `⌘C`,
> everything else belongs to the scene.

Three things worth knowing:

- **A group duplicates whole**, with everything hanging from it. Copying a lone child copies it
  alone, and it finds its parent again — unless you paste it into a scene that has no such parent,
  where it lands at the root instead.
- **The copy falls exactly on the original.** It is selected: moving it is the next gesture, not a
  recovery manoeuvre.
- **This clipboard is the studio's**, not the system's. Copying an object does not throw away the
  text you had in reserve, and you can paste into another scene. It does empty when you switch
  projects, though: an imported object there names an asset that exists nowhere else.

---

## The Scene panel — the scene tree

The **Scene** panel, in the right column, shows everything the scene contains, as a tree.

- **Click** a line to select the object — with `⇧`, `⌘` or `Ctrl` to pick several, exactly as in
  the view.
- **The arrow keys** walk the tree.
- **The eye** on the right of each line shows or hides the object.
- **Drag a line onto another** to file it underneath; onto the top line, the one carrying the
  scene's name, to take it out of its group.

The selection is the **same** on both sides: what you pick in the tree gets handles in the view,
and the other way round.

Only visible lines are actually drawn: a heavy scene scrolls without effort.

---

## The Inspector — everything adjustable

The **Inspector** panel, in the right column. It shows **what is selected**, and everything that
defines it.

Its fields come from the **object's type**, not from a form written for each one. A sphere shows
its radius, a torus shows its tube, a spot shows its angle.

### For an object

| Section       | What it holds                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**  | the name, editable                                                                                                                          |
| **Transform** | Position, Rotation, Scale — three numbers each (X, Y, Z). A childless sprite selected on its own has no Rotation row: it would show nowhere |
| **Geometry**  | what defines the shape: radius, width, segments…                                                                                            |
| **Material**  | Colour, Roughness, Metalness, Tiles per metre, and five image slots                                                                         |

#### Every geometry field

You will never see them all at once: each shape shows its own.

| Field                                   | What it sets                                              | On which shapes                                 |
| --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| **Width**, **Height**, **Depth**        | the three sides of a box                                  | Box, Plane                                      |
| **Radius**                              | the size of a round shape                                 | Sphere, Circle, Capsule, Torus, Knot, polyhedra |
| **Top radius**, **Bottom radius**       | the two ends of a cylinder — make them unequal for a cone | Cylinder                                        |
| **Inner radius**, **Outer radius**      | the hole and the rim                                      | Ring                                            |
| **Tube**                                | the thickness of the ring                                 | Torus, Torus knot, Tube                         |
| **Segments**                            | the number of facets                                      | most round shapes                               |
| **Radial segments**                     | the facets all the way round                              | Cylinder, Capsule, Torus, Tube                  |
| **Tubular segments**                    | the facets along the ring                                 | Torus, Torus knot                               |
| **Width segments**, **Height segments** | the fineness in each direction                            | Sphere, Plane                                   |
| **Cap segments**                        | the fineness of the rounded ends                          | Capsule                                         |
| **P windings**, **Q windings**          | how many times the knot turns through itself              | Torus knot                                      |

**Segments** deserve a word: it is the number of facets that make up a round shape. Few segments =
angular and light; many = smooth and heavy. 32 is a good compromise for a sphere.

**P and Q windings** are the two numbers that define a knot. P is the number of turns around the
axis, Q the number of turns through the hole. `P=2, Q=3` gives the trefoil knot, the one you see
everywhere. Change either and you get a different knot — it is the one field in the studio whose
result you cannot predict without trying.

**Roughness and Metalness** are the two settings that make a material's whole appearance:

| Setting       | At 0                 | At 1        |
| ------------- | -------------------- | ----------- |
| **Roughness** | perfect mirror       | fully matte |
| **Metalness** | plastic, wood, stone | metal       |

The five image slots — **Image**, **Normals**, **Roughness map**, **Metalness map**, **Ambient
occlusion** — take images from the project. The **Choose an image** button opens the list;
**Remove the image** empties it.

**Every new shape arrives already dressed** in a working chequer. It is there for three things:
judging a scale, seeing an image stretch, and telling one face from another. Replace it whenever
you like — it is a starting point, not a decoration.

Four chequers are copied into the project's **Images** folder the first time a scene asks for
one: `CheckerLarge`, `CheckerSmall`, `GridLarge`, `GridSmall`. They are project images like any
other.

**Tiles per metre** says how many squares fit in a metre. At `1`, one square is one metre — on a
3 m wall as on a 40 m floor, the squares stay square and the same size. Raise it to `2` for an
object looked at close up.

### For a light

| Field                              | What it does                                |
| ---------------------------------- | ------------------------------------------- |
| **Colour**                         | the light's hue                             |
| **Intensity**                      | its power                                   |
| **Range**                          | how far it reaches — point and spot         |
| **Decay**                          | how fast it fades with distance             |
| **Angle**                          | the cone's opening — spot only              |
| **Penumbra**                       | the softness of the cone's edge — spot only |
| **Target**                         | what it points at                           |
| **Sky colour** / **Ground colour** | hemisphere only                             |

### For a camera

A camera has **its lens**, and, as soon as a shot covers it, **what that shot has it do**.

| Field             | What it sets                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Field of view** | how much the camera takes in, in degrees. This is the zoom: a small angle is a telephoto, a large one a wide angle |
| **Near distance** | nearer than this, nothing is drawn. Never zero — depth sorting would have no range left                            |
| **Far distance**  | further than this, nothing is drawn                                                                                |

The **Put this camera where the view is looking** button gives it the place and the direction of
the current view: frame it with the mouse, click, and the camera is there.

#### Camera shot

This section carries **the shot covering the playhead**: what **moves** the camera during that
shot, and what it **looks at**. While no shot covers the head, it shows nothing but the **Create a
path for this camera** button — which then opens the shot and lays the rail in one gesture.

| Field                                       | What it does                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**                                    | the rail the camera rides during this shot. **None** leaves it wherever its placement and its keys put it                                                                                                  |
| **Create a path for this camera**           | lays a path in front of the camera, down its line of sight, and binds it to this shot. **One `⌘Z` undoes both** — and where no shot covers the head, the button opens one in the same gesture              |
| **Speed curve**                             | **Steady**, **Soft start**, **Soft finish**, **Soft start and finish**. Without one, the camera move starts and stops dead                                                                                 |
| **Start on the path** / **End on the path** | from 0 to 1, the stretch of rail actually taken. **A start greater than the end runs the rail backwards**                                                                                                  |
| **Target**                                  | **Free** — the camera looks where its own rotation turns it · **A point** — it aims at coordinates, set by **Aim point** · **an object's name** — it follows that object, even one that is itself animated |

**The speed is steady along the rail**, whatever the distances between its points: halfway
through the shot the camera has covered half the **length** of the path, not half its segments.

**These settings live on the SHOT, not on the camera.** The same camera can therefore travel in
one shot and stand still in the next, watch the statue here and the door there.

### Shadows

Two switches, on every object that can have them:

| Switch              | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| **Casts a shadow**  | the object blocks light and lays its shadow on the rest |
| **Catches shadows** | other objects' shadows are drawn on it                  |

**Both are decided object by object**, because a shadow costs computation for every light casting
it. A floor catches without casting; a small piece of set far from the camera can do neither
without anyone noticing.

> **The section does not always appear.** A _sprite_ plays no part in shadows at all, and an
> ambient or hemisphere light casts none: rather than show a switch with no effect, the studio
> shows nothing.

What a shadow looks like — crisp or softened edge, how fine the computation — is set once for the
whole scene in **Settings ▸ Workspaces ▸ Modelling**.

### Environment — the sky that lights

**This section shows even when nothing is selected**, because it belongs to the whole scene rather
than to an object.

| Value                       | What you get                                                           |
| --------------------------- | ---------------------------------------------------------------------- |
| **Studio** _(start)_        | a neutral, computed lighting, there before you have generated anything |
| _a skybox from the project_ | the chosen sky lights the scene **and** is reflected in the materials  |

This is the bridge between the two workspaces: a sky made in the **Skyboxes** workspace becomes
your scene's light here. A sunset lays a raking orange light over everything, without you placing
a single lamp.

The list only offers the project's **skyboxes that are on your disk**. A sky left in the cloud is
not there: it would be chosen, and nothing would show.

> The Inspector **is not a 3D panel**. The same inspector reads a clip, a track or an asset when
> that is what is selected. That is why it stays open in every workspace.

---

## The floor grid

The chequering is **not** an object in the scene: it is a reference, to know where things are and
at what height. It appears in no render.

**Settings ▸ Workspaces ▸ Modelling**:

| Setting           | What it does                                    | Default |
| ----------------- | ----------------------------------------------- | ------- |
| **Show the grid** | shows or hides it                               | on      |
| **Grid size**     | its extent in metres — one square is always 1 m | 20      |

Hide it to judge an image with nothing around it.

It sits **just below** the zero level: a floor resting on it hides the grid rather than letting it
show through. On the templates that lay a floor down — the test level among them — it therefore
disappears of its own accord, with nothing to untick.

---

## Capturing the view

**View ▸ Capture the view** saves a picture of the 3D view into the project's **Images** folder. What
is captured is what the viewport draws — **minus** the grid, the transform handles, the rails and
the light markers: a picture, not a screenshot.

The button's menu offers four sizes:

| Choice        | Height of the picture      |
| ------------- | -------------------------- |
| **View size** | the panel's own, on screen |
| **1080p**     | 1080 pixels                |
| **1440p**     | 1440 pixels                |
| **4K**        | 2160 pixels                |

**Only the height is imposed**: the width follows the shape of the panel, so the picture shows
exactly what you were looking at — no more, no less. A narrow panel therefore gives a narrow
picture, and that is deliberate. Widen the panel before capturing if you want a wide picture.

The picture appears among the project's assets like any other.

---

## Getting a scene out of the studio

**File ▸ Export ▸ Scene** writes everything the document holds. **File ▸ Export ▸ Selection**
writes only the chosen objects — a group takes along whatever hangs from it.

| Format                   | What it is                      | When to use it                             |
| ------------------------ | ------------------------------- | ------------------------------------------ |
| **Binary glTF (`.glb`)** | one file, geometries included   | the default, and what most engines read    |
| **glTF (`.gltf`)**       | the same thing as readable JSON | to inspect or diff what is in it           |
| **USDZ (`.usdz`)**       | the format Apple's viewers open | to look at the scene on an iPhone or a Mac |

A save dialogue opens to choose where the file goes. Its name is the document's; the extension
follows the chosen format.

**What does not come out.** The floor grid, the corner trihedron, the transform handles and the
light markers are not part of the scene: they are display aids. The file holds only what the
**Scene** panel lists. The edges of the "shaded and wireframe" mode are not in it either.

**A sprite does not come out either**, and without warning: neither format has an object that
always turns to face the camera. In glTF the file keeps its name and its place, but nothing is
drawn there; in USDZ nothing of it remains at all. A flat image that has to survive the export is
made with a plane and an image.

**A nested selection keeps its place.** Exporting an object filed inside a group writes it where it
stands in the scene, not where it stands inside its group.

---

## Saving

`⌘S` / `Ctrl+S` writes the scene into the project, under `Modelling/Scenes/`.

**3D scenes can save**, as do the six other document kinds.

**The file written is a `.gltf`, and it is a real glTF**: another application opens it and finds
the scene tree, the name and place of every object, the cameras, and the directional, point and
spot lights. What the standard does not carry — the shape of the primitives, the materials, the
rails, the camera shots, the animation — travels inside the same file but **is read by AI Desktop Studio
alone**. Nothing is lost from one save to the next; what opens elsewhere is poorer than what you
see here.

A tab whose work is not yet written carries **a dot** (`•`) beside its name. The dot disappears on
save and comes back on the next change.

Reopening the studio brings the tab back and rereads its scene. A tab never saved comes back empty:
nothing had been written for it.

<!-- SCREENSHOT: the 3D view with a mesh selected, the scene tree and the Meshes panel.
     Save to ../../images/scene-3d.png -->

---

## Animating the scene

The bottom strip of the Modelling workspace carries a **timeline**, as Video and Audio do, across the full
width of the screen.

### What a model already brings

A character generated remotely — by a _text to motion_ model, or captured from a video — arrives
with its **animation clips** inside the file. Select it, and the Inspector offers the **Animation**
section:

| Control                | What it does                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Clip**               | picks which one plays, among those the file carries                                                                             |
| **▶ / ⏸**              | shows the block in the view, on a clock of its own                                                                              |
| **Speed**              | a multiplier, from 0.1 to 4                                                                                                     |
| **Loop**               | starts over at the end, or holds the last pose                                                                                  |
| **Transition**         | how long the fade lasts at **both ends** of the block, up to one second                                                         |
| **Character movement** | whether this motion carries the character along, or walks it on the spot — **Automatic**, **In place**, **The animation’s own** |
| **Drives**             | which half of the body this block animates — **The whole body**, **The upper body**, **The lower body**                         |

**All seven controls act on THE BLOCK YOU CHOSE on the band**: press a block to choose it, and the
section switches over to it — while you have chosen none, it is the first. A model carrying several
blocks is therefore set block by block: speed and loop are written into the one you are watching,
and the others do not move.

> **The Inspector's ▶ does not move the playhead.** Watching an animation is a glance at one block,
> not a move of the scene's clock: the block runs in the view and the band stays where you left it.
> **The two never run together** — starting the timeline drops the preview, so does moving the
> head, and starting the preview pauses the timeline.

**The playhead position is not saved**: reopening the scene puts it back at the start. What is
saved are the blocks — where they sit on the band, their speed, their loop, their transition, their
movement and what they drive.

**One slider for both ends, and that is deliberate**: what _Transition_ sets is the way this motion
**joins its neighbours**, and a block whose two ends faded over different lengths would describe no
such thing. The fade is zero by default, and one second at most.

**_Character movement_ settles one question only: does this motion carry the character across the
floor?** A recorded walk does; laid as it is on an object the band already takes from one point to
another, the character covers the ground **twice** and arrives past the mark.

| Value                   | What it does                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automatic**           | the block carries the character, **unless** a trajectory on the band already moves it. This is what stops the double displacement, and it is the default |
| **In place**            | the motion never travels: it is played on the spot                                                                                                       |
| **The animation’s own** | the file’s own travel is always used, trajectory or not                                                                                                  |

> **"In place" does not nail the character to the floor**: only the **horizontal** travel is taken
> out. The height of the hips and their bounce stay, without which a walk would sink into the floor
> or slide instead of stepping.

> **What counts as a trajectory is TWO position keys at least**, on the object itself. A single key
> places the character, it does not move it, and _Automatic_ then lets the motion carry it.

> **A trajectory muted still counts.** _Automatic_ looks at whether those keys **exist**, not at
> whether they play: muting a trajectory stops the character, it does not hand the travel back to
> the motion and send it walking off on its own.

**A model with no clip keeps the section**, which then says what it is missing — that it carries no
skeleton yet, or one the studio does not recognise. The picker itself only appears when there is
something to choose.

**A clip also shows on the band below**, laid as a block at its real length, and it is **the
block** that bears the clip's name. The line holding it is a **sub-track**, called **Anim. 1**,
**Anim. 2**, and so on. Sub-tracks are grouped **under** the key lines, never mixed into them.

**A clip its file does not name is called "Animation" on screen**, or **Animation 1**,
**Animation 2** — and everywhere the studio names it: the **Clip** picker, the block on the band,
the Animations panel and the add panel. That is the common case: a Tripo export calls its only clip
`NlaTrack` — the name Blender gives by default to a track nobody named — and a Uthana export names
none at all, which is what gets them numbered on opening.

**The number is not a rank recounted**: it is the one the file already carries. Where named clips
are mixed in with the others, **the numbering skips** — "Animation 1", "Walk", "Animation 3".

> **The file keeps its own word.** This replacement lives on screen only: open the scene elsewhere
> and `NlaTrack` is still there. That is deliberate — writing "Animation" into the document would
> freeze the language of the day it was saved, and a French file would stay French for an English
> reader.

**Every other name is left alone**: the studio replaces those two spellings and nothing else, to
the letter. A clip somebody really did call `NlaTrack` would therefore be renamed too — nothing
tells the two apart.

> **A SHIPPED animation does not follow this rule**: it bears the name of its folder, whatever its
> file spells. That is a different mechanism, described further down.

### Making a model animatable

An imported model most often carries no skeleton at all: it is a **mesh**, and nothing can animate
it. **The Animation section is there all the same**, and it is the one that says so — "This model
cannot be animated yet." A second section, **Skeleton**, then holds the **Make animatable** button.

**That second section is not always there, and that is deliberate**: a model arriving with a
skeleton of its own is never offered another, and a model still loading has nothing to measure.

**Two shapes are refused before any click**, because the studio lays its skeleton from the model's
bounding box: "This model is too flat to take a skeleton." and "This model is lying down. Stand it
up before making it animatable." In the second case, stand it up and the button comes back.

The button opens a small panel beside it, with two settings.

| Setting            | What it offers                                                      |
| ------------------ | ------------------------------------------------------------------- |
| **Character type** | **Automatic**, **Human**, **Animal**, **Other**                     |
| **Service**        | **Automatic — the studio**, then the remote services that can do it |

**The studio only lays a HUMANOID skeleton** — hips, spine, two arms, two legs. Choosing **Animal**
or **Other** shows the reason and **greys out Create the skeleton**: better said than laying hips
on a horse and letting you find out.

> **The remote services are listed, and none can be chosen today.** Each carries the reason that
> stops it — the missing subscription, the size of the model, or that it is **not wired up yet**.
> The studio does it **itself and for free**, with no size limit: that is what "Automatic — the
> studio" means, and what **Create the skeleton** runs.

**What changes once created**: a **Preparing the character** bar while it computes, then "This
model has been given a skeleton." The Animation section stops saying it cannot be animated — "This
character is ready to animate." — and **pose mode** finally grabs its bones, which did not exist
before.

### The Model tab

A model is edited **on a tab of its own**, opened by the double-click above or by the **Edit the
skeleton** button of the Inspector. It shows the file alone, on a grid, and its bar carries what
moves the **view**: select, navigate, translate, rotate, the **display mode** (wireframe, matcap,
density…), **Show bones**, and **Frame**. The two buttons on the right choose what the gizmo does
to a joint — pose it, or edit the skeleton.

A **right-click** on the model, in the view as in the Scene panel, offers the same gestures: frame,
show or hide the bones, the display mode, capture the view. The **View** and **File ▸ Export**
menus serve the tab as they serve a scene; the exported file takes the tab's name.

The Inspector adds two sections to the skeleton and the motions. The **Attachment points** section
names, on a bone, where an object of a scene will hang. The **Shapes** section weighs each morph
target the file carries with a slider — **a preview**: the weight is not written into the file yet.

> **This tab adds nothing to the model.** A shape, a light or a text are placed in a scene, never
> here: what saves from the tab is the model's own file, skeleton included. And ⌘S only knows how
> to rewrite a `.glb`: on an `.fbx` or an `.obj` it says so, rather than writing a file nothing
> would read back.

### Adding an animation

The **Animation** section holds the way in itself: the **Add an animation** link drops a panel
underneath it, with three tabs.

| Tab         | What it offers                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Library** | everything already at hand, in a single list: the clips the character's own file brought, the ones shipped with the studio, and the animations filed in the project |
| **Import**  | a file taken from disk — `.glb`, `.gltf`, `.fbx`                                                                                                                    |
| **AI**      | the remote models that **make** a motion                                                                                                                            |

**The Library tab is not the _Animations_ panel** described further down, and the two lists are not
the same: the tab counts one source more — the animations filed in the project — and it **lays**
what you choose, where the panel is dragged onto the band.

**Choosing a row LAYS the block, it is not a rehearsal.** The motion is written onto the real
character, retargeted as it will be, and it starts playing at once: what you are looking at **is**
the result, and no preview could ever differ from it. Carrying on browsing replaces the block that
was laid with the next one — there are never two.

**Two buttons to leave by.** **Keep** leaves the block where it is and closes the panel: keeping is
doing nothing more. **Cancel** takes it back, and the scene returns to where it was.

**The panel also closes on its own, and what becomes of the block depends on why.** Clicking
outside the panel or pressing `Esc` are ways of CLOSING it: the block is taken back, as with
Cancel. **Switching to another application is not one** — the studio closes the panel **keeping**
the block, exactly as if you had pressed Keep, rather than taking it back while you are looking
elsewhere.

**Below the list, the preview carries its own controls**: _Back to the start_, _Play the preview_,
_Go to end_, then **Position**, **Speed** and **Loop** — the last two being the section's own
settings, written into the block you have just laid. Like the ▶ of the Inspector, this preview runs
on a clock of its own and does not move the playhead.

**Position HOLDS the pose where you leave it**, instead of running everything back to the start:
that is what lets you judge a pose rather than a move, and playback then picks up from there. _Go
to end_ shows the motion's last pose — the one that matters for what the next block picks up from.

**The panel then says whether the motion fits the skeleton**, in one line: "The character can play this
motion.", or that it is not a perfect fit. **No bone name is shown up front** — _See the joints concerned_
opens the list, and those are **roles**, never bone names: that vocabulary is the only one two
skeletons share. Each row says what happens to the joint — "stays at rest" for a joint of your
character the motion does not animate, "not carried over" for a joint of the motion your character
does not have.

> **A clip that came from the character's own file says none of this**, and rightly so: it already
> speaks that skeleton, so there was no retargeting to judge.

**An imported file stays where it is** — the studio references it, it does not copy it, as every
import does. A file carrying no motion is refused on the spot, with its reason, rather than doing
nothing at all.

**The AI tab only LISTS today**, and it says so: nothing is submitted from it yet. Each row bears
the reason standing in the way — the subscription that falls short, or "Not wired up yet". When the
catalogue offers no motion service at all, the tab says that too.

### The animation library

The **Animations** panel, in the right column, lists **what a character can be made to play**:
first the sequences the selected model's own file brought, then the ones shipped with the studio.
The two sources follow one another in a single list, and are dragged the same way.

**A row is dragged onto a sub-track of the band, and that is what puts a block there.** It starts
where you let go, snapped to the nearest frame, and takes the file's real length. It is chosen
straight away: the Inspector then describes what you have just laid down.

> **Only a sub-track accepts a drop.** A key line holds keys, an object's own line is the object
> itself, and the ruler at the top is not a track: dropping on any of the three does nothing.

**Each row also carries a ▶ — _Play it on the character_** — and that is the way to try an
animation without aiming at a sub-track. **It lays a REAL block** on the selected character, with
the same starting settings a drag would give it, and plays it at once. **It lays it at the START of
the first sub-track**, where dragging lets you choose the line and the spot.

> **This is not the Inspector's ▶**, which watches a block **already laid** without ever writing
> anything. This one lays the block itself, and can take it back.

**A second press stops it AND takes the block off**: the button says so, _Stop and take the block
off_. Pressing the ▶ of **another** row takes **the one playing** away first — never two previews
at a time.

> **What is left depends on how it stopped**, and that is the one subtlety of this button. Stopped
> by you, the block goes. **Interrupted by the playhead — because you started the band or moved the
> head — the block STAYS**, laid on the character. That is not an accident: it is what turns a
> convincing try into kept work. **And nothing takes it back after that**: the next ▶ lays its try
> IN ADDITION, on the same spot.

**The preview only ever shows the last try, on its own.** It is the BAND that afterwards shares the
pose out between the blocks overlapping under the playhead: two tries stacked on the same spot
average out, and the character does both by halves. Drag them apart on the sub-track — a block
moves with the mouse — to see them one after the other.

**The ▶ is off while no model is selected in the scene**: there is then nothing to play a motion
on. **A model is enough — it does not have to be animatable yet**; what it can really play is what
the Animation section will say. The list itself stays up.

**A shipped animation is replayed on YOUR character's skeleton** — it was authored for another
one, and the studio transposes it. The character that carried it does not enter the scene.

**A shipped animation bears its FOLDER's name**, never the one written inside the file — a Tripo
export calls its only sequence `NlaTrack`, an Uthana export names none at all. A thumbnail shows
if the folder holds one, otherwise a generic mark. One folder is **one** animation: if its file
spells several, the first is the one played.

**The studio may ship with no animation at all.** When neither the selected model nor the shipped
folder has anything to offer, the panel says so: "No animation yet. Select a character, or install
animations in the application folder." That folder is common to every project, and it is updated
by updating the studio.

### Layering two animations

**Two blocks do not layer on one sub-track.** Where they overlap they share the character in equal
parts, and the pose you get is their mean — that is, neither of them. Lay them **end to end** to
run one after the other: outside its own block a motion holds its edge pose, and the next one
takes over.

**To play them together, give each its own line.** The **+** button on the last sub-track — _Add a
sub-track_ — opens one below it, and a sub-track left on its own cannot be removed: it is what
receives whatever is dropped on the object. They are reordered by dragging their header, and
**that changes only where they are drawn** — unlike camera shots, no sub-track comes in front of
another.

**This is where _Drives_ earns its place.** Two blocks set to **The whole body** have nothing more
to give than their mean, even on two lines: they are competing for the same bones. Set one to
**The upper body** and the other to **The lower body**, and each keeps its half whole — walking
_and_ raising the arms becomes both at once, instead of half a step with the arms halfway up.

> **The hips go with the legs**, and that is deliberate: they carry where the character stands, so
> an upper-body block would otherwise walk it away from where its legs put it.

> **The halves are read off the skeleton, not off the file.** A bone filling no recognised role
> follows the limb it hangs from — a twist bone, a finger nobody named, a tail. And when nothing
> above it is recognised either, it goes with the lower body: on a model whose section announces
> **a skeleton with no recognised joints**, do not count on the halves and leave the blocks on
> **The whole body**.

### Editing a block once laid

**A chosen block answers to three gestures**, and right-clicking the block carries all three —
without that menu, none of them would ever be found.

| Gesture         | Key      | What it does                                                        |
| --------------- | -------- | ------------------------------------------------------------------- |
| **Duplicate**   | `⌘D`     | lays a copy of the block **right after it**, end to end             |
| **Split block** | `S`      | cuts the block in two where the playhead stands                     |
| **Remove**      | `Delete` | takes the block off the band. **The animation itself is untouched** |

**The cut leaves no fade at the joint**, exactly as the montage's own does: the two halves read as
one move, and a ramp in the middle would melt the pose where nothing happens. The second half picks
the motion up where the first one stops.

**Split stays greyed out until the playhead sits STRICTLY inside the block**: standing on either
of its two edges, it would cut nothing at all. The menu keeps the entry greyed rather than dropping
it — a list whose length follows the playhead cannot be learnt.

> **These three keys belong to no context of the shortcuts screen**, and so cannot be changed
> there: they are bound to the band, which must hold the focus. **Two of them do something else in
> the 3D view** — `S` scales there, `⌘D` duplicates the selected object — and it is whichever
> surface holds the focus that decides. Right-clicking stays the safe way in. See [Keyboard
> shortcuts](15-shortcuts.md).

### Seeing the skeleton

A rigged model carries **bones**. The **B** key, or **View ▸ Show skeletons**, draws them over
the scene. The row stays ticked for as long as they are visible.

**To grab one, switch to pose mode** — the **P** key, or **View ▸ Pose mode**. Clicking then
picks bones instead of objects.

> **The studio takes the bone nearest the pointer on screen**, whether it sits in front of a
> shoulder or behind it. Aim at **the joint itself** rather than at the limb it drives.

### Reworking a skeleton

**A bone picked in pose mode opens its settings in the Skeleton section** — and it must belong to
the model the Inspector describes. While no bone is picked, the section keeps the character's
state, **Add the hands** if it has anything to do, and **Remove the skeleton**.

| Setting or button          | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Name**                   | renames the picked bone. A name already taken is refused, and nothing changes |
| **Joint**                  | which role this bone fills in a human body — or **None**                      |
| **Add a child bone**       | lays a bone under the picked one, exactly where it stands                     |
| **Remove this bone**       | takes the picked bone out of the skeleton                                     |
| **Add a handle to follow** | gives this joint a handle it reaches for                                      |
| **Add the hands**          | lays fingers on the hands of a character that has none                        |
| **Remove the skeleton**    | returns the model to its bare mesh state                                      |

**Renaming matters more than it looks**: a skeleton arrives with the names its file spells, and
`mixamorigHips` is nobody's choice. The name is the one you will read everywhere afterwards.

**_Joint_ is what makes a motion transposable.** It is through those roles — not through the
names — that the studio makes your character play an animation authored for another: that
vocabulary is the only one two skeletons share. A bone filling none stays on **None** and gets in
the way of nothing.

> **The roles are written in English and are not translated**: it is the list animation software
> shares, and translating it here would make it unfindable elsewhere.

**A handle to follow puts a foot on the ground or a hand on a grip.** The joint reaches for it, and
**the bones above it turn to follow — two at most**: the parent and the grandparent. That is what
separates a foot that stays put from a foot that goes through the floor when the hip moves. The
button reads **Remove the handle** for a joint that already has one.

> **This is not a gizmo handle**, nor the one that trims a clip: this one is a point the joint
> AIMS at, and it stays put in the scene.

> **On a bone with nothing above it, the button does nothing** — the hips, for one, have no
> ancestor to turn. A bone whose parent is already the root makes only one follow.

**Add the hands only appears where it has something to do**: a hand and a forearm must be
recognised, and **a hand that already carries a thumb is left alone**. **The condition is judged
side by side** — if only one hand meets it, the button appears and lays fingers on that side only,
saying nothing about the other.

**An added bone is born under its parent, in the same place as it**, and bears its parent's name
followed by a number. The gizmo is what puts it where it belongs.

> **Removing the skeleton does not erase the animations already laid.** The model goes back to
> being a mesh, but the blocks and keys that targeted its bones stay in the document — with no
> bones to carry them, so with no effect. `⌘Z` brings the skeleton back and everything reattaches;
> otherwise, take the blocks off yourself.

### Laying down your own motion

**Your objects are in the band already.** Every object of the scene has its line: there is nothing
to create, and no button for it.

Place the playhead, then **key the object's line**. Its three animated properties — Position,
Rotation, Scale — are born at that moment, together, and in **one undo**. If the object is a
rigged model, a **Bone** picker appears in the bar: it opens on **The whole model**, and picking a
bone makes the keys drive that bone alone, which is how an arm is corrected without moving the
whole character.

**The band reads by object.** One line per object — or per bone — with its animated
properties **folded underneath**. The folded line shows every key of the object, its three
properties merged; unfolding separates them. **Folding never loses a key**, it only changes what
is shown.

| On the bar                  | What it does                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Back to the start**       | brings the playhead to zero                                                                                                                    |
| **Play** / **Pause**        | runs the timeline                                                                                                                              |
| **Auto-key**                | moving an object **writes a key** instead of shifting its rest pose                                                                            |
| **Duration** and **FPS**    | how long the timeline runs, and at what rate                                                                                                   |
| **Bone**                    | on a rigged model: the bone the next key will drive, or **The whole model**. A bone **clicked in the view** in pose mode wins over this choice |
| **Key everything animated** | the same gesture, on everything **already** animated — greyed out until something is                                                           |
| **Render to video**         | see below — greyed out until a camera is in the scene                                                                                          |

**Each line carries its own**, to the left of the band:

| On a line's header             | What it does                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the chevron                    | **Show or hide the animated properties**                                                                                                                                         |
| **Key _(the name)_**           | records the movement made since, on every property of that object. **The same button toggles**: where a key already stands, it lights up and reads **Remove _(the name)_’s key** |
| **Mute** / **Solo** / **Lock** | the three switches a line carries, the same as in Video                                                                                                                          |
| **Remove track _(the name)_**  | on a property line, takes it away with its keys                                                                                                                                  |

**The playhead is grabbed and dragged** along the ruler, and **keys are dragged** along their
line. **Past the duration the band is dimmed**: the head goes no further, and no key can be laid
out there — a clip block still can.

**A key comes off two ways.** The header's diamond, pressed where a key stands under the playhead,
takes it off **every property carrying one at that instant** — in one go, the way it laid them, and
`⌘Z` brings them all back together. On the band, **click a key to pick it, then `Delete` or
`Backspace`**: it leaves the line it sits on, and **the line decides the reach**, never its
folding — an object's line carries all of its properties away, an unfolded property's line only
itself. **A locked line keeps its own** — the lock guards against removal as it guards against
keying.

**Playing with the head already at the end rewinds** instead of stopping on the frame it starts on.

**Animation composes with the object's pose, it does not replace it** — and not the same way for
every property: moves **add up**, scales **multiply**. That is the opposite of a video edit,
where the clip on top hides the one below.

> **To stack the same property twice on one object, lock its lines**: the next key opens fresh
> ones over them. Two positions of 2 and 3 give 5; two scales that each double give **four times**
> the size.

> **An object that is ALREADY animated records on its own, whatever the switch says.** Once it
> carries a key, moving it edits its animation. So the switch decides one thing only: whether an
> object that is **not yet animated** starts being so — and the distinction is on the **keys**,
> not on the lines: properties that are open and empty are not an animation yet, and the switch
> still has its say there.
>
> **A bone with no key is a case apart**: having no rest pose to fall back to, the drag is simply
> dropped and the bone returns where it was.

### Keying by hand

Auto-key is not compulsory. The gesture, in order:

1. **set a key** at the start, on the object's line — it opens its three properties (a camera has
   a fourth, its **field of view**) and keeps the pose the object stands in at that moment, which
   every key of its own is measured against;
2. **move the playhead** along the ruler;
3. **move the object**, then **set a key** again.

> **The Inspector's numbers go back to the reference pose, not the object on screen.** The key
> holds the movement, and the stored position returns to its reference. In the view, **nothing
> moves**: what you see is the reference plus the key, which is where you just put it.

**A bone does not work that way**: its properties have no reference pose, so setting a key there
**pins what they already hold** and nothing springs back. To animate a bone, go through auto-key
and pose mode rather than through these three steps.

### Writing a video

Add a **camera** to the scene (Add menu → Object → Camera). It is an object like any other: it
moves with the gizmo, it animates like any other object, and a glTF export carries it along.

#### The preview — seeing what the camera films

**Select a camera, and an inset opens at the top right of the view**: what it sees, at the instant
the playhead stands on, at the shape of a video. Its name sits at the top. Deselecting the camera
closes it.

This is not a working view but a **rendered picture**: no grid, no handles, no skeletons, no light
or camera markers — exactly what the video file will hold.

| Gesture                                | What it does                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Drag the inset**                     | moves it around the view, if it is in the way                                                                 |
| **Grow the preview to the whole view** | the inset takes the whole surface. The same button, now **Put the preview back in its corner**, sends it home |

**The "On air" badge** lights up when the selected camera is also the one the montage names at
that instant. That is the one thing telling the two apart: **the preview follows what you have
selected**, while the montage and the render follow what the shots decide — see below.

**A scene may hold several, and change camera part way through.** That is what **shots** are for,
laid on the band below:

1. **choose the camera**, in the scene or in the tree;
2. **place the playhead** where the shot is to start;
3. **Put this camera on air**, in the timeline's bar. The shot opens from the head onwards, over
   **three seconds** — or whatever is left of the band, if that is less.

A shot then **slides** and **trims** like a clip in an edit. Each camera has **its own line**, and
**the order of those lines is the law**: where two shots overlap, the highest line is the one on
air. Drag a line's header to change its rank — that edits the document, and `⌘Z` gives it back.

> **With no shot at all, nothing is lost**: the scene's first camera films, over the whole length.
> And **deleting a camera does not punch a hole in the film** — its shots are skipped rather than
> rendered black, and undoing the delete brings them back whole.

**The field of view animates like the rest**, and that is a shot's zoom. Set a key on the camera's
line — it opens the **field of view** along with the other three properties — then work that field
in the Inspector: with **auto-key** on, every setting becomes a key at the playhead rather than a
change of lens. A camera **already animated** records without it too, the way an already animated
object does of a move. The field then shows what the lens reads **at the instant the playhead
stands on**, keys included.

The timeline's **Render to video** button writes an `.mp4` over the whole length, each frame taken
through the camera the montage names at that instant. The studio asks **where to save before
computing anything** — a render takes minutes.

**With no camera in the scene the button is greyed out**: there is nothing to look through.

---

## Playing the scene

The **Play** button in the toolbar runs the scene as a game, **in a window of its own**. The
document is not touched: the game builds a world of its own, and **Stop** throws it away and puts
the scene back as it was. The game window reads its own keyboard — nothing of the viewport is
handed over, and the editor behind it does not move.

### The controls, with nothing to set up

A fresh scene plays **on the keyboard and on a gamepad alike**, with no file to create and no
script to write. A connected gamepad is recognised as soon as a first button is pressed — that is
the browser's requirement, not the studio's.

**On foot**

| Action   | Keyboard                                                          | Gamepad                       |
| -------- | ----------------------------------------------------------------- | ----------------------------- |
| Walk     | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or the arrows | left stick                    |
| Run      | <kbd>Shift</kbd>                                                  | left stick click              |
| Look     | mouse, **button held**, not rebindable                            | right stick, **nothing held** |
| Jump     | <kbd>Space</kbd>                                                  | ✕ / A                         |
| Interact | <kbd>E</kbd>                                                      | ▢ / X                         |

> **Interact and Get out do nothing on their own.** The studio reads those two and hands them to
> your script: what interacting with the thing in front of you means, and what getting out of a
> car means, belong to your game alone. The script the template lays down shows you where.

**Driving**

| Action         | Keyboard                                               | Gamepad       |
| -------------- | ------------------------------------------------------ | ------------- |
| Accelerate     | <kbd>W</kbd> or <kbd>↑</kbd>                           | right trigger |
| Brake, reverse | <kbd>S</kbd> or <kbd>↓</kbd>                           | left trigger  |
| Steer          | <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> | left stick    |
| Hand brake     | <kbd>Space</kbd>                                       | ✕ / A         |
| Get out        | <kbd>F</kbd>                                           | ▢ / X         |

**Flying**

| Action   | Keyboard                                       | Gamepad                              |
| -------- | ---------------------------------------------- | ------------------------------------ |
| Pitch    | <kbd>↓</kbd> noses up, <kbd>↑</kbd> noses down | left stick, **pulled back to climb** |
| Roll     | <kbd>A</kbd> <kbd>D</kbd>                      | left stick                           |
| Yaw      | <kbd>Q</kbd> <kbd>E</kbd>                      | shoulder buttons                     |
| Throttle | <kbd>Shift</kbd> opens, <kbd>Ctrl</kbd> closes | triggers                             |

> **A stick is analogue, a key is not.** A stick held halfway walks at half the pace; a key knows
> nothing but zero and everything. It is the one thing a gamepad can say that a keyboard cannot.

> **An aircraft throttle is a lever, not a pedal.** It is pushed, pulled, and stays where it was
> left — an engine that drops to idle the moment a finger lifts is not something anyone can fly.

### Two settings not to confuse

The setting **Settings ▸ Devices ▸ Navigate the studio with a gamepad** concerns **the studio's
interface only**: it lets a connected gamepad move the focus, confirm and go back through panels
and dialogues. It stays off by default, so that a game does not move the editor behind it — **and it
has no bearing on the game**, which listens to the gamepad either way.

The **Detected controls** list on the same page says what the machine sees. A gamepad missing from
it has not sent a first press yet.

### Changing the controls

The controls above are a **starting point**, not a limit. A project **control map** replaces them,
context by context.

**The five playable scene templates lay one down, with nothing for you to do.** Create a First
person, Third person or Top down scene and the project gets `Controls/character.input.json` plus a
`Scripts/player.ts` hung on the character; Car and Aircraft lay down their own. Open them, change
them — showing you that is what they are for. A second scene from the same template **joins** those
files rather than rewriting them: a control map belongs to the project, not to the scene.

The **New control map** button in the Explorer creates one by hand, from any of the five standard
starting points — _studio_, _character_, _vehicle_, _flight_, _menu_. They are filed under **Game
controls** — `Controls/` on disk — at the top of the project, as interfaces are.

A map names **actions** — `move`, `look`, `jump`, `run`, `interact` for a character — and says
which keys, sticks and buttons reach them. **What the project's map declares wins; what it leaves
out keeps the default behaviour.** A project with no map at all therefore plays exactly as the
tables above.

A context also carries a **priority** and an **Active at startup** flag. The _character_, _vehicle_
and _flight_ contexts are active from the start — no action name is shared between them, so they
do not tread on one another.

The *menu* context needs its map to exist at all: it **primes** over the rest, and it is for a
script to push when a menu opens — with no map, the ask does nothing.

The *studio* starting point describes no game: it describes **walking the studio's own interface
with a controller**, the one Settings ▸ Devices switches on. Creating its map, rebinding it and
saving changes that walk **on saving**, with no need to reopen the project. Its five actions are
`navigate` (the left stick), `next` and `previous` (the d-pad), `confirm` and `back`. With no
`studio` map in the project, the starting point answers.

A script reads those same actions by name, never a key:

```ts
import { defineScript } from '@studio'

export default defineScript({
  onUpdate(self, ctx, dt) {
    const walk = ctx.input.axis2('move')
    const running = ctx.input.button('run')
  },
})
```

The same script then answers the keyboard **and** the gamepad, without knowing which one spoke.

### Driving the body from a script

Reading the controls is not always enough: a script can also **ask** the body to move, and the
studio's controller carries it out — with gravity, slopes and walls.

| Ask                                      | What it does                                                    |
| ---------------------------------------- | --------------------------------------------------------------- |
| `self.walk(x, z)`                        | walks in that **direction** — the pace comes from the component |
| `self.jump()`                            | jumps, with the same ground tolerance a button gets             |
| `self.look(yaw, pitch)`                  | turns the look, in the shape a stick speaks                     |
| `self.drive(throttle, steer, handBrake)` | drives **this** vehicle                                         |
| `self.fly(pitch, roll, yaw, throttle)`   | flies **this** aircraft                                         |

> **Do not move a character with `moveBy`.** That one puts the node where you say, asking nobody —
> so through the wall the physics has not seen yet. `walk` asks, and what is impossible does not
> happen.

> **`walk` takes a direction, not a speed.** The pace is the `CharacterController`'s, or the
> scene's own when it declares none: `walk(0, -1)` and `walk(0, -3)` walk at the same pace,
> `walk(0, -0.5)` at half of it — exactly as a stick held halfway does. And it is **relative to
> the look**, not to the world: `walk(0, -1)` means « ahead of me ».

**An ask REPLACES the controls, for that body and that step alone**, with two exceptions: a jump
**adds** to the button — an impulse cannot be un-pressed, so a script cannot stop a player from
jumping — and there is **one look** for the scene, the one belonging to the body the camera
follows.

Ask from `onUpdate`, which is the step itself: what is asked in `onLateUpdate` arrives after the
controllers have read, and is lost. A script silent on a step
hands the player back the sticks on it; a script that speaks every step holds the body. That is
what lets you say « stand still »: `self.walk(0, 0)` stops it dead, where an ask that only added
could never ask for nothing at all.

And the ask reaches **the body the script sits on**: a script on one car drives that car, not the
others in the scene.

---

## Optimising and exporting a game

The scene you edit remains the authoring world: every tree, prop and scripted object keeps its
identity and stays editable. **Play** and **Export the game…** build a separate runtime world. Safe
optimisations share repeated geometry and materials, instance compatible objects, batch nearby
static objects and retain the source object ID for picking, scripts and physics.

Use **Edit ▸ Optimise selection…** to preview and apply an override to selected objects. **Edit ▸
World performance…** reports the whole scene. Both distinguish measured figures from estimated
results. The runtime compiler reuses unchanged regions when Play is started again.

**Edit ▸ Export the game…** first lists the SAFE operations, which do not alter the intended
picture or behaviour. The Advanced section is opt-in: generated distance levels, geometry
simplification, image compression and image resizing may change the result. The dialogue therefore
says **Visual changes: NONE** until one of them is enabled, then **POSSIBLE**. Generated distance
levels always retain the original as LOD0. Export never rewrites the authoring scene; its runtime
cache can be discarded and rebuilt.

---

## What is still missing

The Modelling workspace now has everything this manual describes. What is left fits in two sentences:
fonts are offered in one weight per family, and a text does not bend along a curve. On the
animation side, **keys** run straight between one another — there are no easing curves for them
yet, a camera shot's **Speed curve** being the studio's only one — and a model's clip plays on its
own, without blending into another.

The detail is in [What does not exist yet](18-limits.md).

---

[← Image workspace](08-image-workspace.md) · [Contents](../user-guide.md) · [Next chapter: Video workspace →](10-video-workspace.md)
