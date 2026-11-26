# Workspace Agent Instructions

This repository is a multi-project monorepo containing independent sub-projects in top-level directories alongside reference directories. There is **no root `package.json`, workspace manager, or shared lint/CI config**—every sub-project is standalone with its own toolchain and lockfile (`npm`, `yarn`, or `uv`/Python). Always run commands inside the target sub-project directory using its own package manager.

## 1. Sub-Project Discovery & Scope

- **Identify the target sub-project first.** Before editing files or running commands, inspect the relevant top-level directory and read any `AGENTS.md` along the path (especially `<sub-project>/AGENTS.md`).
- **Precedence:** Deeper, more specific `AGENTS.md` files override this root file wherever they conflict.
- **Read-only reference directories:** `logseq-marketplace/` and `logseq-plugin-samples/` are checked-in reference directories. You may read them to inspect Logseq API patterns and examples, but **never modify them** unless explicitly asked.
- **Stay strictly scoped:** Only edit files inside the active sub-project. Do not modify sibling sub-projects, reference directories, or root-level configs unless explicitly asked.

## 2. Logseq Plugin Conventions

- **Target platform:** Logseq plugins in this repo target **Logseq OG** (`@logseq/libs` 0.0.17 / Markdown graphs) unless a sub-project explicitly states otherwise.
- **Preserve plugin contracts:** Do not alter `package.json`'s `logseq` metadata block (`id`, `icon`, `main`, etc.), `useSettingsSchema` keys/defaults, slash commands, macro syntax, block property formats, persisted comment/metadata schemas, or host DOM/CSS hooks unless explicitly asked.
- **Build artifacts:** Keep `dist/` and `node_modules/` gitignored/untracked; verify production builds generate `dist/` cleanly where applicable.

## 3. Maintaining Sub-Project `AGENTS.md` Files

- **New sub-projects:** When scaffolding a new sub-project, create a concise `<sub-project>/AGENTS.md` covering: purpose, tech stack, install/run/build/test/lint commands, key entry points, and any gotchas or overrides to this file.
- **Keep current, not bloated:** Update `<sub-project>/AGENTS.md` when core stack, commands, or architecture change. Record durable facts—never changelogs or temporary task notes.

## 4. Autonomy & Planning

- Act directly on small, clear, well-scoped tasks.
- Before large, ambiguous, architectural, cross-project, or destructive changes, pause to clarify assumptions or share a brief plan first.

## 5. Engineering Standards

- **Minimal, scoped diffs:** Match the sub-project's existing conventions, style, and tooling. Avoid drive-by refactors, unrelated formatting, and speculative abstractions.
- **Testing:** Write or update automated tests for non-trivial logic changes in sub-projects that have a test runner (e.g., Vitest in `logseq-notion-table`, `e2e_test.sh` in `LogSeqToObsidian`). For single-file vanilla JS/DOM Logseq plugins without a test runner, do not force a test framework unless introducing non-trivial pure logic; verify with available checks and document manual Logseq smoke tests.
- **Verification:** Run relevant build, lint, typecheck, test, or smoke checks in the touched sub-project before finishing. Never claim unverified results; explicitly state what was run and what could not be verified.
- **Dependencies & shared config:** Reuse existing libraries and tooling. Keep new dependencies justified, and ask before adding heavy dependencies or changing shared/root configuration.
- **Docs in sync:** Update the sub-project's `README.md` alongside behavioral, setup, or CLI/usage changes.
- **Secrets & hygiene:** Never read, print, hardcode, or commit secrets (`.env`, API keys, tokens, credentials). Clean up or `.gitignore` temporary and generated artifacts.

## 6. Git Guardrails

- Never commit, push, merge, rebase, or run destructive git commands (`reset --hard`, `checkout --`, `clean -fd`, `push --force`) unless explicitly asked.
- When asked to commit, stage **only** files in the active sub-project (never `git add -A` or `git add .` at the repo root) and prefix commit messages with the sub-project name (e.g., `<sub-project>: fix parser edge case`).

## 7. Problem Solving & Communication

- Diagnose and fix root causes rather than papering over symptoms or swallowing errors.
- Surface blockers, trade-offs, and assumptions clearly instead of guessing silently.
