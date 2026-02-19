# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenClaw is a personal AI assistant platform (TypeScript/Node.js) that connects to messaging channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Google Chat, Microsoft Teams, Matrix, etc.) and runs an embedded Pi AI agent. It's a monorepo with a CLI, gateway server, native apps, extension plugins, and bundled skills.

- Repo: https://github.com/openclaw/openclaw
- Runtime: Node 22+
- Language: TypeScript (ESM, strict mode)
- Package manager: pnpm (primary); bun and npm also supported

## Build, Test, and Lint Commands

```bash
pnpm install                # Install dependencies (also: bun install)
pnpm build                  # Full build (tsdown + DTS + UI copy)
pnpm check                  # Type-check (tsgo) + lint (oxlint) + format (oxfmt)
pnpm lint:fix               # Auto-fix lint issues
pnpm format:fix             # Auto-fix formatting

pnpm test                   # Run unit tests (vitest, parallelized)
pnpm test:coverage          # Unit tests with V8 coverage
pnpm test:watch             # Continuous test runner
pnpm test:e2e               # Integration tests (vitest.e2e.config.ts)
CLAWDBOT_LIVE_TEST=1 pnpm test:live   # Live tests (OpenClaw keys only)
LIVE=1 pnpm test:live                 # Live tests (includes provider live tests)
pnpm test:docker:live-models          # Docker live model tests
pnpm test:docker:live-gateway         # Docker live gateway tests
pnpm test:docker:onboard              # Docker onboarding E2E

pnpm dev                    # Run CLI from source (tsx)
pnpm openclaw ...           # Run CLI (pnpm script uses bun internally; preferred for dev)
pnpm gateway:dev            # Gateway in dev mode (channels skipped)
pnpm gateway:watch          # Gateway watch mode (auto-restart on changes)
pnpm ui:dev                 # Web UI dev server
pnpm protocol:check         # Validate gateway protocol schemas
```

Run a single test file: `pnpm vitest run src/path/to/file.test.ts`

Full pre-push gate: `pnpm build && pnpm check && pnpm test`

Commit helper: `scripts/committer "<msg>" <file...>` (avoids manual git add/commit so staging stays scoped). Use `--force` to clear stale git locks.

Dev profile isolation: `OPENCLAW_PROFILE=dev pnpm gateway:dev` uses `~/.openclaw-dev/` state dir and port 19001, keeping dev separate from production state.

For package lifecycle use pnpm; prefer Bun for direct TypeScript execution (scripts, one-off runs): `bun <file.ts>` / `bunx <tool>`. Node remains supported for built output (`dist/*`) and production installs.

## Architecture

### Core Subsystems (src/)

**Agent System** (`src/agents/`): Embeds the Pi AI agent framework. `pi-embedded-runner/` orchestrates agent runs (context compaction, model failover, sandbox execution). `model-selection.ts` handles model routing and failover chains. `pi-tools.ts` defines agent tool schemas. Skills discovered and loaded via `skills-install.ts`. Workspace bootstrap (`workspace.ts`) loads AGENTS.md, SOUL.md, TOOLS.md, USER.md, MEMORY.md from `~/.openclaw/workspace/` into agent system prompts at runtime.

**Gateway Server** (`src/gateway/`): WebSocket + HTTP server (Hono framework). `server.impl.ts` is the main server. RPC methods live in `server-methods/` (agent, config, channels, skills, hooks, models). Includes an OpenAI-compatible API endpoint (`openresponses-http.ts`). Protocol schemas in `protocol/`.

**Channel Router** (`src/channels/`): Abstract plugin system. `dock.ts` is the channel registry/router. Core channels: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web` (WhatsApp). Extension channels live in `extensions/`.

**Configuration** (`src/config/`): JSON5 config with Zod validation (`schema.ts`). Type definitions split across `types.*.ts` files. State stored at `~/.openclaw/` (sessions, credentials, models, logs). Config I/O and backup in `io.ts`.

**CLI** (`src/cli/`, `src/commands/`): Commander.js-based. Entry: `entry.ts` -> `index.ts`. Dependency injection via `createDefaultDeps` pattern.

**Auto-Reply** (`src/auto-reply/`): Template matching, `/command` directive parsing, extended thinking mode selection.

**Infrastructure** (`src/infra/`): Env loading, dotenv, port management, error formatting, outbound message delivery.

**Additional** (`src/providers/`, `src/memory/`, `src/sessions/`, `src/plugin-sdk/`): Model providers, agent memory, session management, Plugin SDK.

### Extensions (`extensions/`)

Workspace packages (33+) implementing the `ChannelPlugin` interface. Each has its own `package.json`. Plugin-only deps stay in the extension package, not root. Runtime loads via jiti; `openclaw/plugin-sdk` resolved at runtime.

Key rule: `workspace:*` goes in `devDependencies` or `peerDependencies` only (npm install breaks with workspace protocol in `dependencies`).

When adding channels/extensions/apps/docs, review `.github/labeler.yml` for label coverage.

### Skills (`skills/`)

55+ bundled skill directories (coding-agent, dev-cycle, github, etc.). Per-agent skill allowlists. Tool schemas adapted to Claude-style format.

### Native Apps (`apps/`)

Android (Kotlin/Gradle), iOS (Swift/Xcode), macOS (Swift). Shared library in `apps/shared/OpenClawKit/`.

## Testing

- Framework: Vitest with colocated `*.test.ts` files
- Coverage thresholds: 70% lines/functions/statements, 55% branches
- E2E tests: `*.e2e.test.ts`; live tests: `*.live.test.ts` (see live test commands above)
- Test isolation: forked processes (`pool: "forks"`), isolated home dirs via `withIsolatedTestHome()`, stub plugins via `createStubPlugin()`
- Setup file: `test/setup.ts`
- Default test timeout: 120s. Do not set test workers above 16
- Run `pnpm protocol:check` when modifying gateway protocol schemas
- Full test kit docs: `docs/testing.md`
- Pure test additions/fixes do **not** need a changelog entry unless they alter user-facing behavior
- Mobile: check for connected real devices (iOS + Android) before using simulators/emulators; prefer real devices

## Code Style

- Linting/formatting: oxlint + oxfmt (run `pnpm check`)
- Avoid `any`; prefer strict typing
- Keep files under ~500-700 LOC; extract helpers when it improves clarity
- Add brief comments for tricky or non-obvious logic
- Use `src/cli/progress.ts` for CLI spinners (`osc-progress` + `@clack/prompts`); don't hand-roll
- Use `src/terminal/palette.ts` for colors (no hardcoded ANSI); apply to TTY UI/onboarding prompts
- Use `src/terminal/table.ts` for table output; `status --all` = read-only/pasteable, `status --deep` = probes
- Legacy decorators (`experimentalDecorators: true`) for Control UI (Lit); do not switch to standard decorators
- Tool schema guardrails: avoid `Type.Union` in tool input schemas (no `anyOf`/`oneOf`/`allOf`). Use `stringEnum`/`optionalStringEnum` for string lists. Use `Type.Optional(...)` instead of `... | null`. Avoid raw `format` property names in tool schemas (treated as reserved keyword by some validators).
- SwiftUI state management (iOS/macOS): prefer `@Observable`/`@Bindable` over `ObservableObject`/`@StateObject`; migrate existing usages when touching related code
- Connection providers: when adding a new connection, update all UI surfaces + docs (macOS app, web UI, mobile, onboarding/overview) and add matching status + configuration forms

## Naming

- **OpenClaw** for product/app/docs headings
- `openclaw` for CLI command, package/binary, paths, config keys

## Docs

- Hosted on Mintlify at docs.openclaw.ai
- Internal links: root-relative, no `.md`/`.mdx` extension (e.g. `[Config](/configuration)`)
- Section cross-references: use anchors on root-relative paths (e.g. `[Hooks](/configuration#hooks)`)
- README: use absolute `https://docs.openclaw.ai/...` URLs
- Avoid em dashes and apostrophes in doc headings (breaks Mintlify anchors)
- When touching docs, end the reply with the `https://docs.openclaw.ai/...` URLs you referenced
- Docs content must be generic: no personal device names/hostnames/paths; use placeholders like `user@gateway-host`
- `docs/zh-CN/**` is generated; do not edit unless explicitly asked. Pipeline: update English → adjust `docs/.i18n/glossary.zh-CN.json` → run `scripts/docs-i18n`

## Multi-Channel Awareness

When refactoring shared logic (routing, allowlists, pairing, onboarding), consider all built-in + extension channels. Core channel code: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`, `src/channels`, `src/routing`. Extensions: `extensions/*`.

## Commit & PR Conventions

- Use `scripts/committer "<msg>" <file...>` to commit
- Concise, action-oriented messages (e.g. `CLI: add verbose flag to send`)
- Group related changes; avoid bundling unrelated refactors
- Changelog: keep latest released version at top (no `Unreleased` section)
- GitHub PR/issue comments: use `-F - <<'EOF'` heredoc for multiline strings; never embed literal `\n`
- When working on a PR: add changelog entry with PR # and thank the contributor
- When working on an issue: reference the issue in the changelog entry
- After finishing a GitHub issue or PR task, print the full URL

**PR review flow:**

- **Review mode** (given a PR link): use `gh pr view`/`gh pr diff`; do **not** switch branches; do **not** change code. Before reviewing, run `git pull`; if local changes or unpushed commits exist, stop and alert user.
- **Landing mode**: create integration branch from `main` → bring in PR commits (prefer rebase for linear history; merge when conflicts make it safer) → apply lint/format fixes + add changelog (+ thanks + PR #) → run full gate (`pnpm build && pnpm check && pnpm test`) → commit → merge back to `main` → `git switch main`. Always add PR author as co-contributor when squashing.
- After merging: leave PR comment with what was done and SHA hashes
- New contributor: add avatar to README "clawtributors" list via `bun scripts/update-clawtributors.ts`

**Shorthand:** `sync` = commit all dirty changes (sensible commit message) → `git pull --rebase` → push (stop if rebase conflicts cannot be resolved).

Reference: `docs/help/submitting-a-pr.md`

## Multi-Agent Safety

- Do **not** create/apply/drop `git stash` entries unless explicitly requested (includes `git pull --rebase --autostash`)
- Do **not** create/remove/modify `git worktree` checkouts unless explicitly requested
- Do **not** switch branches unless explicitly requested
- On "push": may `git pull --rebase`; on "commit": scope to your changes only; on "commit all": commit in grouped chunks
- Lint/format-only diffs: auto-resolve without asking; if commit already requested, include in same commit
- When seeing unrecognized files: keep going, commit only your own changes
- Multiple agents OK as long as each has its own session

## Development Notes

- **Answers:** high-confidence only; verify in source code before answering; do not guess
- **Bug investigations:** read source of relevant npm deps + all related local code before concluding
- **macOS gateway:** start/stop via the OpenClaw Mac app (not ad-hoc tmux sessions); use `scripts/clawlog.sh` for unified logs
- **"Restart apps":** means rebuild (recompile/install) + relaunch, not just kill/relaunch
- **Streaming:** never send streaming/partial replies to external messaging surfaces (WhatsApp, Telegram); only final replies. Streaming may go to internal UIs/control channel.
- **Session logs:** Pi session logs live at `~/.openclaw/agents/<agentId>/sessions/*.jsonl` (newest unless specific ID given)
- **Never edit `node_modules`**; updates overwrite
- **Security:** never commit real phone numbers, videos, or live configuration values; use obviously fake placeholders in docs, tests, examples
- **Release:** read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not change version numbers without explicit consent; do not run `npm publish` without permission
- **Troubleshooting:** run `openclaw doctor` for rebrand/migration/legacy-config issues (see `docs/gateway/doctor.md`)
- **Vocabulary:** "makeup" = "mac app"

## Dependency Rules

- Any dependency with `pnpm.patchedDependencies` must use exact version (no `^`/`~`)
- Patching dependencies requires explicit approval
- Never update the Carbon dependency
- Keep `pnpm-lock.yaml` + Bun patching in sync when touching deps/patches

## Version Locations

`package.json` (CLI), `apps/android/app/build.gradle.kts` (versionName/versionCode), `apps/ios/Sources/Info.plist` + `apps/ios/Tests/Info.plist` (CFBundleShortVersionString/CFBundleVersion), `apps/macos/Sources/OpenClaw/Resources/Info.plist` (CFBundleShortVersionString/CFBundleVersion), `docs/install/updating.md` (pinned npm version), `docs/platforms/mac/release.md` (APP_VERSION/APP_BUILD examples), Peekaboo Xcode projects/Info.plists (MARKETING_VERSION/CURRENT_PROJECT_VERSION).

## Release Channels

- stable: tagged releases (`vYYYY.M.D`), npm dist-tag `latest`
- beta: prerelease tags (`vYYYY.M.D-beta.N`), npm dist-tag `beta` (may ship without macOS app)
- dev: moving head on `main` (no tag)
