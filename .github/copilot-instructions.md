# Webpage Change Monitor - AI Agent Instructions

## Project Overview
A lightweight, file-based Node.js monitoring tool that watches URLs for content changes, stores HTML snapshots, generates unified diffs, and publishes a static UI (in `public/`) for read-only viewing. **Zero database required** — all state is file-based.

## Core Architecture

### File-Based Storage Pattern
- **Snapshots**: `data/{title}/{title}_YYYY-MM-DDTHH-MM-SS-mmmZ.html` (keeps last 3 per URL)
- **Diffs**: `logs/{title}/diff_{title}_YYYY-MM-DDTHH-MM-SS-mmmZ.txt` (keeps last 3 per URL)
- **State**: `data/state.json` (tracks SHA-256 hashes for change detection)
- **Config**: `config.json` (URLs, intervals, user agent)

**Title Sanitization**: All titles are sanitized by replacing non-alphanumeric characters with underscores (`/[^a-zA-Z0-9]/g` → `_`) for file names.

### Main Components
1. **Monitor Service** (`src/index.js`): Polls URLs on interval, detects changes via SHA-256, stores snapshots/diffs, auto-cleanup, and publishes a static bundle to `public/` (config, snapshots/diffs indexes, `data/state.json`, `logs/changes.log`).
2. **Web UI** (`src/web-ui.js`): Lightweight HTTP server (Node 18+, no framework dependencies)
3. **API Routes** (`routes/config.js`): Handles GET/POST for config, diffs, snapshots, intervals
4. **Utilities** (`routes/utils.js`): File serving and common helpers

### Key Developer Workflows
| Task | Command |
|------|---------|
| Start monitoring | `npm start` |
| One-time check | `npm run start:once` |
| Web UI only | `npm run web-ui` (PORT defaults to 3000) |
| Override config | `WEBPAGE_MONITOR_CONFIG=/path/config.json npm start` |
| Deploy static UI (GH Actions) | Workflow `.github/workflows/deploy-gh-pages.yml` |
| Manual publish (local) | `npx gh-pages -d public` |

## Code Patterns & Conventions

### URL Configuration (config.json)
```json
{
  "intervalMinutes": 15,
  "urls": [
    "https://example.com",
    {
      "url": "https://example.com/news",
      "title": "Example News",
      "selector": "#main-content"
    }
  ]
}
```
- URLs can be **simple strings** or **objects** with optional CSS selector for partial monitoring
- All API endpoints refer to URLs by their **title** (use sanitized version in paths)

### Diff Generation
- Custom "simple unified diff" (`simpleUnifiedDiff` in `src/index.js`) compares line-by-line
- Format: lines starting with `-` (removed) or `+` (added)
- Used in modal display with colored backgrounds (`.diff-minus` and `.diff-plus`)

### Frontend (HTML/CSS/JS)
- **Mobile responsive**: 600px breakpoint; table switches to block layout with `data-*` labels
- **Modals**: Both `#diffModal` and `#snapshotModal` use overlay background; clicking outside or X button closes
- **Recent links**: Shows last 3 diffs per URL with human-readable timestamps
- **UI state**: Opened modals prevent background scroll (body overflow: hidden)
- **Paths**: All asset/data paths are relative (e.g. `data/...`, `logs/...`) for GitHub Pages subpath hosting

### Static Publishing (public/)
- `publishConfig()` copies the repo `config.json` into `public/config.json`
- `publishTitleAssets(title)` copies snapshots/diffs into `public/data/<title>/` and `public/logs/<title>/` and writes `index.json` listings used by the UI
- `publishAllFromConfig()` additionally copies `data/state.json` → `public/data/state.json` and `logs/changes.log` → `public/logs/changes.log`

### GitHub Actions (deploy-gh-pages.yml)
- `permissions: contents: write` so `github-actions[bot]` can push to `gh-pages`
- Checks out `gh-pages` into `gh-pages/`, restores `data/` and `logs/` to the workspace before running the monitor (preserves `state.json`, snapshots, diffs)
- Runs `npm ci` then `npm run start:once` to populate `public/`
- Deploys with `JamesIves/github-pages-deploy-action@v4` using `FOLDER: public` and `CLEAN: true` to remove stale files
- Does not restore `config.json` from `gh-pages`; the repo (or `WEBPAGE_MONITOR_CONFIG`) remains the source of truth and is republished each run

## Common Modification Points

### Adding/Removing Fields in Config
- Update validation in `routes/config.js` (`/api/config` POST handler)
- Update state tracking if affecting change detection (see `src/index.js` hash logic)

### Changing Retention Policies
- **Snapshots**: Loop in `snapshotPathForUrl` cleanup
- **Diffs**: Loop in `appendLog` cleanup (currently keeps 3)
- **Logs**: `trimLogFile()` enforces 24-hour cutoff

### Frontend Changes
- View templates: `views/index.html` (local server) and `public/index.html` (static UI, loads config from `public/config.json`)
- Styles: `public/styles.css` (includes mobile media queries)
- Close button styling: Fixed position on desktop, sticky on mobile (recent enhancement)

## Dependencies & Constraints
- **Node.js**: 18+ (uses native `fetch`, ES modules)
- **jsdom**: For CSS selector extraction (optional but required for selector feature)
- **No external HTTP frameworks**: Uses only Node's `http` module
- **No database**: Minimal file I/O, suitable for small-scale monitoring

## Testing & Debugging
- Single run mode useful for testing: `npm run start:once`
- Check `data/state.json` to inspect tracked file hashes
- View logs in `logs/` directory for change history
- Browser dev tools when debugging UI (modals, responsive layout)
