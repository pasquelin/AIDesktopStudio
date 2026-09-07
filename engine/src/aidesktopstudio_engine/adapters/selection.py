"""EfficientSAM ONNX sessions kept by the existing supervised selection door."""

from __future__ import annotations

from pathlib import Path
from typing import Any


class EfficientSam:
    """One encoder/decoder pair and one image embedding, released together."""

    def __init__(self) -> None:
        self._encoder: Any = None
        self._decoder: Any = None
        self._embedding: Any = None
        self._size: tuple[int, int] | None = None

    def load(self, folder: str) -> None:
        import onnxruntime

        root = Path(folder)
        self._encoder = onnxruntime.InferenceSession(
            str(root / "efficientsam_ti_encoder.onnx"), providers=["CPUExecutionProvider"]
        )
        self._decoder = onnxruntime.InferenceSession(
            str(root / "efficientsam_ti_decoder.onnx"), providers=["CPUExecutionProvider"]
        )

    def encode(self, image: str) -> dict[str, int]:
        import numpy
        from PIL import Image

        if self._encoder is None:
            raise RuntimeError("EfficientSAM is not loaded")
        source = Image.open(image).convert("RGB")
        self._size = source.size
        pixels = numpy.asarray(source.resize((1024, 1024)), dtype=numpy.float32) / 255.0
        tensor = numpy.transpose(pixels, (2, 0, 1))[None, ...]
        self._embedding = self._encoder.run(None, {self._encoder.get_inputs()[0].name: tensor})[0]
        return {"width": source.width, "height": source.height}

    def decode(
        self, point: list[float] | None, box: list[float] | None, destination: str
    ) -> dict[str, Any]:
        import numpy
        from PIL import Image

        if self._decoder is None or self._embedding is None or self._size is None:
            raise RuntimeError("EfficientSAM has no embedding")
        width, height = self._size
        prompts = (
            [[[[point[0] * 1024 / width, point[1] * 1024 / height]]]]
            if point is not None
            else [
                [
                    [
                        [box[0] * 1024 / width, box[1] * 1024 / height],
                        [box[2] * 1024 / width, box[3] * 1024 / height],
                    ]
                ]
            ]
        )
        labels = [[[1]]] if point is not None else [[[2, 3]]]
        inputs = self._decoder.get_inputs()
        values = {
            inputs[0].name: self._embedding,
            inputs[1].name: numpy.asarray(prompts, dtype=numpy.float32),
            inputs[2].name: numpy.asarray(labels, dtype=numpy.float32),
            inputs[3].name: numpy.asarray([1024, 1024], dtype=numpy.int64),
        }
        mask = self._decoder.run(None, values)[0][0, 0, 0]
        bitmap = (mask > 0).astype(numpy.uint8) * 255
        return write_mask(
            Image.fromarray(bitmap).resize((width, height), Image.Resampling.NEAREST), destination
        )

    def unload(self) -> None:
        self._embedding = None
        self._size = None
        self._encoder = None
        self._decoder = None


def write_mask(image: Any, destination: str) -> dict[str, Any]:
    """
    The frame NAMES the mask, it does not carry it — `envelope.py` opens on that rule.

    Two bytes of JSON per pixel in hex: 4 147 200 for one click on a 1920x1080 composite, 16.6 MB
    of text on a single line in 4K, where the PNG of the same mask is 5 450 bytes.
    """
    image.save(destination)
    return {"width": image.width, "height": image.height, "mask": destination}
