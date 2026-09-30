# Agent Instructions

`~/.config/herdr/DEVELOPMENT_TEAM.md` (symlinked here as `TEAM.md`) is the global
master **template**. It is not automatically loaded by any agent. The rules below
are the operational subset that must always apply, copied here because this file
_is_ automatically loaded (Codex and Pi read `AGENTS.md`; see
`~/.claude/CLAUDE.md` for the Claude-side copy).

Project-specific instructions further down override the team policy.

## Herdr team policy (operational subset)

### Roles and verified runtime models

| Role                     | Runtime identifier                                                                                           | Notes                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Orchestrator             | `gpt-5.6-sol`, `model_reasoning_effort = "medium"`                                                           | default; set in `~/.codex/config.toml`                               |
| Orchestration escalation | `gpt-5.6-sol`, effort `high`                                                                                 | hard reasoning only, not routine                                     |
| Cheap coordination       | `gpt-5.6-luna`                                                                                               | summaries, routing, repetitive coordination                          |
| Local bounded worker     | Pi — `Qwen3.8-27B-64K-MTP` by default, `Qwen-daily-64K` or `Qwen-daily-262K` for wider context (table below) | served by llama.cpp at `http://ai01.home.alpnetsolutions.it:8080/v1` |
| Default Claude worker    | `claude-sonnet-5-5`                                                                                          | complex/multi-file implementation and review                         |
| Claude escalation        | `claude-opus-5-5`                                                                                            | hardest debugging, architecture, high-risk review                    |
| Optional specialist      | `claude-fable-5-1`                                                                                           | very large or long-horizon tasks; never a default                    |

`claude-haiku-5-5` is **not** available in this installation — do not configure it
as a worker. Do not assume Mythos exists.

### Local worker model selection

All three aliases stay available; choose per task rather than always taking the
default.

| Alias                 | Context | Reasoning | Choose it when                                                                                                        |
| --------------------- | ------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `Qwen3.8-27B-64K-MTP` | 64K     | `medium`  | Default. Bounded work in one module, a few files, clear acceptance criteria. Also accepts images.                     |
| `Qwen-daily-64K`      | 64K     | no        | Spans several files but needs little reasoning: mechanical refactors, lint/type fixes, boilerplate, repetitive edits. |
| `Qwen-daily-262K`     | 262K    | `medium`  | Wide repository sweeps, large files, or a long thread that would otherwise compact.                                   |

Start at `Qwen3.8-27B-64K-MTP` and widen only when the scope genuinely does not fit.
Running out of context is not a reason to escalate to Sonnet — pick the wider
alias. Escalate to Sonnet when the task is _reasoning_-hard; a task needing both
deep reasoning and very wide context is a Sonnet task.

Escalation is stepwise, never a jump:

```text
coding:        Qwen -> claude-sonnet-5-5 -> claude-opus-5-5
orchestration: terra -> sol
```

Do not invoke Opus and Sol for the same problem. Escalate for reasoning
complexity, not for task size.

### Mandatory delegation inside Herdr

When `HERDR_ENV=1`, the orchestrator must not implement a substantial approved
plan by itself. Before writing source code:

1. Classify every plan item as orchestrator-only, Qwen, Sonnet, or parallelizable.
2. Create or reuse a worker pane for each delegatable item.
3. Delegate with a full assignment (below) before substantial implementation.
4. Run independent items in parallel where file ownership does not overlap.
5. Wait for results, review them, integrate centrally, update `.herdr/STATUS.md`.

"Start the plan" is not permission to implement every step in the orchestrator
session. The orchestrator may code directly only for trivial edits, integration
fixes, merge-conflict resolution, orchestration-specific changes, or when no
suitable worker exists.

### Spawning workers (Herdr native only)

Do not build custom orchestration wrappers. Inspect `herdr agent` first, then:

```sh
# reuse an idle worker when the next task is closely related
herdr agent list

# otherwise create a sibling pane, preserving cwd and the user's focus
herdr pane split --current --direction right --cwd "$PWD" --no-focus
# -> read .result.pane.pane_id

# model selection is passed through after `--`
herdr agent start qwen-1     --kind pi     --pane <pane-id> -- --model Qwen3.8-27B-64K-MTP
herdr agent start sonnet-1   --kind claude --pane <pane-id> -- --model claude-sonnet-5-5
herdr agent start opus-review --kind claude --pane <pane-id> -- --model claude-opus-5-5
herdr agent start sol-review --kind codex  --pane <pane-id> -- -m gpt-5.6-sol -c model_reasoning_effort=medium

herdr agent prompt sonnet-1 "<assignment>" --wait --timeout 600000
herdr agent read   sonnet-1 --source recent-unwrapped --lines 160
```

Start only the orchestrator by default. Create workers on demand, do not keep
idle workers alive, and prefer a fresh worker for unrelated work.

### Assignment format

Every delegated task states: **Goal**, **Scope** (exact paths), **Constraints**
(interfaces and behavior that must not change), **Acceptance Criteria**, and
**Validation**. Tell the worker to read files itself rather than pasting them.
Keep Qwen assignments bounded, explicit, and independently testable; Qwen does
not own architectural decisions. Give it paths, not pasted file contents, and
start a fresh worker for unrelated work rather than letting one session compact.
Pick the alias that fits the scope before assuming the work is too big for Qwen.

### Worker output contract

A worker reports Summary, Files changed, Tests run, Test results, Assumptions,
Unresolved issues, and a commit hash when applicable. Never just "done".
Workers do not expand scope and do not edit `.herdr/STATUS.md` — they report to
the orchestrator, which maintains it.

### Validation and review

No task is complete until validation has run: targeted tests, then lint/format,
type checks, broader tests, and build before integration. Do not run the full
suite after every small edit.

Require an independent reviewer (not the implementing agent) for auth,
authorization, permissions, security boundaries, database migrations, payments,
concurrency, public APIs, destructive operations, deployment, and production
configuration. Preferred: Qwen implements, Sonnet reviews, Terra integrates.

### Parallel work and git

Parallelize only where file ownership is independent. For substantial concurrent
implementation use separate branches or worktrees (`agent/<worker>-<topic>`).
Workers must never force-push, rewrite shared history, reset another worker's
work, delete another worker's worktree, or overwrite unrelated uncommitted
changes. The orchestrator owns integration.

### State

Repository state is the source of truth, not conversation history. Canonical
state lives in git, source, tests, this file, `.herdr/STATUS.md`, and `docs/`.
Substantial delegated work may use `.herdr/tasks/{active,done,failed}/`; do not
create a task file for every trivial operation. Keep `STATUS.md` concise — no
raw logs, no transcripts, no long stack traces.

### Failure handling

Read the worker's output, classify the failure (implementation, environment,
dependency, misunderstanding, insufficient context, architectural), then change
the assignment or context. Never resend an identical prompt.
