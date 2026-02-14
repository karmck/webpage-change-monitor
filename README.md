# 🕵️ Webpage Change Monitor

A modular, file-based Node.js tool that continuously monitors webpages for content changes, stores HTML snapshots, generates diffs, and publishes a fully static monitoring site in `public/`.

No database. No server. No runtime backend. Everything is file-based and static-host friendly.

---

## ✨ Features

- Continuous monitoring (default)
- One-time execution mode (`--once`)
- Monitor multiple URLs
- Optional CSS selector tracking
- Optional regex filtering
- SHA-256 hash-based change detection
- HTML snapshot storage
- Unified diff generation
- Structured event log (`events.json`)
- Snapshot retention (default: 3 per URL)
- Diff retention (default: 3 per URL)
- Playwright fallback for dynamic pages
- Fully static `public/` output (GitHub Pages ready)

---

## 📦 Requirements

- Node.js 18+
- npm

---

## 🚀 Installation

```bash
git clone https://github.com/yourusername/webpage-change-monitor.git
cd webpage-change-monitor
npm install
```

---

## ⚙️ Configuration

Create `config.json` in the project root.

Override location if needed:

```bash
WEBPAGE_MONITOR_CONFIG=/path/to/config.json npm start
```

### Example `config.json`

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

---

## 🧠 How It Works

For each URL:

1. Fetch page (lightweight `fetch`)
2. Fallback to Playwright if required
3. Optionally extract by CSS selector
4. Optionally filter via regex
5. Hash content (SHA-256)
6. Compare with stored hash in `public/data/state.json`
7. If changed:
   - Save snapshot
   - Generate unified diff
   - Append structured event

All state and outputs are written directly into `public/`.

---

## 📁 Project Structure

```
.
├── config.json
├── src/
│   ├── index.js                       # Orchestrator (entry point)
│   ├── utils.js                       # shared paths and helpers
│   ├── config.js                      # Config validation and loader
│   ├── state.js                       # State load/save + cleanup
│   ├── fetcher_internal_helper.js     # Playwright + timeout helpers
│   ├── fetcher.js                     # Fetch + Playwright fallback
│   ├── differ.js                      # Hashing + unified diff
│   ├── storage.js                     # Snapshot/diff writing + retention
│   └── events.js                      # Structured logging
└── public/
    ├── config.json
    ├── data/
    │   ├── state.json
    │   └── <Title>/
    │       └── *.html
    └── logs/
        ├── events.json
        └── <Title>/
            └── diff_*.txt
```

There are no root-level `data/` or `logs/` directories; `public/` is canonical.

---

**Key Principles:**

- `public/` is canonical storage
- No runtime server
- Clear module separation
- Continuous loop controlled by scheduler
- Deterministic file-based outputs

---

## ▶️ Usage

### Continuous Mode (default)

```bash
npm start
```

- Runs immediately
- Repeats every `intervalMinutes`
- Reloads config each cycle
- Runs until stopped

### One-Time Mode

```bash
npm run start:once
```

Useful for CI, cron jobs, and GitHub Actions.

---

## 📝 Event Logging

Events are stored in:

```
public/logs/events.json
```

Example:

```json
{
  "timestamp": "2026-02-13T18:41:22.112Z",
  "type": "CHANGED",
  "title": "Example",
  "url": "https://example.com",
  "snapshot": "...",
  "diff": "..."
}
```

Retention: last 200 events.

---

## 🗂 Retention Policy

- 3 snapshots per URL (default)
- 3 diffs per URL (default)

Older files are automatically removed.

---

## 🌍 Static Hosting

The `public/` directory is self-contained.

Deploy manually:

```bash
npm run start:once
npx gh-pages -d public
```

---

## 🛡 Error Handling

- Per-URL errors do not stop monitoring
- Fatal config errors are logged and exit
- Renderer failures fallback gracefully
- Clean shutdown on Ctrl+C

---

## 📌 Summary

This project is a continuous, modular, static-site-generating monitoring engine with clear separation of concerns and fully file-based storage.
