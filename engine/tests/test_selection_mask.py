"""The mask leaves as a file, not as hex in the frame — numpy and Pillow alone, no onnxruntime."""

from pathlib import Path

import numpy
from PIL import Image

from ia_studio_engine.adapters.selection import write_mask


def test_writes_the_mask_as_a_png_and_names_it(tmp_path: Path) -> None:
    bitmap = numpy.zeros((3, 5), dtype=numpy.uint8)
    bitmap[1, 2] = 255
    destination = str(tmp_path / "mask.png")

    frame = write_mask(Image.fromarray(bitmap), destination)

    assert frame == {"width": 5, "height": 3, "mask": destination}
    reopened = numpy.asarray(Image.open(destination))
    assert reopened.shape == (3, 5)
    assert set(numpy.unique(reopened)) == {0, 255}
    assert reopened[1, 2] == 255
