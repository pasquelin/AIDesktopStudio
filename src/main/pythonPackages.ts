/**
 * How the Python side of the studio is classified for the notices — the third source
 * `collect-licences.mjs` had none of, and § F.4 of the engine spec named.
 *
 * The licence itself is NOT here: `uv.lock` carries none — measured 2026-08-22 on a 68-package
 * lock — and a table written by hand was measured wrong on its first try. `torch` is not
 * BSD-3-Clause but `Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND
 * BSD-3-Clause AND BSL-1.0 AND MIT`, and `numpy` is a composition of five. What states them is
 * each package's own `METADATA`, read by `scripts/collect-python-licences.mjs` into
 * `engine/licences.json` and committed — materialising the environment costs 682 Mo, and neither
 * the gate nor a clone should pay it to produce a notice.
 *
 * What lives here is the half a file cannot answer: which packages reach a person at all.
 */

/**
 * The interpreter, which IS in the installer — 67 Mo of `python-build-standalone`.
 *
 * Not in `engine/licences.json` because it is not a package of the lock: it is the runtime the
 * lock's packages run on. Its own licence is the PSF one; the build carries third-party pieces
 * under their own notices, which travel inside the archive rather than being restated here.
 */
export const INTERPRETER = {
  name: 'CPython',
  spdx: 'PSF-2.0',
  holder: 'the Python Software Foundation',
  source: 'https://github.com/astral-sh/python-build-standalone',
}

/**
 * What never leaves the machine that builds: the linter, the test runner, and their trees.
 *
 * Spelled out rather than derived from the `dev` group, for the reason `BUILD_ONLY` gives one
 * file over: deriving would answer "build tool" by default for something that may well ship.
 */
export const BUILD_ONLY_PYTHON: readonly string[] = [
  'colorama',
  'iniconfig',
  'pluggy',
  'pytest',
  'ruff',
]

/**
 * 🛑 **EMPTY, and it has to stay so.** It held the CUDA stack: under Linux the PyPI `torch` wheel
 * pulled it unconditionally — 5 638 MB of embedded runtime against 684 on macOS, measured
 * 2026-09-08 — and no such environment materialises here, so `collect-python-licences.mjs` had
 * never read a `METADATA` for any of it and the notice a Linux release shipped was INCOMPLETE.
 *
 * `engine/pyproject.toml` now takes `torch` from the PyTorch CPU index on Linux, so none of it is
 * locked, downloaded or distributed any more. A name reappearing here is a licence hole reopening.
 */
export const UNREAD_ON_THIS_PLATFORM: readonly string[] = []

/**
 * 🛑 **Locked, distributed everywhere, and their licences have NOT been read yet.**
 *
 * Different from `UNREAD_ON_THIS_PLATFORM`: those never materialise here at all, these have not
 * been collected since they were added — `collect-python-licences.mjs` reads a package's own
 * `METADATA`, which asks for the environment to exist on disk.
 *
 * 🛑 **A run of the collector would NOT empty this list**, measured 2026-08-23: `materialise()`
 * installs `--extra diffusion` and nothing else, so everything the `plugin` extra brings — the
 * whole 3d half — is unreachable to it. Closing the hole means installing every extra there.
 * `torchvision` is the exception since it joined `diffusion`: the next run WILL read it, and this
 * list and its count come down by one.
 */
export const UNREAD_PENDING_COLLECTION: readonly string[] = [
  'accelerate',
  'annotated-doc',
  'annotated-types',
  'anyio',
  'certifi',
  'charset-normalizer',
  'click',
  'diffusers',
  'h11',
  'hf-xet',
  'httpcore',
  'httpx',
  'huggingface-hub',
  'idna',
  'imageio',
  'imageio-ffmpeg',
  'importlib-metadata',
  'markdown-it-py',
  'mdurl',
  'peft',
  'psutil',
  'pydantic',
  'pydantic-core',
  'pygments',
  'pyyaml',
  'regex',
  'requests',
  'rich',
  'safetensors',
  'shellingham',
  'timm',
  'tokenizers',
  'torchvision',
  'tqdm',
  'transformers',
  'typer',
  'typing-inspection',
  'urllib3',
  'zipp',
  'antlr4-python3-runtime',
  'omegaconf',
  'trimesh',
  'attrs',
  'jsonschema',
  'jsonschema-specifications',
  'lazy-loader',
  'llvmlite',
  'numba',
  'platformdirs',
  'pooch',
  'pymatting',
  'referencing',
  'rembg',
  'rpds-py',
  'scikit-image',
  'scipy',
  'tifffile',
  'torchaudio',
  'pymcubes',
  'kiui',
  'roma',
  'plyfile',
  'executing',
  'objprint',
  'prompt-toolkit',
  'questionary',
  'varname',
  'wcwidth',
  'pytorch-lightning',
  'lightning-utilities',
  'torchmetrics',
  'jaxtyping',
  'typeguard',
  'wadler-lindig',
  'aiohappyeyeballs',
  'aiohttp',
  'aiosignal',
  'frozenlist',
  'multidict',
  'propcache',
  'yarl',
]

/** The engine's own package. It is the studio's code, under the studio's licence. */
export const ENGINE_PACKAGE = 'ai-desktop-studio-engine'
