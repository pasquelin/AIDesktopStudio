"""Turn a front view into the 2048x1024 canvas and mask a FluxFill panorama expects."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from functools import cache
from typing import Any

WIDTH, HEIGHT = 2048, 1024
#: The panorama is painted at twice the canvas and reduced, which is what softens the face seams.
SCALE = 2
#: Rows painted at a time, and how many bands run at once. The grid is independent line by line:
#: holding all of it resident cost 551 MB in the door that is about to ask FluxFill for the device,
#: where 2x32 holds 61 MB. Two threads and not more — every ufunc below releases the GIL, and
#: measured on 4096x2048 the pair takes 245 ms down to 182 with the peak unchanged.
BAND, BANDS_AT_ONCE = 32, 2

FACES = ("front", "back", "left", "right", "top", "bottom")
#: The five a panorama grown from ONE view has nothing to put on. `FACES[0]` is the view itself.
AROUND = FACES[1:]


def view_to_panorama(image: Any) -> tuple[Any, Any]:
    import numpy
    from PIL import Image

    side = min(image.size)
    left = (image.size[0] - side) // 2
    top = (image.size[1] - side) // 2
    faces = {
        "front": numpy.asarray(image.crop((left, top, left + side, top + side)).resize((512, 512))),
        # A single pixel IS the face: five of the six are one colour, and `_paint` fills those
        # through a word of the canvas rather than sampling a texture for the answer it has.
        **dict.fromkeys(AROUND, numpy.full((1, 1, 3), 255, dtype=numpy.uint8)),
    }

    width, height = WIDTH * SCALE, HEIGHT * SCALE
    painted = numpy.empty((height, width, 4), dtype=numpy.uint8)
    front = numpy.empty((height, width), dtype=bool)

    def paint_band(start: int) -> None:
        rows = slice(start, min(start + BAND, height))
        _paint(faces, _rays(width, height, rows), painted[rows], front[rows])

    # Each band writes its OWN rows of `painted` and `front`, so nothing is shared but the read.
    with ThreadPoolExecutor(max_workers=BANDS_AT_ONCE) as pool:
        list(pool.map(paint_band, range(0, height, BAND)))

    # 🛑 `convert` BEFORE `resize`, and the order is load-bearing: the front face never writes
    # the alpha of a `numpy.empty` canvas, so resizing first would interpolate whatever was there.
    panorama = (
        Image.fromarray(painted, "RGBA").convert("RGB").resize((WIDTH, HEIGHT), Image.LANCZOS)
    )
    # 🛑 Every OTHER ray of the same grid IS the grid of the smaller one — `theta` depends on
    # `x / out_w` alone. So the mask IS the front face's coverage, sampled: painting it a second
    # time read the same six faces over again for an answer already in hand.
    mask = numpy.where(front[::SCALE, ::SCALE], numpy.uint8(0), numpy.uint8(255))
    return panorama, Image.fromarray(mask, "L")


@cache
def _rotation() -> Any:
    """The 90/-90/180 the panorama is turned by. Built once rather than at each band."""
    import numpy

    rx, ry, rz = numpy.deg2rad([90, -90, 180])
    return (
        numpy.array(
            [[numpy.cos(rz), -numpy.sin(rz), 0], [numpy.sin(rz), numpy.cos(rz), 0], [0, 0, 1]]
        )
        @ numpy.array(
            [[numpy.cos(ry), 0, numpy.sin(ry)], [0, 1, 0], [-numpy.sin(ry), 0, numpy.cos(ry)]]
        )
        @ numpy.array(
            [[1, 0, 0], [0, numpy.cos(rx), -numpy.sin(rx)], [0, numpy.sin(rx), numpy.cos(rx)]]
        )
    )


def _rays(out_w: int, out_h: int, rows: slice) -> tuple[Any, Any, Any]:
    """
    Where the pixels of `rows` look — 🛑 broadcast, never `meshgrid`: `theta` depends on the
    column alone and `phi` on the row alone, so the grids are never all resident.
    """
    import numpy

    theta = (numpy.arange(out_w) / out_w) * 2 * numpy.pi - numpy.pi
    phi = ((numpy.arange(*rows.indices(out_h)) / out_h) * numpy.pi - numpy.pi / 2)[:, None]
    cos_phi, sin_phi = numpy.cos(phi), numpy.sin(phi)
    cos_theta, sin_theta = numpy.cos(theta), numpy.sin(theta)

    # One plane at a time, and the two `theta` terms summed on a ROW before they meet `phi`: the
    # second outer product was a full grid built to be thrown away.
    planes = []
    for row in _rotation():
        plane = cos_phi * (row[0] * cos_theta + row[1] * sin_theta)
        plane += row[2] * sin_phi
        planes.append(plane)
    return tuple(planes)


def _paint(faces: dict[str, Any], rays: tuple[Any, Any, Any], into: Any, front: Any) -> None:
    """Writes the band `rays` covers into `into`, and the front face's own coverage into `front`."""
    import numpy

    xs, ys, zs = rays
    abs_x, abs_y, abs_z = numpy.abs(xs), numpy.abs(ys), numpy.abs(zs)
    # Which axis dominates, as three BOOLEAN planes. `argmax` over a stack laid a fourth full plane
    # beside the three it compares and answered in int64; `>=` reproduces its tie-breaking.
    on_x = (abs_x >= abs_y) & (abs_x >= abs_z)
    on_y = ~on_x & (abs_y >= abs_z)
    on_z = ~(on_x | on_y)

    words = into.view(numpy.uint32).reshape(xs.shape)
    samples = {
        "right": (on_x, xs > 0, zs, -1, ys, 1, abs_x),
        "left": (on_x, xs < 0, zs, 1, ys, 1, abs_x),
        "bottom": (on_y, ys > 0, xs, 1, zs, -1, abs_y),
        "top": (on_y, ys < 0, xs, 1, zs, 1, abs_y),
        "front": (on_z, zs > 0, xs, 1, ys, 1, abs_z),
        "back": (on_z, zs < 0, xs, -1, ys, 1, abs_z),
    }
    for name, (axis, half, u_num, u_sign, v_num, v_sign, den) in samples.items():
        covered = axis & half
        if name == "front":
            numpy.copyto(front, covered)
        _paint_face(faces[name], covered, u_num, u_sign, v_num, v_sign, den, into, words)


def _paint_face(
    face: Any,
    covered: Any,
    u_num: Any,
    u_sign: int,
    v_num: Any,
    v_sign: int,
    den: Any,
    into: Any,
    words: Any,
) -> None:
    import numpy

    # 🛑 `[M]` A one-pixel face is a flat colour, written as a 32-bit WORD through a view of the
    # canvas. The same fill spelled as an RGB triple broadcast into `(h, w, 3)` cost 225 ms of
    # the 605 this function took, for five faces of six.
    if face.shape[:2] == (1, 1):
        # `[?]` Little-endian, which every target of this build is: on a big-endian machine
        # red and blue would swap in silence. Measured nowhere else, so it is written here.
        red, green, blue = (int(one) for one in face[0, 0])
        packed = numpy.uint32(red | green << 8 | blue << 16 | 0xFF000000)
        numpy.copyto(words, packed, where=covered)
        return

    # The face's own axis divides both: a cube face is square, so one denominator.
    on_face = den[covered]
    u = (u_sign * u_num[covered] / on_face + 1) / 2
    v = (v_sign * v_num[covered] / on_face + 1) / 2
    fh, fw = face.shape[:2]
    # Boolean indexing on both sides: the destinations are the covered pixels themselves, in
    # the same order, which is what a grid of coordinates was being carried to spell out.
    # Only the three colour channels: `convert("RGB")` drops alpha without compositing, so
    # filling it was 8 ms of work nothing ever read.
    into[covered, :3] = face[
        numpy.clip((v * fh).astype(int), 0, fh - 1),
        numpy.clip((u * fw).astype(int), 0, fw - 1),
    ]
