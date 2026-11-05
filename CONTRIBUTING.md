# Contributing to Enigma AI

## Branch Rules

### Protected Branch: `master`
- **No direct pushes to master.** All changes go through pull requests.
- Every PR requires at least **1 approval** before merging.
- PRs must have a clear title and description of what changed.

### Branch Naming Convention

```
<type>/<short-description>
```

| Type | Use |
|---|---|
| `feat/` | New feature (`feat/upload-page`, `feat/arkiv-integration`) |
| `fix/` | Bug fix (`fix/countdown-timer`, `fix/wallet-disconnect`) |
| `contract/` | Smart contract work (`contract/escrow-logic`, `contract/signer-registry`) |
| `refactor/` | Code cleanup, no behavior change |
| `docs/` | Documentation only |
| `test/` | Adding or updating tests |

Examples:
```
feat/landing-page
feat/0g-tee-integration
contract/enigma-deploy
fix/arkiv-ttl-bug
docs/api-endpoints
```

### Workflow

1. Create a branch from `master` using the naming convention above
2. Make your changes, commit frequently with clear messages
3. Push your branch and open a PR
4. Get at least 1 review/approval
5. Squash-merge into `master`
6. Delete the branch after merge

## Commit Messages

Write clear, concise commit messages. Focus on **what** and **why**, not how.

```
feat: add file upload with client-side encryption
fix: countdown timer not updating on mobile
contract: add replay protection to completeJob
docs: document 0G TEE attestation flow
```

Format: `<type>: <short description>`

Types: `feat`, `fix`, `contract`, `refactor`, `docs`, `test`, `chore`

## Code Ownership

| Area | Owner | Files |
|---|---|---|
| Smart contracts | Parth Soni | `contracts/` |
| 0G + Arkiv integration | Dev Patel | `backend/0g/`, `backend/arkiv/` |
| API routes | Dev Patel (shared) | `backend/api/` |
| Frontend pages | Dev Mondal, Rudra Vable | `frontend/` |
| Landing + upload + demo UI | Dev Mondal | `frontend/app/(marketing)/`, `frontend/app/upload/`, `frontend/app/demo/` |
| Dashboard + wallet + job UI | Rudra Vable | `frontend/app/dashboard/`, `frontend/app/job/` |

**Rule:** Don't modify files outside your ownership area without talking to the owner first. If you need a change in someone else's area, open an issue or message them.

## PR Requirements

Every PR must include:
- [ ] Clear title following commit message format
- [ ] Description of what changed and why
- [ ] Tested locally (describe what you tested)
- [ ] No console errors or warnings
- [ ] Mobile responsive (for frontend changes)
- [ ] Contract tests pass (for contract changes)

### PR Description Template

```markdown
## What
Brief description of the change.

## Why
Why is this change needed?

## Testing
- What did you test?
- Any edge cases covered?

## Screenshots
(For frontend changes — include mobile + desktop)
```

## AI Usage Documentation

**ETHGlobal requires AI usage to be documented per file.**

If you used AI (Claude, Copilot, ChatGPT, etc.) to help write a file, add a comment at the top:

```javascript
// AI-assisted: Used [tool name] for [what it helped with]
```

```solidity
// AI-assisted: Used Claude for initial contract structure
```

Don't over-document. Only note files where AI wrote significant portions of the code.

## Environment Setup

```bash
# Clone
git clone https://github.com/dev22419/enigma-ai.git
cd enigma-ai

# Install
npm install

# Environment variables
cp .env.example .env
# Fill in: 0G_API_KEY, WHITECHAIN_RPC, PRIVATE_KEY, ARKIV_RPC

# Dev server
npm run dev
```

## Communication

- Use the TeamBus for coordination between agents
- For blocking issues, message the owner of the area directly
- Don't sit on a blocker for more than 30 minutes — ask for help
