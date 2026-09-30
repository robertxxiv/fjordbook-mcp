# Global Herdr Development Team Policy

**This file is the master template. No agent loads it automatically.** The
operational subset that must always apply is mirrored into the instruction files
that *are* auto-loaded:

- `AGENTS.md` in each project — read by Codex (Terra/Sol/Luna) and by Pi.
- `~/.claude/CLAUDE.md` — read by every Claude session; Claude Code does not
  read `AGENTS.md`.

When this template changes, re-sync those two files. Do not rely on a
"read `~/.config/herdr/DEVELOPMENT_TEAM.md`" instruction alone.

## Verified runtime model identifiers

Discovered from the installed tooling on 2026-09-30. Do not substitute guessed
IDs; re-verify after a CLI update.

| Role | Identifier | Where it is set |
| --- | --- | --- |
| Orchestrator | `gpt-5.6-sol`, effort `medium` | `~/.codex/config.toml`: `model`, `model_reasoning_effort` |
| Orchestration escalation | `gpt-5.6-sol`, effort `high` | per-launch: `-m gpt-5.6-sol -c model_reasoning_effort=high` |
| Cheap coordination | `gpt-5.6-luna` | per-launch `-m` |
| Local bounded worker | `Qwen3.8-27B-64K-MTP` is the default; `Qwen-daily-64K` and `Qwen-daily-262K` stay available for wider context. The orchestrator picks per task — see "Local worker model selection". | `~/.pi/agent/settings.json`: `defaultModel`; per-launch `--model` |
| Default Claude worker | `claude-sonnet-5-5` | per-launch `--model` |
| Claude escalation | `claude-opus-5-5` | per-launch `--model` |
| Optional Claude specialist | `claude-fable-5-1` | per-launch `--model`; never a default |

`claude-haiku-5-5` is rejected by the installed Claude Code catalog — do not
configure it. Do not make anything depend on Mythos.

Other models the local llama.cpp server exposes at
`http://ai01.home.alpnetsolutions.it:8080/v1`: `Qwen-daily`,
`KAT-Coder`, `Gemma-4-26B-A4B`. The alias-to-`.gguf` mapping lives in the
llama-swap config on `ai01`, not on this host, so the weights behind the
`Qwen-daily*` aliases are unverified from here; the `Qwen3.8-27B-64K-MTP`
default is likewise mapped in the llama-swap config on `ai01`, not on this host.

## Spawning workers with Herdr native commands

```sh
herdr agent list                                    # reuse an idle related worker first
herdr pane split --current --direction right --cwd "$PWD" --no-focus
# -> .result.pane.pane_id

herdr agent start qwen-1      --kind pi     --pane <id> -- --model Qwen3.8-27B-64K-MTP
herdr agent start sonnet-1    --kind claude --pane <id> -- --model claude-sonnet-5-5
herdr agent start opus-review --kind claude --pane <id> -- --model claude-opus-5-5
herdr agent start sol-review  --kind codex  --pane <id> -- -m gpt-5.6-sol -c model_reasoning_effort=medium

herdr agent prompt sonnet-1 "<assignment>" --wait --timeout 600000
herdr agent read   sonnet-1 --source recent-unwrapped --lines 160
```

Native agent arguments go after `--`. `herdr agent start` needs an existing pane
sitting at its shell prompt; it never creates layout itself.

## Orchestration

The primary orchestrator is GPT-5.6 Terra.

Default reasoning level:
- Terra: `model_reasoning_effort = "high"` in `~/.codex/config.toml`.
  (`plan_mode_reasoning_effort` is deliberately left at `high`: planning is
  where Terra should think hardest.) A running Terra session must be restarted
  to pick up a change to that file.
- Escalate to GPT-5.6 Sol Medium only for difficult architecture,
  debugging, cross-module reasoning, or conflicting agent results.
- Luna may be used for cheap routing, summarization, repository
  exploration, and repetitive coordination.

Do not invoke Opus and Sol for the same problem. Escalate for reasoning
complexity, not for task size.

## Coding Team

Available workers:

- Claude Sonnet 5.5 (`claude-sonnet-5-5`) — the default strong Claude worker
  - complex and multi-file implementation
  - architecture-sensitive changes
  - difficult debugging and difficult test failures
  - code review, including review of Qwen-generated code
  - security-sensitive implementation and review
  - unfamiliar code, repository-wide reasoning
  - API, database, concurrency, and integration work

  Normally the first Claude model used once a task exceeds Qwen's comfortable
  scope.

- Claude Opus 5.5 (`claude-opus-5-5`) — escalation only
  - extremely difficult debugging
  - complex or highly ambiguous architecture
  - large cross-cutting refactors, high-risk migrations
  - subtle concurrency, difficult security-sensitive design
  - conflicting solutions from other agents, or repeated Sonnet failure
  - high-impact independent review

  Not for normal implementation.

- Claude Fable 5.1 (`claude-fable-5-1`) — optional specialist, available here
  - exceptionally large coding tasks, long-horizon autonomous development
  - repository-scale migrations, research-heavy engineering

  It does not replace Opus 5.5 in this workflow and is never a default.

- Pi / Qwen (`Qwen3.8-27B-64K-MTP` default, `Qwen-daily-64K`, `Qwen-daily-262K`)
  - implementation
  - tests
  - repetitive coding
  - repository exploration
  - isolated modules
  - parallel tasks

  Use it aggressively for inexpensive parallel work. Because the local model is
  quantized, assignments must be bounded, explicit, and independently testable.

## Orchestrator Rules

The orchestrator should coordinate rather than implement everything itself.

For each substantial task:

1. Inspect repository state.
2. Break work into independent tasks.
3. Delegate parallelizable tasks.
4. Give each worker only the context required for its task.
5. Require workers to report:
   - files changed
   - decisions made
   - tests performed
   - unresolved issues
6. Review worker output before integration.
7. Resolve conflicting implementations centrally.
8. Run integration tests after merging work.

## Mandatory Delegation in Herdr

When running inside Herdr (`HERDR_ENV=1`), the orchestrator must NOT
execute an implementation plan entirely by itself when the plan contains
delegatable coding work.

After planning, before implementation:

1. Classify each plan item as:
   - orchestrator-only
   - Claude task
   - Qwen/Pi task
   - parallelizable task

2. For every delegatable task, create or reuse a Herdr worker pane.

3. Spawn the appropriate agent using Herdr native agent controls.

4. Send the worker a bounded task with:
   - goal
   - relevant files
   - constraints
   - acceptance criteria
   - required validation

5. The orchestrator should remain primarily in coordination/review mode.

The orchestrator may directly edit code only when:
- the change is trivial,
- delegation would cost more than execution,
- it is resolving an integration conflict,
- or no suitable worker is available.

For a substantial implementation plan, at least one worker should normally
be spawned before implementation begins.

Do not interpret "start the plan" as permission to implement all steps
inside the orchestrator session.

## Model Selection

Use the cheapest capable model.

Routine coordination:
    Luna

Normal orchestration:
    Terra

Complex orchestration / architectural reasoning:
    Sol Medium

Implementation:
    Pi / Qwen

Complex implementation or review:
    Claude Sonnet 5.5

Hardest Claude escalation:
    Claude Opus 5.5

Do not use Sol for routine orchestration.
Do not use Opus for routine implementation.

## Local worker model selection

All three local aliases stay available. The orchestrator chooses per task; do
not treat the default as the only option.

| Alias | Context | Reasoning | Images | Choose it when |
| --- | --- | --- | --- | --- |
| `Qwen3.8-27B-64K-MTP` | 64K | `medium` | yes | Default. Bounded work in one module, a handful of files, clear acceptance criteria. Strongest of the three per token. |
| `Qwen-daily-64K` | 64K | no | no | The task legitimately spans several files and does not need the model to reason much — mechanical refactors, lint/type fixes, boilerplate, repetitive edits. |
| `Qwen-daily-262K` | 262K | `medium` | no | Wide repository sweeps, large files, or a long task thread that would otherwise compact. |

Rules:

- Start at `Qwen3.8-27B-64K-MTP`. Move to a wider alias when the scope genuinely does
  not fit, not pre-emptively.
- Running out of context is **not** a reason to escalate to Sonnet; pick the
  wider alias instead. Escalate to Sonnet when the task is *reasoning*-hard.
- A task that needs both deep reasoning and very wide context is a Sonnet task,
  not a Qwen task.
- Set the model at spawn time (`-- --model <alias>`). Prefer a fresh worker on
  the right alias over stretching a session that is already compacting.

## Qwen Constraints

Because the local models are quantized:

- Prefer bounded, well-defined tasks.
- Avoid giving it responsibility for global architecture.
- Provide explicit acceptance criteria.
- Provide relevant filenames and interfaces.
- Keep context focused.
- Do not repeatedly send the entire repository history.
- Summarize completed work before starting the next task.

## Context Management

Repository files are the source of truth.

Do not depend on conversational context as persistent project memory.

Maintain project state using:
- AGENTS.md
- project documentation
- task files
- git history
- tests
- architecture documentation

Keep orchestration context small and reconstructable.

## Parallel Work

Parallelize tasks only when file ownership is reasonably independent.

Avoid multiple agents editing the same files simultaneously unless
the orchestrator explicitly coordinates the changes.

The orchestrator owns final integration.

# Herdr Environment Bootstrap

## On Project Start

Before modifying code:

1. Confirm the project root and Git repository.
2. Read, in order when present:
   - AGENTS.md
   - README.md
   - CONTRIBUTING.md
   - package manifests / dependency files
   - architecture documentation
3. Inspect:
   - git status
   - current branch
   - recent commits
   - test/build commands
   - repository structure
4. Determine the project's language, framework, package manager,
   test runner, formatter, linter, and build system.
5. Do not change source code until this initial inspection is complete.

## Herdr Awareness

When HERDR_ENV=1 is present, use Herdr's native CLI for coordination.

Use Herdr to:
- inspect existing panes and agents
- create helper panes
- start worker agents
- read worker output
- wait for agents or commands
- coordinate parallel work

Do not launch nested Herdr instances.

Before creating a new worker, inspect existing agents and reuse an
appropriate idle worker when possible.

## Workspace Policy

One Herdr workspace = one software project.

Keep unrelated repositories in separate workspaces.

Recommended tabs:

- ORCHESTRATOR
- CLAUDE
- QWEN-1
- QWEN-2
- TESTS
- DEV-SERVER / LOGS

Tabs and panes may be created dynamically when required.

## Git Policy

Never let multiple agents blindly modify the same working tree.

For substantial parallel tasks, prefer Git worktrees.

Each worker should receive:
- its own branch
- its own worktree
- a clearly defined task
- explicit file ownership where practical

Example branch naming:

agent/qwen-auth-api
agent/claude-db-refactor
agent/qwen-tests-payments

The orchestrator owns integration into the main development branch.

Workers must never:
- force push
- rewrite shared history
- reset other agents' work
- delete another worker's branch/worktree
unless explicitly instructed by the orchestrator.

## Worktree Policy

Use worktrees for parallel implementation when two or more agents may
write code simultaneously.

Prefer the Herdr worktree directory configured globally.

Do not create a worktree for trivial read-only research tasks.

After successful integration:
- remove obsolete worktrees
- remove merged temporary branches when safe

## Task Delegation

Every delegated task must include:

### Goal
What must be achieved.

### Scope
Relevant files/modules/components.

### Constraints
Interfaces or behavior that must not change.

### Acceptance Criteria
Concrete conditions defining completion.

### Validation
Tests, linting, type checks, builds, or manual checks to perform.

### Output Contract
Worker must report:
- summary
- files changed
- tests run
- results
- assumptions
- unresolved issues
- commit hash when applicable

Avoid vague tasks such as:
"fix authentication"

Prefer:
"Fix refresh-token expiration handling in src/auth/*.
Do not change the public API.
Add regression tests reproducing issue X.
Run auth tests and typecheck."

## Agent Ownership

The orchestrator is the sole authority for:
- architecture across modules
- task assignment
- integration
- resolving conflicting agent changes
- deciding whether work is complete

Workers own only the tasks explicitly assigned to them.

Workers must not independently expand task scope unless required to
complete the assigned task.

Unexpected architectural issues must be reported back to the
orchestrator.

## Model Routing

Default routing:

Luna:
- simple repository exploration
- summaries
- repetitive coordination
- formatting/context preparation

Terra:
- primary orchestration
- task decomposition
- integration decisions
- ordinary review

Sol Medium:
- difficult debugging
- architectural conflicts
- ambiguous failures
- large cross-module refactors
- reviewing high-risk changes

Claude Sonnet 5.5 (`claude-sonnet-5-5`):
- architecture-sensitive work
- complex implementation
- difficult review/debugging
- alternative solution generation

Claude Opus 5.5 (`claude-opus-5-5`), escalation only:
- what Sonnet 5.5 could not resolve
- highly ambiguous architecture, high-risk migrations
- deep independent review

Claude Fable 5.1 (`claude-fable-5-1`), optional specialist:
- exceptionally large or long-horizon tasks; never a default

Pi / Qwen (`Qwen3.8-27B-64K-MTP` default, `Qwen-daily-64K`, `Qwen-daily-262K`):
- bounded implementation
- tests
- repetitive refactors
- isolated modules
- repository investigation

Do not escalate merely because a task is large.
Escalate because it is reasoning-complex.

## Qwen Task Design

For Qwen workers:

- Keep assignments bounded.
- State exact objective.
- State relevant paths.
- State interfaces that must remain stable.
- Provide acceptance criteria.
- Avoid dumping unnecessary repository history.
- Prefer fresh task contexts over extremely long conversations.
- Ask the worker to inspect files itself rather than pasting entire files.
- Require validation before declaring completion.

When the worker's context becomes polluted or heavily compacted,
finish the current task and start a fresh agent/session for the next task.

## Context Management

Do not use chat history as the canonical project state.

Canonical state belongs in:
- source code
- Git
- AGENTS.md
- docs/
- tests
- issue/task files

Maintain a lightweight project status file when useful:

.herdr/STATUS.md

Suggested structure:

# Current Goal
...

# Active Tasks
...

# Completed
...

# Decisions
...

# Known Issues
...

# Next Actions
...

Keep this concise.

Do not store large logs or full conversations in STATUS.md.

## Architecture Memory

For non-trivial projects maintain:

docs/architecture.md

Record durable architectural decisions such as:
- component boundaries
- database choices
- API conventions
- authentication model
- background jobs
- deployment architecture

For significant decisions, optionally use:

docs/adr/

with Architecture Decision Records.

This prevents repeated architectural reasoning across agent sessions.

## Testing Policy

No implementation task is complete until applicable validation has run.

Preferred order:

1. targeted tests
2. lint / formatting
3. type checking
4. broader test suite
5. build

Do not repeatedly run the full suite during small intermediate edits
when targeted tests are sufficient.

Before final integration, run the relevant broader validation.

## Failure Policy

When a worker fails:

1. Read its output.
2. Identify whether failure came from:
   - implementation
   - environment
   - dependency
   - misunderstanding
   - insufficient context
3. Do not blindly repeat the same prompt.
4. Modify task/context or assign another worker.
5. Escalate reasoning complexity only when justified.

For difficult failures:
coding        Qwen -> Claude Sonnet 5.5 -> Claude Opus 5.5
orchestration Terra Medium -> Sol Medium

Preferred review pairings, cheapest first:
Qwen implements, Sonnet 5.5 reviews, Terra integrates
Sonnet 5.5 implements, Opus 5.5 reviews, Terra integrates
workers disagree, Sol Medium reasons independently, Terra integrates

## Review Policy

Changes affecting any of these should receive independent review:

- authentication
- authorization
- database migrations
- security boundaries
- payments
- concurrency
- destructive operations
- public APIs
- deployment configuration

Prefer a reviewer different from the implementation agent.

## Security

Agents must never:
- expose secrets
- commit .env files containing credentials
- print API keys unnecessarily
- disable security checks just to make tests pass
- execute destructive production operations without explicit approval

Use example environment files:

.env.example

Secrets belong outside the repository.

## Dependencies

Do not add a dependency before checking whether the project already
contains equivalent functionality.

When adding one, consider:
- maintenance
- license
- size
- security
- framework compatibility

Avoid dependencies for trivial functionality.

## Documentation

Update documentation when behavior, configuration, APIs, or setup
procedures change.

Do not generate documentation merely to describe obvious code.

## Completion

The orchestrator should only declare a task complete when:

- acceptance criteria are met
- relevant tests pass
- integration conflicts are resolved
- repository remains buildable
- important documentation is updated
- git status contains no unexpected changes

Provide a concise final report containing:

- what changed
- validation performed
- remaining issues
