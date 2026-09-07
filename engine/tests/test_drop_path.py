import pytest

torch = pytest.importorskip("torch")
DropPath = pytest.importorskip("aidesktopstudio_engine.autorig.drop_path").DropPath


def test_drop_path_preserves_inference_values() -> None:
    layer = DropPath(0.5).eval()
    values = torch.arange(24, dtype=torch.float32).reshape(2, 3, 4)

    assert torch.equal(layer(values), values)


def test_drop_path_drops_complete_training_samples() -> None:
    torch.manual_seed(1)
    result = DropPath(0.5).train()(torch.ones((8, 3, 4)))

    assert set(result.unique().tolist()) == {0.0, 2.0}
    assert all(sample.unique().numel() == 1 for sample in result)
