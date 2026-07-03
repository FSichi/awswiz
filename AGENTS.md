# AGENTS.md

Instructions for AI coding agents — both for working **on** this repository and for **using** the `awswiz` CLI from automation.

## Using awswiz non-interactively (agents, scripts, CI)

Every credential command has a headless mode. **A bare command in a non-TTY context fails fast with exit 1** (it never hangs waiting for input) — pass the flags instead:

| Task | Command |
|---|---|
| Who am I? (read-only, always safe) | `awswiz whoami -p <profile>` |
| Session health (read-only, always safe) | `awswiz status` |
| Start an MFA session | `awswiz mfa -p <profile> -c <6-digit-code>` → writes `<profile>-mfa` |
| Assume a role | `awswiz assume -p <source> -r <role-arn> --target <name> [-c <code>]` |
| SSO login | `awswiz login -p <profile>` (needs a human to approve in the browser) |
| Run a command with a profile | `awswiz exec -p <profile> -- <command…>` |
| Switch the default profile | `awswiz use <profile> --default` |
| Set a region | `awswiz region <profile> <region>` |
| Remove a profile | `awswiz profile remove -p <name>` |
| Environment check | `awswiz doctor` |

Rules for agents:

- **Never pass secrets as command-line flags.** awswiz deliberately does not accept access keys as flags (they would leak into shell history and process lists). To create key-based profiles non-interactively, write `~/.aws/credentials` directly (INI, `0600` on Unix) or use `aws configure set`.
- `profile add` / `profile edit` are interactive wizards by design (masked secret input) — do not call them headless.
- MFA codes are time-based; an agent can only supply `-c` when a human provides the current code.
- Temporary sessions record `aws_session_expiration` in `~/.aws/credentials` — read it (or run `awswiz status`) to know if a session is still valid before using it.
- `awswiz console --print-url` prints a **sign-in URL that is itself a credential** — never log it.

## Working on this repository

- TypeScript, ESM, Node >= 20. Source in `src/`, tests in `test/` (vitest).
- Build/verify: `npm ci && npm run typecheck && npm run build && npm test`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, …) — this repo is managed with [gitwiz](https://github.com/FSichi/gitwiz).
- Releases: bump `package.json`, commit `chore(release): vX.Y.Z`, tag `vX.Y.Z`, push the tag → GitHub Actions publishes to npm via Trusted Publishing (no tokens).
- The UI is bilingual (EN/ES): every user-facing string goes through `t('English text')` from `src/ui/i18n.ts`, with the Spanish translation added to `src/ui/messages-es.ts` (English text is the key; missing entries fall back to English).
- AWS interactions go through the SDK (`@aws-sdk/*`) — never spawn the `aws` CLI. File edits to `~/.aws` go through the comment-preserving INI editor (`src/core/aws-ini.ts` + `aws-writer.ts`).
- Never log or echo credential values (keys, session tokens, sign-in URLs).
