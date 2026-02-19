# Design: Full Rewrite of CLAUDE.md

**Date:** 2026-02-19
**Author:** Claude Code (brainstorming session)
**Status:** Approved

## Problem Statement

The current CLAUDE.md (141 lines) is incomplete relative to the operational knowledge captured in AGENTS.md (190 lines). Both files serve the same audience (AI coding assistants working on the OpenClaw repo), but AGENTS.md contains significantly more actionable detail across commits/PRs, multi-agent safety, development tooling, and code conventions. The rewrite consolidates both into a single authoritative CLAUDE.md.

**Important distinction:** The repo-root AGENTS.md guides AI development assistants (Claude Code, Cursor, Codex, etc.). It is entirely separate from the user workspace AGENTS.md loaded by OpenClaw's embedded Pi agents at `~/.openclaw/workspace/AGENTS.md` via `src/agents/workspace.ts`.

## Approach

**Thematic Split (C):** Full rewrite of CLAUDE.md using best content from both CLAUDE.md and AGENTS.md, organized thematically. No duplication. Operationally specific (VM ops, Tailscale, 1Password) content stays in AGENTS.md. AGENTS.md is not deleted.

## Proposed Structure

### Section 1: Project Overview + Setup

- Runtime, language, package manager (keep current)
- Expanded build/test commands: add `prek install`, bun preference for TypeScript execution, `pnpm openclaw ...` as dev alias
- Live test env vars: `CLAWDBOT_LIVE_TEST=1` / `LIVE=1` (from AGENTS.md, corrects outdated `OPENCLAW_LIVE_TEST=1`)
- Docker test commands: `pnpm test:docker:live-models`, `pnpm test:docker:live-gateway`, `pnpm test:docker:onboard`
- Protocol check reminder: `pnpm protocol:check` when modifying gateway schemas

### Section 2: Architecture

- Keep all current subsystems (Agent System, Gateway Server, Channel Router, Config, CLI, Auto-Reply, Infra)
- Add: `src/providers/` (model providers), `src/memory/` (agent memory), `src/sessions/` (session management), `src/plugin-sdk/` (Plugin SDK)
- Add: Workspace bootstrap system — `src/agents/workspace.ts` loads AGENTS.md, SOUL.md, TOOLS.md, USER.md, MEMORY.md from `~/.openclaw/workspace/` into agent system prompts
- Clarify Extensions: runtime loaded via jiti; `openclaw/plugin-sdk` resolved at runtime

### Section 3: Testing (expanded)

- Coverage thresholds: 70% lines/functions/statements, 55% branches
- Mobile testing: check connected real devices (iOS + Android) before simulators
- Live test commands (corrected from AGENTS.md)
- Docker test commands
- Pure test additions/fixes: no changelog entry needed unless user-facing behavior changes
- Default timeout: 120s, max workers: 16

### Section 4: Code Style (merged)

- Current linting/formatting rules (keep)
- Add: Brief comments for non-obvious/tricky logic
- Add: Tool schema guardrails (detailed): no `Type.Union`, `anyOf`/`oneOf`/`allOf`; use `stringEnum`/`optionalStringEnum`; avoid `format` as property name in schemas
- SwiftUI: prefer `@Observable`/`@Bindable` over `ObservableObject`; migrate on touch

### Section 5: Commit & PR Conventions (significantly expanded)

- Keep current basics (committer script, message style)
- Add PR **Review mode** vs **Landing mode** distinction:
  - Review: `gh pr view/diff`, never switch branches, never change code
  - Landing: integration branch from main → rebase/squash → add changelog + thanks + PR# → full gate → merge → return to main
- Add: co-contributor on squash, PR comment with SHA after merge
- Add: New contributors → update README avatar list via `bun scripts/update-clawtributors.ts`
- Add: `sync` shorthand (commit all dirty → `git pull --rebase` → push)
- Add: When working on issue, reference in changelog

### Section 6: Multi-Agent Safety (new section)

- Do not create/apply/drop `git stash` unless explicitly requested
- Do not create/remove git worktrees unless explicitly requested
- Do not switch branches unless explicitly requested
- On "push": may `git pull --rebase`; on "commit": scope to own changes only; on "commit all": group in chunks
- Lint/format-only diffs: auto-resolve without confirmation
- When seeing unrecognized files: focus on own changes, commit only those
- Multiple agents OK as long as each has its own session

### Section 7: Development Notes (new section)

Key operational notes for Claude Code:

- **CLI progress:** `src/cli/progress.ts` — do not hand-roll spinners/bars
- **Colors:** `src/terminal/palette.ts` — no hardcoded ANSI
- **Tables:** `src/terminal/table.ts`
- **Answer quality:** high-confidence only; verify in code before answering
- **macOS gateway:** start/stop via OpenClaw app, not ad-hoc tmux; `scripts/clawlog.sh` for unified logs
- **"Restart apps":** means rebuild + relaunch, not kill/launch
- **iOS/macOS state:** prefer `@Observable`/`@Bindable` framework; don't introduce new `ObservableObject`
- **Connection providers:** when adding new provider, update all UI surfaces + docs + status/config forms
- **Streaming:** never send streaming/partial replies to external messaging surfaces (WhatsApp, Telegram)

### Section 8: Dependency & Version Rules (keep + minor expansion)

- Exact versions for patched dependencies (no `^`/`~`)
- No patching without explicit approval
- Never update Carbon dependency
- Keep `pnpm-lock.yaml` + Bun patching in sync
- Version file locations (expanded to include iOS Tests Info.plist, Peekaboo projects)

### Section 9: Docs (minor expansion)

- Keep current Mintlify guidelines
- Add: When touching docs, end reply with `https://docs.openclaw.ai/...` URLs referenced
- Add: Docs content must be generic (no personal device names; use placeholders)
- `docs/zh-CN/**`: generated, do not edit unless explicitly asked

### Section 10: Release Channels (keep as-is)

## What Gets Removed from Current CLAUDE.md

Nothing is deleted — all current content is incorporated. The rewrite expands and reorganizes.

## What Stays in AGENTS.md Only

- exe.dev VM operations (SSH, tmux, nohup commands)
- 1Password NPM publish flow
- Tailscale/SSH specifics
- macOS launch agent diagnostics (`launchctl print gui/$UID`)
- Signal update commands (`fly ssh console ...`)
- iOS Team ID lookup commands
- A2UI bundle hash management

## Success Criteria

1. CLAUDE.md is self-sufficient for a developer/Claude Code session on this repo
2. No information loss from either current CLAUDE.md or AGENTS.md (for development-relevant content)
3. File is under 300 lines (stays in context window, readable)
4. No duplication between CLAUDE.md sections
5. Multi-agent safety and tool schema rules are prominently included
