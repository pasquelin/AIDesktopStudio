# Contributing

AI Desktop Studio is an independent project, developed personally by Alban Pasquelin. Issues and
pull requests are welcome; so is a discussion before you write any code, because this repository
enforces more than most and it is quicker to hear that upfront than in review.

The source is published under the [PolyForm Noncommercial License 1.0.0](LICENSE). By opening a
pull request you agree that your contribution ships under that same licence.

---

## Setting up

**Requirements** — Node **24** (the version in `.nvmrc`, the one CI runs),
[pnpm 12.3.4 installed with its standalone installer](https://pnpm.io/installation) (Corepack does
not yet run pnpm 12), macOS / Windows / Linux, and [uv](https://docs.astral.sh/uv/) for the Python
engine.

```bash
pnpm install
pnpm rebuild:native   # better-sqlite3 against this Electron build
pnpm start
```

Running the studio needs an API key and secret from a generation provider, entered in
**Settings** (`⌘,` / `Ctrl+,`). Most of the codebase, and the whole test suite, run without one.

---

## The gate

`pnpm validate` must be green on the exact content you propose. It chains every check this
repository enforces — types, lint, format, dead exports, sizes, the Python engine, the build, and
a suite north of 9,000 colocated tests. The CI job runs that very command rather than a copy of
its links, so a green run locally is the same verdict.

While you are still writing, `pnpm check` answers in seconds and covers the fast links;
`pnpm typecheck`, `pnpm lint` and `pnpm test <path>` narrow it further. Run the full gate once,
when the change is finished.

`pnpm sizes:check` is the link that surprises people: strict physical-line limits on every
tracked source, tests included, with no debt baseline. [README ▸ Quality bar](README.md#quality-bar)
lists the numbers.

---

## Branches and commits

`develop` integrates, `main` publishes. Branch from `develop`, name it `feat/<subject>`, and open
your pull request against `develop` — release merges are the only ones that go into `main`.

Commit messages are written in French, in the imperative, and say what the change does rather
than which files it touched. The rest of the repository follows suit: everything under `src/` is
English — identifiers, comments, i18n keys, IPC channels, test descriptions — while
human-facing prose outside `docs/en/` and this README family is French.

---

## What a change is expected to carry

- **Tests written in the same movement as the code**, colocated with it, one per observable
  behaviour rather than one per branch.
- **No screen text in a component.** Strings live under an English key in
  `src/shared/i18n/{fr,en}/<section>.json`, and guards will tell you if one escapes.
- **No secret in the renderer.** Keys stay in the main process, encrypted by the OS keychain;
  every boundary crossing goes through the typed contracts in `src/shared/ipc.ts`.
- **No hand-written generation form.** Model inputs are discovered from the provider schema and
  rendered by `ModelRegistry` → `FieldDescriptor[]` → `<DynamicForm/>`.

[docs/en/architecture.md](docs/en/architecture.md) explains why each of these holds.

---

## Reporting

**A bug** — open an issue with what you did, what you expected, what happened, your OS and the
application version. A screenshot of the workspace usually saves a round trip.

**A vulnerability** — do not open a public issue. Use **Security ▸ Report a vulnerability** on
this repository, which reaches the maintainer privately.
