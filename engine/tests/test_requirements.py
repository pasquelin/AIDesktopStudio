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
