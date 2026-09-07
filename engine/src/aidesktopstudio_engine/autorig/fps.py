import numpy as np
import numpy.typing as npt


def farthest_point_indices(points: npt.NDArray[np.float32], count: int) -> npt.NDArray[np.int64]:
    if points.ndim != 2 or points.shape[1] < 3:
        raise ValueError("points must have shape (N, D) with at least three coordinates")
    if count < 1 or count > len(points):
        raise ValueError("count must select between one and every point")
    coordinates = points[:, :3]
    center = coordinates.mean(axis=0)
    current = int(np.argmax(np.sum((coordinates - center) ** 2, axis=1)))
    distances = np.full(len(points), np.inf, dtype=np.float32)
    selected = np.empty(count, dtype=np.int64)

    for index in range(count):
        selected[index] = current
        delta = coordinates - coordinates[current]
        np.minimum(distances, np.einsum("ij,ij->i", delta, delta), out=distances)
        distances[selected[: index + 1]] = -np.inf
        current = int(np.argmax(distances))

    return selected
