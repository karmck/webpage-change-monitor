# Webpage Change Monitor – Copilot Instructions

## Architecture Overview

This project is a modular, continuous webpage monitoring engine.

There is:

- No Express server
- No API routes
- No runtime backend UI
- No root-level `data/` or `logs/` folders
- No `changes.log`

All monitoring output lives inside `public/`.

---

## Storage Model

Canonical storage:

```
public/
  data/
    state.json
    <Title>/
      snapshots
  logs/
    events.json
    <Title>/
      diffs
```

Snapshots and diffs are retained (default: 3 each).

Structured event log:

```
public/logs/events.json
```

---

## Module Responsibilities

| File | Responsibility |
|------|---------------|
| `index.js` | Orchestrates system |
| `utils.js` | Shared paths + helpers |
| `config.js` | Config validation |
| `state.js` | State load/save + removed URL cleanup |
| `fetcher_internal_helper.js` | Playwright + timeout helpers |
| `fetcher.js` | Lightweight fetch + Playwright fallback |
| `differ.js` | Hashing + unified diff |
| `storage.js` | Snapshot/diff writing + retention |
| `events.js` | Structured logging |

Each module must remain single-responsibility.

---

## Monitoring Flow

For each URL:

1. Fetch content
2. Extract via selector (optional)
3. Filter via regex (optional)
4. Hash content
5. Compare with state
6. If changed:
   - Save snapshot
   - Generate diff
   - Append event
7. Save state

---

## Execution Modes

Continuous (default):

```
npm start
```

One-time:

```
npm run start:once
```

Scheduler reloads config each cycle and resets interval if changed.

---

## Constraints

- Node 18+
- ES Modules only
- File-based storage only
- No database
- No HTTP framework
- Playwright optional fallback
- Static hosting compatible

---

## Modification Guidelines

- Keep modules single-responsibility
- Never reintroduce server logic
- Never create root `data/` or `logs/`
- All outputs must go to `public/`
- Preserve structured event logging
- Avoid silent error swallowing
- Maintain continuous + once modes

---

## Retention Defaults

- 3 snapshots per URL
- 3 diffs per URL
- 200 events retained globally

Modify only inside `storage.js` or `events.js`.

---

## Safe Extension Areas

- Content normalization pipeline
- Structured diff format (JSON diffs)
- Per-target retention configuration
- Notification hooks (Slack, email)
- Ignore selector support

Do not add runtime server components.

---

This project is a deterministic, continuous, static-site-generating monitoring engine.
