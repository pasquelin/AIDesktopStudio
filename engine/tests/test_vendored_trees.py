"""What an over-trimmed vendor tree costs: an ImportError nothing here would otherwise reach.

The plugin extra is never installed by the gate, so no test imports these packages — reading their
import statements is what remains. Relative imports are the ones that matter: three of the five
trees write nothing else, so skipping them left this guard green over an empty set.
"""

import ast
from functools import cache
from pathlib import Path

import pytest

VENDOR = Path(__file__).resolve().parents[1] / "src/ia_studio_engine/vendor"

# The folder a package sits in, and the licence file that travels with it — TripoSR is vendored
# as `tsr`, the name its own imports use, so the pair cannot be derived from either half.
LICENCE_OF = {
    "craftsman": "CRAFTSMAN-LICENSE",
    "kimodo": "kimodo/LICENSE",
    "instantmesh": "INSTANTMESH-LICENSE",
    "lgm": "LGM-LICENSE",
    "triposg": "TRIPOSG-LICENSE",
    "tsr": "TRIPOSR-LICENSE",
    "make_it_animatable": "MAKE-IT-ANIMATABLE-LICENSE",
}

VENDORED = sorted(LICENCE_OF)


def _targets(file: Path, package: str, node: ast.AST) -> list[Path]:
    if isinstance(node, ast.Import):
        return [
            VENDOR.joinpath(*alias.name.split("."))
            for alias in node.names
            if alias.name.split(".")[0] == package
        ]
    if not isinstance(node, ast.ImportFrom):
        return []
    if node.level == 0:
        if not node.module or node.module.split(".")[0] != package:
            return []
        return [VENDOR.joinpath(*node.module.split("."))]

    home = file.parents[node.level - 1]
    if node.module:
        return [home.joinpath(*node.module.split("."))]
    # `from . import a, b` names its modules on the right rather than in `module`.
    return [home / alias.name for alias in node.names]


@cache
def _tree(file: Path) -> ast.Module:
    """Parsed once: 93 files of vendored Python, read by two guards and by the reachability walk."""
    return ast.parse(file.read_text(errors="ignore"), filename=str(file))


@cache
def _imports(package: str) -> tuple[tuple[Path, Path], ...]:
    found: list[tuple[Path, Path]] = []
    for file in sorted((VENDOR / package).rglob("*.py")):
        for node in ast.walk(_tree(file)):
            found += [(file, target) for target in _targets(file, package, node)]
    return tuple(found)


@pytest.mark.parametrize("package", VENDORED)
def test_every_internal_import_resolves(package: str) -> None:
    missing = [
        f"{file.relative_to(VENDOR)} -> {target.relative_to(VENDOR)}"
        for file, target in _imports(package)
        if not target.with_suffix(".py").exists() and not (target / "__init__.py").exists()
    ]

    assert missing == []


@pytest.mark.parametrize("package", VENDORED)
def test_a_tree_states_imports_this_guard_can_read(package: str) -> None:
    assert _imports(package) != ()


def test_the_licence_of_each_vendored_tree_travels_with_it() -> None:
    assert [name for name in LICENCE_OF.values() if not (VENDOR / name).is_file()] == []


def test_no_vendored_tree_is_left_without_a_licence() -> None:
    trees = {path.name for path in VENDOR.iterdir() if path.is_dir() and path.name != "__pycache__"}

    assert trees == set(LICENCE_OF)


ADAPTER = Path(__file__).resolve().parents[1] / "src/ia_studio_engine/adapters/plugin_adapter.py"
MOTION = Path(__file__).resolve().parents[1] / "src/ia_studio_engine/motion/plugin.py"
AUTORIG = Path(__file__).resolve().parents[1] / "src/ia_studio_engine/autorig/make_it_animatable.py"

#: Reached by a NAME read from a checkpoint's config rather than by an import, so no static reader
#: will ever see these. `tsr/system.py` builds every part through `find_class`; TripoSG's scheduler
#: is named by `model_index.json`, which `from_pretrained` imports — the
#: `FlowMatchEulerDiscreteScheduler` annotation in `pipelines/pipeline_triposg.py` has no runtime
#: effect, and reading it as the truth is what makes a static pass call these 332 lines dead.
#: huggingface.co/VAST-AI/TripoSG @ 2c1c516d22d58db486a058d98d31bb6177344e06 /model_index.json,
#: sha256 750af638d10fc67a5f43d19ef0a0d1d3d446174e24b73bddd0a49226016c80c2 — the digest
#: `src/shared/domain/localModels.json` already pins for that file.
REACHED_BY_NAME = {
    "tsr/models/nerf_renderer.py",
    "tsr/models/network_utils.py",
    "tsr/models/tokenizers/__init__.py",
    "tsr/models/tokenizers/image.py",
    "tsr/models/tokenizers/triplane.py",
    "tsr/models/transformer/__init__.py",
    "tsr/models/transformer/attention.py",
    "tsr/models/transformer/basic_transformer_block.py",
    "tsr/models/transformer/transformer_1d.py",
    "triposg/schedulers/__init__.py",
    "triposg/schedulers/scheduling_rectified_flow.py",
}


def _module_of(path: Path) -> Path | None:
    if (path / "__init__.py").exists():
        return path / "__init__.py"
    return path.with_suffix(".py") if path.with_suffix(".py").exists() else None


def _entry_points() -> set[str]:
    """What `plugin_adapter.py` opens: its own imports, plus the modules `_require` names."""
    named: set[str] = set()
    for entry_point in (ADAPTER, AUTORIG, MOTION):
        for node in ast.walk(ast.parse(entry_point.read_text())):
            if isinstance(node, ast.Import):
                named |= {alias.name for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module:
                named.add(node.module)
            elif (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "_require"
                and node.args
                and isinstance(node.args[0], ast.Constant)
            ):
                named.add(str(node.args[0].value))
    prefix = "ia_studio_engine.vendor."
    normalized = {name.removeprefix(prefix) for name in named}
    return {name for name in normalized if name.split(".")[0] in LICENCE_OF}


def _reached() -> set[Path]:
    """Every module importing an entry point runs, each package's `__init__.py` included."""
    seen: set[str] = set()
    found: set[Path] = set()
    queue = list(_entry_points())
    while queue:
        module = queue.pop()
        if module in seen:
            continue
        parts = module.split(".")
        file = _module_of(VENDOR.joinpath(*parts))
        if file is None:
            continue

        seen.add(module)
        found.add(file)
        # Importing `a.b.c` runs `a/__init__.py` and `a/b/__init__.py` on the way in.
        queue += [".".join(parts[:depth]) for depth in range(1, len(parts))]
        for node in ast.walk(_tree(file)):
            queue += [
                ".".join(target.relative_to(VENDOR).parts)
                for target in _targets(file, parts[0], node)
            ]

    return found


def test_no_vendored_module_is_unreachable_without_saying_why() -> None:
    """An over-trimmed tree is one failure; a tree carrying lines nothing opens is the other."""
    present = {
        path.relative_to(VENDOR).as_posix()
        for package in VENDORED
        for path in (VENDOR / package).rglob("*.py")
        if "__pycache__" not in path.parts
    }
    reached = {path.relative_to(VENDOR).as_posix() for path in _reached()}

    assert sorted(present - reached) == sorted(REACHED_BY_NAME)
