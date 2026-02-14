# 🕵️ Webpage Change Monitor

A deterministic, file-based Node.js engine that continuously monitors webpages for visible content changes, stores both raw and normalized snapshots, generates diffs, and publishes a self-contained static monitoring site in `public/` (GitHub Pages ready).

#### Highlights
- Continuous monitoring (default) and one-time run (`start:once`) for CI/workflows
- Per-target CSS selector extraction and regex filtering
- Dual snapshot model: raw HTML archive (`*.html`) + normalized visible-text snapshot (`*.normalized.txt`)
- Unified diff generation for changes
- Per-title `index.json` files for easy UI consumption
- Startup migration of legacy logs/snapshots to structured formats
- Playwright fallback renderer for dynamic pages with renderer backoff on failure
- Telegram batch notifications when multiple changes are detected

## Quick install

Requirements:
- Node.js 18+
- npm


```bash
git clone https://github.com/yourusername/webpage-change-monitor.git
cd webpage-change-monitor
npm install
```

## Usage
- Continuous mode (default):
```bash
npm start
```
- One-time (CI / deploy):
```bash
npm run start:once
```

## Configuration
Create a `config.json` in the repo root (an example is included as `config.example.json`). You may also override its path with `WEBPAGE_MONITOR_CONFIG`.

Example `config.json`
```json
{
  "intervalMinutes": 10,
  "userAgent": "WebpageMonitor/1.0",
  "urls": [
    "https://example.com",
    {
      "url": "https://example.com/news",
      "title": "Example News",
      "selector": "#main-content",
      "dynamicData": true,
      "regex": "Breaking News:.*",
      "regexFlags": "g"
    }
  ]
}
```

## How it works (per URL)
1. Lightweight fetch of the target URL
2. Optional Playwright rendering fallback for dynamic content
3. Optional CSS selector extraction
4. Optional regex filtering
5. Normalize extracted HTML into visible text with preserved line breaks
6. Compute SHA-256 hash of normalized content
7. Compare with stored hash in `public/data/state.json`
8. If new or changed:
   - Write a raw HTML archive snapshot (`public/data/<Title>/*_YYYY-MM-DDTHH-MM-SS.html`)
   - Write a normalized text snapshot (`public/data/<Title>/*_YYYY-MM-DDTHH-MM-SS.normalized.txt`)
   - Generate a unified diff (if previous normalized snapshot exists) and write `public/logs/<Title>/diff_*.txt`
   - Append a structured event to `public/logs/events.json`
   - Publish per-title `index.json` files listing the latest snapshots and diffs

## Storage model
```
public/
  config.json                # copy of repo config.json written on each run
  data/
    state.json               # runtime state (hashes, last checked, last snapshot path)
    <Title>/
      *_YYYY-MM-DDTHH-MM-SS.html           # raw HTML archives (pruned to latest 3)
      *_YYYY-MM-DDTHH-MM-SS.normalized.txt # normalized snapshots (pruned to latest 3)
      index.json            # { "snapshots": [ ... ] }
  logs/
    events.json             # structured event log (retains last ~200 events)
    <Title>/
      diff_*.txt            # unified diffs (pruned to latest 3)
      index.json            # { "diffs": [ ... ] }
```

Retention
- Default retention keeps the latest 3 snapshots per title for both raw HTML and normalized formats; latest 3 diffs per title; and the last ~200 events globally. The storage module (`src/storage.js`) enforces pruning and writes per-title `index.json` files for UI consumption.

Startup migrations and compatibility
- If `state.json` points to legacy raw-HTML snapshot paths, the runtime will normalize those snapshots at startup: it reads the referenced HTML, writes a sibling `*.normalized.txt`, updates the stored hash, and emits a `MIGRATED` event.
- Legacy `logs/changes.log` (if present under repo `logs/`) is migrated into `public/logs/events.json` on startup and paths are normalized to repo-relative locations so the static UI remains consistent.

## Renderer fallback and backoff
- Playwright is used as a fallback renderer for dynamic pages when lightweight fetch returns incomplete content.
- When Playwright rendering fails for a target, the runtime records `rendererFailedAt` in state and avoids re-rendering that target for a backoff window (default ~60 minutes) to reduce repeated failures.

## Notifications
- When multiple changes are detected during a single check, the runtime attempts to send a single Telegram batch message. Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the environment for notifications. Messages are truncated to Telegram limits and the batching logic lives in `src/telegram.js`.

## Event logging
- All structured events are collected in `public/logs/events.json` and include `timestamp`, `type` (NEW, CHANGED, MIGRATED, ERROR, FATAL), `title`, `url`, and snapshot/diff paths when relevant. This file is canonical for UI and downstream consumers.

## Deploying the static site
- Run a one-time check and publish `public/` (example):
```bash
npm run start:once
npx gh-pages -d public
```
Note: each run copies the repository `config.json` into `public/config.json` so the published UI reflects the active configuration used to perform checks.

## Project structure
```
.
├── config.json
├── config.example.json
├── src/
│   ├── index.js                   # orchestrator
│   ├── utils.js                   # shared paths + helpers
│   ├── config.js                  # config loader + validation
│   ├── state.js                   # load/save state + removed-URL cleanup
│   ├── fetcher_internal_helper.js # Playwright + timeout helpers
│   ├── fetcher.js                 # fetch + Playwright fallback
│   ├── differ.js                  # normalize, hash, unified diff
│   ├── storage.js                 # snapshot/diff writing + retention + publish
│   ├── events.js                  # structured logging + migrations
│   └── telegram.js                # Telegram batching and helpers
└── public/                        # canonical published output
```

#### Error handling and robustness
- Per-URL errors are captured and logged; a single target error does not stop the run.
- Fatal configuration errors are written to events and the process exits with a non-zero code.
- Renderer failures fall back to lightweight fetch and are recorded in state so retries are rate-limited.

#### Maintenance tips

1. If you change retention behavior, update `src/storage.js` to keep consistency across raw and normalized snapshots.
2. Secrets like `TELEGRAM_BOT_TOKEN` must be provided via environment and should not be committed to the repo.

