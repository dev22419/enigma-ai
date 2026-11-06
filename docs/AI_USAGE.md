# AI Usage

Where the Enigma AI team used AI tools while building this project for ETHGlobal Mumbai, as the event rules require. It lists the files where AI use is declared or recorded, and how the team directed it.

Checked against `master` at `455a902` and open PRs #16 and #23 on 2026-11-06.

## Summary

- **How the team worked:** team members set the direction, reviewed the code and ran the live tests. AI assisted the work.
- **Tools on record:** Claude Code.
- **Where it helped:** drafting tests, specific backend and contract changes, and UI work in the open PRs.
- **Spec workflows:** none. The repo has no OpenSpec, Kiro or spec-kit files.
- **Runtime AI is separate:** the 0G model that Enigma calls for inference is part of the product, not a development tool.

## How the team directed AI

### UI

Dev mondal and Rudra led the design and directed Claude Code through these instructions:

- Build the landing page from the team's product brief, with a hero that avoids generic AI visuals.
- Make the other sections understandable for newcomers and experts, without overdoing them.
- Replace a font that was too large to read comfortably.
- Add animation so the sections explain the product visually instead of reading like plain HTML pages.
- Review screenshots section by section: cut crowded text, remove one part, redesign three look-alike cards, and use more diagrams, modelled on the section Rudra liked.
- Build the remaining frontend tasks and open PRs for them.
- Check the review on PR #16.

Issues #17 to #22, which cover backend and contract problems found during this work, were filed from Rudra's account.

### Backend and contracts

The record for this work is on GitHub:

- **Review:** PR #3 fixed findings from a contract review. Dev Patel posted a five-finding review on PR #16.
- **Live testing:** Parth Soni posted a live run of the job flow on PR #11, across Whitechain testnet, 0G and Arkiv. It found a history-scan failure the mocked tests had not caught, and listed what the run didn't cover.
- **Scope:** Parth closed PR #10 as out of scope for that sprint.

## How to read this file

Each file is listed under the strongest evidence we have for it.

| Evidence | Meaning |
|---|---|
| **Declared** | The file has an `AI-assisted` comment at the top, as `CONTRIBUTING.md` requires. |
| **Recorded** | Git or GitHub shows AI involvement, but the file has no comment. |

The team does not add AI trailers to commits, so this file and the per-file comments are the disclosure, not the git history.

## Files on `master`

### Declared

| File | What AI did |
|---|---|
| `contracts/contracts/EnigmaAI.sol` | The Processing, Failed, Expired and KeyDestroyed lifecycle additions |
| `contracts/test/EnigmaAI.lifecycle.test.js` | Drafted the lifecycle tests |
| `frontend/src/lib/redact.ts` | Drafted the redaction rules |
| `frontend/src/lib/refunds.ts` | Drafted the refund worker |
| `frontend/src/lib/storage.ts` | Drafted the 0G Storage upload against the SDK's documented API |
| `frontend/scripts/eval-prompts.mts` | Drafted the evaluation script |
| `frontend/tests/job-flow.test.ts` | Drafted the tests |
| `frontend/tests/redact.test.ts` | Drafted the tests |
| `frontend/tests/security.test.ts` | Drafted the tests |

### Recorded

PR #8 (testnet verification, contract deployment, 0G and Arkiv fixes) has two commits. Commit `a3a2029` is co-authored by Claude Opus 4.6, and the PR description says it was generated with Claude Code. The trailer did not survive the squash into `9734d4f`.

The PR changed these files:

- `.env.example`
- `contracts/deployments/whitechain.json`
- `frontend/src/app/api/jobs/route.ts`
- `frontend/src/lib/arkiv.ts`
- `frontend/src/lib/og-inference.ts`

## UI in open PRs

Rudra Vable used Claude Code for PR #16 (landing page) and PR #23 (wallet, upload, dashboard, job and demo pages). Neither PR is merged, and this section only applies to code that ships in the submission.

### Declared

**PR #16**

- `landing/src/`: `crypto.js`, `fx.js`, `hero.js`, `intro.js`, `journey.js`, `main.js`, `proof.js`, `rain.js`, `styles.css`
- `landing/vite.config.js`

**PR #23**

- `frontend/src/app/(app)/`: `app.css`, `layout.tsx`, `dashboard/page.tsx`, `demo/page.tsx`, `job/[id]/page.tsx`, `upload/page.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/`: `app-nav.tsx`, `countdown.tsx`, `deposit-flow.tsx`, `key-badge.tsx`, `key-destruction.tsx`, `providers.tsx`, `receipt-card.tsx`
- `frontend/src/lib/client/`: `api.ts`, `chain.ts`
- `frontend/tests/client.test.ts`

### Recorded

These came from the same session but have no comment:

- `landing/index.html`
- `frontend/next.config.ts` (the PR #23 change)
- `frontend/public/landing/` (build output of `landing/`)

## Planning artifacts

| Artifact | Location | Notes |
|---|---|---|
| Agent rules | `CLAUDE.md` | Git, ownership, stack and security rules for AI agents |
| Contribution rules | `CONTRIBUTING.md` | Defines the `AI-assisted` comment |
| Next.js agent rules | `frontend/AGENTS.md` | Generated by `next dev`, not written by the team |
| Task board | claude.ai artifact, not in this repo | Used to plan and track the work |

Session transcripts are not in this repo.
