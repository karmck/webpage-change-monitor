# Webpage Change Monitor - AI Agent Instructions

## Project Overview
A lightweight, file-based Node.js monitoring tool that watches URLs for content changes, stores HTML snapshots, generates unified diffs, and provides a web UI for configuration and viewing changes. **Zero database required** — all state is file-based.

## Core Architecture

### File-Based Storage Pattern
- **Snapshots**: `data/{title}/{title}_YYYY-MM-DDTHH-MM-SS-mmmZ.html` (keeps last 3 per URL)
- **Diffs**: `logs/{title}/diff_{title}_YYYY-MM-DDTHH-MM-SS-mmmZ.txt` (keeps last 3 per URL)
- **State**: `data/state.json` (tracks SHA-256 hashes for change detection)
- **Config**: `config.json` (URLs, intervals, user agent)

**Title Sanitization**: All titles are sanitized by replacing non-alphanumeric characters with underscores (`/[^a-zA-Z0-9]/g` → `_`) for file names.

### Main Components
1. **Monitor Service** (`src/index.js`): Polls URLs on interval, detects changes via SHA-256, stores snapshots/diffs, auto-cleanup
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

## Common Modification Points

### Adding/Removing Fields in Config
- Update validation in `routes/config.js` (`/api/config` POST handler)
- Update state tracking if affecting change detection (see `src/index.js` hash logic)

### Changing Retention Policies
- **Snapshots**: Loop in `snapshotPathForUrl` cleanup
- **Diffs**: Loop in `appendLog` cleanup (currently keeps 3)
- **Logs**: `trimLogFile()` enforces 24-hour cutoff

### Frontend Changes
- View template: `views/index.html` (loads config via `/api/config`, renders table dynamically)
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
