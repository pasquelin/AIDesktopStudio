"""Builds the character resources the app ships with, from the sources they were authored in.

Run through Blender, which is the only reader here for FBX:

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python scripts/make-character-assets.py -- <source folder> <resources folder> [names...]

Naming what to build restricts the run to those clips or hero levels; with none it builds the
whole of both tables.

The source folder holds `game/` — `character.glb` and Mixamo FBX clips — beside `optimization/`,
which holds the decimations of that same mesh. What
lands in `resources/` is glTF binary throughout: metadata is JSON there, so a clip's name, its
bone names and its copyright are all values rather than bytes at a fixed offset.

Bones are renamed to the studio's own humanoid roles — `shared/domain/humanoid.ts` — which is
what `character.glb` already spells. Two skeletons that agree on their names are what makes a
retarget a lookup rather than a guess.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

COPYRIGHT = "© AI Desktop Studio"

# The studio's humanoid roles, keyed by the Mixamo name each one answers to. Mixamo spells a
# finger `LeftHandIndex1` and the studio `LeftIndex1`; the hand joints are expanded below rather
# than written out twice a side.
BODY_BY_MIXAMO = {
    "Hips": "Hips",
    "Spine": "Spine",
    "Spine1": "Chest",
    "Spine2": "UpperChest",
    "Neck": "Neck",
    "Head": "Head",
}

SIDED_BY_MIXAMO = {
    "Shoulder": "Shoulder",
    "Arm": "UpperArm",
    "ForeArm": "LowerArm",
    "Hand": "Hand",
    "UpLeg": "UpperLeg",
    "Leg": "LowerLeg",
    "Foot": "Foot",
    "ToeBase": "Toes",
}

FINGER_BY_MIXAMO = {
    "Thumb": "Thumb",
    "Index": "Index",
    "Middle": "Middle",
    "Ring": "Ring",
    "Pinky": "Little",
}


def role_of(name):
    """The studio role a Mixamo bone answers to, or None for one that has none.

    None covers the terminal helpers a Mixamo rig carries — `HeadTop_End`, `LeftHandIndex4` —
    which deform nothing and name no role.
    """
    bare = name.split(":")[-1]
    if bare in BODY_BY_MIXAMO:
        return BODY_BY_MIXAMO[bare]

    for side in ("Left", "Right"):
        if not bare.startswith(side):
            continue
        rest = bare[len(side) :]
        for mixamo, part in SIDED_BY_MIXAMO.items():
            if rest == mixamo:
                return f"{side}{part}"
        if rest.startswith("Hand"):
            finger = rest[len("Hand") :]
            for mixamo, part in FINGER_BY_MIXAMO.items():
                if finger.startswith(mixamo) and finger[len(mixamo) :] in ("1", "2", "3"):
                    return f"{side}{part}{finger[len(mixamo):]}"
    return None


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def armature_of():
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    raise SystemExit("no armature in the imported file")


def rename_bones(armature):
    """Renames every bone that names a role. Blender renames the action's channels with them."""
    renamed = 0
    for bone in armature.data.bones:
        role = role_of(bone.name)
        if role and bone.name != role:
            bone.name = role
            renamed += 1
    return renamed


def export_glb(path, clip_name=None):
    """Writes the current scene, then rewrites the metadata the exporter does not take."""
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_yup=True,
    )
    stamp(path, clip_name)


def stamp(path, clip_name):
    """Puts the studio's own metadata on a finished file — generator, copyright, clip name.

    Done on the bytes rather than through the exporter because neither `copyright` nor an
    animation's name is an option it takes, and both are what a reader sees first.
    """
    with open(path, "rb") as handle:
        data = handle.read()

    length = int.from_bytes(data[12:16], "little")
    document = json.loads(data[20 : 20 + length])
    document["asset"] = {
        "version": "2.0",
        "generator": "AI Desktop Studio",
        "copyright": COPYRIGHT,
    }
    if clip_name:
        for animation in document.get("animations", []):
            animation["name"] = clip_name

    chunk = json.dumps(document, separators=(",", ":")).encode("utf-8")
    chunk += b" " * (-len(chunk) % 4)
    rest = data[20 + length :]
    header = data[:12]
    total = len(header) + 8 + len(chunk) + len(rest)
    with open(path, "wb") as handle:
        handle.write(header[:8] + total.to_bytes(4, "little"))
        handle.write(len(chunk).to_bytes(4, "little") + b"JSON" + chunk)
        handle.write(rest)


def build_clip(source, target, name):
    reset_scene()
    bpy.ops.import_scene.fbx(filepath=source, ignore_leaf_bones=True, automatic_bone_orientation=True)
    armature = armature_of()
    renamed = rename_bones(armature)

    # The clip carries the studio's name for it on BOTH sides: the action here, so a file opened
    # in Blender reads right, and the glTF animation in `stamp`.
    for action in bpy.data.actions:
        action.name = name

    export_glb(target, clip_name=name)
    return renamed


def node_matrix(node):
    if "matrix" in node:
        return Matrix([node["matrix"][i::4] for i in range(4)])

    out = Matrix.Identity(4)
    if "translation" in node:
        out = Matrix.Translation(node["translation"])
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        out = out @ Quaternion((w, x, y, z)).to_matrix().to_4x4()
    if "scale" in node:
        out = out @ Matrix.Diagonal((*node["scale"], 1.0))
    return out


def glb_height(path):
    """The height of a WRITTEN file, walking its node graph — the only measurement that counts.

    🛑 Not Blender's bounding boxes: they cover objects the exporter leaves out, and measuring
    that way made every character come out 13 % short without a word.
    """
    with open(path, "rb") as handle:
        data = handle.read()
    length = int.from_bytes(data[12:16], "little")
    document = json.loads(data[20 : 20 + length])

    found = []

    def walk(index, parent):
        node = document["nodes"][index]
        world = parent @ node_matrix(node)
        if "mesh" in node:
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                box = document["accessors"][primitive["attributes"]["POSITION"]]
                for low in (box["min"][1], box["max"][1]):
                    for x in (box["min"][0], box["max"][0]):
                        for z in (box["min"][2], box["max"][2]):
                            found.append((world @ Vector((x, low, z))).y)
        for child in node.get("children", []):
            walk(child, world)

    for root in document["scenes"][0]["nodes"]:
        walk(root, Matrix.Identity(4))
    return max(found) - min(found)


def measured_height():
    """The tallest point of every VISIBLE mesh — what the exporter will write, and nothing else."""
    top = -math.inf
    bottom = math.inf
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.visible_get():
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            top = max(top, world.z)
            bottom = min(bottom, world.z)
    return top - bottom


def merge_by_material():
    """One mesh per material rather than one per part — 113 draw calls is a budget, not a detail.

    Joining is done material by material so nothing is lost: a joined mesh keeps every material
    it was given, and the parts stay separable in the source file this never writes back to.
    """
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    groups = {}
    for obj in meshes:
        key = obj.data.materials[0].name if obj.data.materials else ""
        groups.setdefault(key, []).append(obj)

    for parts in groups.values():
        if len(parts) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for part in parts:
            part.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()

    return len([obj for obj in bpy.data.objects if obj.type == "MESH"])


def replace_brand_texture(texture):
    """Replaces the chest emblem before exporting every density of the shipped hero."""
    material = bpy.data.materials.get("IA_Studio_Logo")
    if material is None or material.node_tree is None:
        raise SystemExit("the hero no longer exposes its chest-logo material")

    image = bpy.data.images.load(texture, check_existing=False)
    image.name = "AI_Desktop_Studio_Logo"
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image = image
            material.name = "AI_Desktop_Studio_Logo"
            return
    raise SystemExit("the hero chest-logo material has no image texture")


def build_hero(source, target, height, texture):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=source)
    replace_brand_texture(texture)

    before = len([obj for obj in bpy.data.objects if obj.type == "MESH"])
    measured = measured_height()
    factor = height / measured

    # Scaled at the ROOT and applied: a skinned mesh scaled on its own would leave the armature
    # behind, and the pose would be read at the old size.
    for obj in bpy.data.objects:
        if obj.parent is None:
            obj.scale = (factor, factor, factor)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = next(iter(bpy.data.objects))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    after = merge_by_material()
    export_glb(target)

    # The written file is measured and the scale corrected once, rather than trusted: scaling is
    # linear, so one pass closes any gap between what Blender bounds and what the exporter writes.
    written = glb_height(target)
    if abs(written - height) > height * 0.005:
        for obj in bpy.data.objects:
            if obj.parent is None:
                obj.scale = (height / written,) * 3
        bpy.ops.object.select_all(action="SELECT")
        bpy.context.view_layer.objects.active = next(iter(bpy.data.objects))
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        export_glb(target)
        written = glb_height(target)

    return before, after, written, factor


CLIPS = {
    "Idle.fbx": "Idle",
    "Idle (1).fbx": "IdleShift",
    "Breathing Idle.fbx": "IdleBreathing",
    "Happy Idle.fbx": "IdleHappy",
    "Sad Idle.fbx": "IdleSad",
    "Standing W_Briefcase Idle.fbx": "IdleBriefcase",
    "Walking.fbx": "Walk",
    "Start Walking.fbx": "WalkStart",
    "Stop Walking.fbx": "WalkStop",
    "Left Strafe Walking.fbx": "StrafeLeft",
    "Right Strafe Walking.fbx": "StrafeRight",
    "Walking Turn 180.fbx": "TurnAround",
    "Left Turn W_Briefcase.fbx": "TurnLeft",
    "Right Turn W_ Briefcase.fbx": "TurnRight",
    "Jump.fbx": "Jump",
    "Running Jump.fbx": "RunningJump",
}

HERO_HEIGHT = 1.8

# The same character at four densities, the way the working textures ship at two — named by what
# they are FOR rather than by a triangle count, which changes the day the source is re-decimated.
# `ultra` is the mesh as authored; the other three are decimations measured at 0 weight errors.
HERO_LEVELS = (
    ("HeroLow", "optimization", "Robot_30k.glb"),
    ("HeroMedium", "optimization", "Robot_60k.glb"),
    ("HeroHigh", "optimization", "Robot_100k.glb"),
    ("HeroUltra", "game", "character.glb"),
)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    source, resources, texture = argv[0], argv[1], argv[2]
    # Names to build, or everything. A rebuild of what is already shipped is not free: the
    # exporter is not byte-stable across Blender versions, so relaunching for one added clip
    # would rewrite the ten beside it and put them in the diff.
    wanted = set(argv[3:])

    animations = os.path.join(resources, "animations")
    for file, name in CLIPS.items():
        if wanted and name not in wanted:
            continue
        folder = os.path.join(animations, name)
        os.makedirs(folder, exist_ok=True)
        target = os.path.join(folder, "animation.glb")
        renamed = build_clip(os.path.join(source, "game", "animations", file), target, name)
        print(f"[clip] {name}: {renamed} bones renamed → {os.path.getsize(target) // 1024} KB")

    # `characters/`, never `models/`: that folder holds the picture of each AI model, and a mesh
    # filed beside them would read as one more of those.
    characters = os.path.join(resources, "characters")
    os.makedirs(characters, exist_ok=True)
    for name, folder, file in HERO_LEVELS:
        if wanted and name not in wanted:
            continue
        target = os.path.join(characters, f"{name}.glb")
        before, after, measured, _factor = build_hero(
            os.path.join(source, folder, file), target, HERO_HEIGHT, texture
        )
        print(
            f"[hero] {name}: {measured:.3f} m written (asked {HERO_HEIGHT}), "
            f"{before} → {after} meshes, {os.path.getsize(target) // 1024} KB"
        )


main()
