"""Panorama and mask, in numpy and Pillow alone — the gate never pays the 682 MB of `diffusion`."""

import numpy
import pytest
from PIL import Image

from aidesktopstudio_engine.adapters import skybox_fill
from aidesktopstudio_engine.adapters.skybox_fill import (
    FACES,
    HEIGHT,
    SCALE,
    WIDTH,
    _paint,
    _rays,
    view_to_panorama,
)


def _view(width: int = 1024, height: int = 768) -> Image.Image:
    grid = numpy.random.default_rng(11).integers(0, 256, (height, width, 3), dtype=numpy.uint8)
    return Image.fromarray(grid)


@pytest.fixture
def small(monkeypatch: pytest.MonkeyPatch) -> tuple[int, int]:
    """A canvas the gate can afford: where a ray lands depends on a pixel's ANGLE, never on how
    many there are — the one case that must see the shipped size says so in its name."""
    monkeypatch.setattr(skybox_fill, "WIDTH", 256)
    monkeypatch.setattr(skybox_fill, "HEIGHT", 128)
    return 256, 128


def test_a_view_becomes_the_canvas_of_the_shipped_size() -> None:
    panorama, mask = view_to_panorama(_view())

    assert panorama.size == (WIDTH, HEIGHT)
    assert mask.size == (WIDTH, HEIGHT)
    # A single channel: an inpainting mask read as RGB paints where it should have kept.
    assert mask.mode == "L"


def test_the_panorama_carries_no_alpha_of_its_own(small: tuple[int, int]) -> None:
    """The canvas is `numpy.empty` RGBA and the front face never writes its alpha: what drops it
    is `convert("RGB")` running BEFORE the resize, and nothing else says so."""
    del small
    panorama, _mask = view_to_panorama(_view())

    assert panorama.mode == "RGB"


def test_the_mask_keeps_the_front_and_opens_everything_else(small: tuple[int, int]) -> None:
    """Black is what FluxFill leaves alone, and the front face is the only thing already there."""
    width, height = small
    _panorama, mask = view_to_panorama(_view())
    read = numpy.asarray(mask)

    assert read[height // 2, width // 2] == 0
    assert read[height // 2, 0] == 255
    # Roughly a cube face out of six, and never everything or nothing.
    assert 0.1 < float((read == 0).mean()) < 0.25


def test_a_view_that_is_not_square_is_taken_from_its_middle(small: tuple[int, int]) -> None:
    width, height = small
    wide = numpy.zeros((400, 1200, 3), dtype=numpy.uint8)
    wide[:, :400] = (255, 0, 0)
    wide[:, 400:800] = (0, 255, 0)
    wide[:, 800:] = (0, 0, 255)

    panorama, _mask = view_to_panorama(Image.fromarray(wide))

    assert numpy.asarray(panorama)[height // 2, width // 2].tolist() == [0, 255, 0]


@pytest.mark.parametrize("at_once", [1, 2, 5])
def test_how_the_canvas_is_cut_and_shared_out_never_shows(
    at_once: int, monkeypatch: pytest.MonkeyPatch, small: tuple[int, int]
) -> None:
    """Bands and threads are an allocation strategy, never a visible one: the picture is one."""
    monkeypatch.setattr(skybox_fill, "BAND", 7)
    monkeypatch.setattr(skybox_fill, "BANDS_AT_ONCE", at_once)
    torn, torn_mask = view_to_panorama(_view())

    monkeypatch.setattr(skybox_fill, "BAND", small[1] * SCALE)
    monkeypatch.setattr(skybox_fill, "BANDS_AT_ONCE", 1)
    whole, whole_mask = view_to_panorama(_view())

    assert numpy.array_equal(numpy.asarray(torn), numpy.asarray(whole))
    assert numpy.array_equal(numpy.asarray(torn_mask), numpy.asarray(whole_mask))


def test_every_ray_is_a_direction() -> None:
    """A unit vector, or the face a pixel lands on is picked by a length rather than an angle."""
    xs, ys, zs = _rays(64, 32, slice(0, 32))

    assert numpy.allclose(numpy.sqrt(xs**2 + ys**2 + zs**2), 1.0)


def test_the_coarse_grid_is_every_other_ray_of_the_fine_one() -> None:
    """What lets the mask BE the front face's coverage, sampled, rather than a second painting."""
    fine = _rays(64 * SCALE, 32 * SCALE, slice(0, 32 * SCALE))
    coarse = _rays(64, 32, slice(0, 32))

    for sampled, own in zip((ray[::SCALE, ::SCALE] for ray in fine), coarse, strict=True):
        assert numpy.array_equal(sampled, own)


def test_every_face_of_the_cube_reaches_the_canvas() -> None:
    """A face nobody samples is a corner of the sky left unpainted — and two faces landing on the
    same region is what a per-face case could not see."""
    colours = {
        name: numpy.full((8, 8, 3), (index + 1) * 40, dtype=numpy.uint8)
        for index, name in enumerate(FACES)
    }
    painted = numpy.empty((128, 256, 4), dtype=numpy.uint8)

    _paint(colours, _rays(256, 128, slice(0, 128)), painted, numpy.empty((128, 256), dtype=bool))

    assert {int(one) for one in numpy.unique(painted[..., 0])} == {
        (index + 1) * 40 for index in range(len(FACES))
    }


def test_a_flat_face_is_written_as_a_word_and_a_textured_one_is_sampled() -> None:
    """The two paths through `_paint` must land the same colour; one of them skips the sampling."""
    flat = {name: numpy.full((1, 1, 3), 40, dtype=numpy.uint8) for name in FACES}
    textured = {name: numpy.full((8, 8, 3), 40, dtype=numpy.uint8) for name in FACES}

    read = []
    for faces in (flat, textured):
        painted = numpy.empty((64, 128, 4), dtype=numpy.uint8)
        _paint(faces, _rays(128, 64, slice(0, 64)), painted, numpy.empty((64, 128), dtype=bool))
        read.append(painted[..., :3].copy())

    assert numpy.array_equal(read[0], read[1])
