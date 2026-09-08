"""
What the core can say about an environment it never imports.

The three answers the studio acts on are absent, older than declared, and ready — and the fourth,
a declaration it cannot find, has to read as "nothing asked" rather than as an environment ruined.
"""

from pathlib import Path

import pytest

from aidesktopstudio_engine.core import requirements

DECLARATION = """
[project]
name = "probe"
[project.optional-dependencies]
diffusion = [
  "ai-desktop-studio-engine",
  "pytest>=1.0",
  "not-a-package-anyone-installed>=3.0",
]
"""


@pytest.fixture
def declared(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    project = tmp_path / "pyproject.toml"
    project.write_text(DECLARATION)
    monkeypatch.setattr(requirements, "PROJECT", project)
    return project


def test_the_engine_itself_is_not_something_to_install(declared: Path) -> None:
    """`plugin` names an engine extra that must never be handed to `pip`."""
    assert requirements.declared() == ["pytest>=1.0", "not-a-package-anyone-installed>=3.0"]


def test_a_package_no_dist_info_names_is_absent(declared: Path) -> None:
    survey = requirements.survey()

    assert [one["name"] for one in survey["absent"]] == ["not-a-package-anyone-installed"]
    assert survey["complete"] is False


def test_a_package_older_than_declared_is_stale_rather_than_absent(
    declared: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(requirements, "version", lambda name: "0.1")
    survey = requirements.survey()

    assert [one["name"] for one in survey["stale"]] == ["pytest", "not-a-package-anyone-installed"]
    assert survey["absent"] == []


def test_a_declaration_that_is_not_there_asks_for_nothing(tmp_path, monkeypatch) -> None:
    """A packaged app whose `pyproject.toml` did not travel reads as nothing asked, not as ruin."""
    monkeypatch.setattr(requirements, "PROJECT", tmp_path / "absent.toml")

    assert requirements.survey()["complete"] is True


@pytest.mark.parametrize(
    ("installed", "specifier", "satisfied"),
    [
        ("2.13.0", ">=2.6", True),
        ("2.1.0", ">=2.6", False),
        ("2.6", ">=2.6", True),
        ("0.28.0", "==0.28", True),
        ("0.27.0", "==0.28", False),
        ("2.13.0", ">=2.6,<3", True),
        ("3.0.0", ">=2.6,<3", False),
        ("2.13.0rc1", ">=2.6", True),
    ],
)
def test_a_version_is_compared_on_its_release_numbers(
    installed: str, specifier: str, satisfied: bool
) -> None:
    """The last case is the blind spot in the open: a pre-release reads as its numbers."""
    assert requirements._satisfies(installed, specifier) is satisfied


def stated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, source: str | None) -> None:
    """Stands in for the installed torch, whose `version.py` is a generated text file."""

    def locate(_name: str) -> object:
        if source is None:
            raise requirements.PackageNotFoundError
        written = tmp_path / "version.py"
        written.write_text(source, encoding="utf-8")
        return type("Found", (), {"locate_file": staticmethod(lambda _path: written)})

    monkeypatch.setattr(requirements, "distribution", locate)


def test_reads_the_cuda_a_torch_was_built_against(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    stated(tmp_path, monkeypatch, "cuda: Optional[str] = '12.6'\n")

    assert requirements.torch_cuda() is True


def test_a_torch_built_without_cuda_is_a_certain_no(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PyPI's Windows wheel carries no `+cpu` suffix, and this is what still sees it."""
    stated(tmp_path, monkeypatch, "cuda: Optional[str] = None\n")

    assert requirements.torch_cuda() is False


def test_a_torch_nobody_installed_answers_unknown(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    stated(tmp_path, monkeypatch, None)

    assert requirements.torch_cuda() is None


def test_a_version_file_it_cannot_read_answers_unknown(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unknown leaves the caller trusting the card — it must never read as "no CUDA"."""
    stated(tmp_path, monkeypatch, "__version__ = '2.14.0'\n")

    assert requirements.torch_cuda() is None
