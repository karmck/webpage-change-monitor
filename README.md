# 🕵️ Webpage Monitor

A lightweight, file-based Node.js tool that monitors webpages for content changes, stores HTML snapshots, generates diffs, and maintains structured logs.

Designed for simple, self-hosted monitoring without external services.

---

## ✨ Features

- Monitor multiple URLs
- Optional CSS selector tracking (monitor only part of a page)
- SHA-256 hashing for reliable change detection
- HTML snapshot storage
- Unified diff generation on change
- Automatic cleanup (keeps last 3 snapshots per URL)
- Automatic diff retention (keeps last 3 diffs per URL)
- Log retention (keeps last 24 hours)
- Configurable polling interval
- Custom User-Agent support
- One-time execution mode (`--once`)
- Zero database required (file-based state)

---

## 📦 Requirements

- Node.js **18+** (uses native `fetch`)
- npm

---

## 🚀 Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/webpage-monitor.git
cd webpage-monitor
```

Install dependencies:

```bash
npm install
```

If your project does not yet include `jsdom`:

```bash
npm install jsdom
```

---

## ⚙️ Configuration

Create a `config.json` file in the project root.

You may optionally override the config location using:

```bash
WEBPAGE_MONITOR_CONFIG=/path/to/config.json node index.js
```

---

### Example `config.json`

```json
{
  "intervalSeconds": 300,
  "userAgent": "WebpageMonitor/1.0",
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

---

### Configuration Options

| Field | Type | Required | Description |
|--------|------|----------|-------------|
| `intervalSeconds` | number | Yes | Polling interval in seconds (minimum 10 enforced) |
| `userAgent` | string | No | Custom User-Agent header |
| `urls` | array | Yes | List of URLs to monitor |

---

### URL Configuration Formats

#### 1️⃣ Simple URL

```json
"https://example.com"
```

#### 2️⃣ Advanced URL Object

```json
{
  "url": "https://example.com",
  "title": "My Page",
  "selector": "#content"
}
```

| Field | Description |
|--------|-------------|
| `url` | Webpage URL |
| `title` | Used for folder naming and logs (auto-generated if omitted) |
| `selector` | Optional CSS selector to monitor specific content only |

If a selector is provided, only the extracted HTML from that element is monitored and hashed.

---

## 🧠 How It Works

For each configured URL:

1. The page is fetched (with a cache-busting timestamp parameter).
2. If a CSS selector is configured:
   - The page is parsed using `jsdom`
   - Only the selected element’s HTML is extracted
3. A SHA-256 hash of the monitored content is generated.
4. The hash is compared against the previously stored hash.
5. If this is the first run:
   - A snapshot is stored
   - State is initialized
   - Logged as `NEW`
6. If the content changed:
   - A new snapshot is saved
   - A unified diff is generated
   - Change is logged as `CHANGED`
7. If unchanged:
   - Only `lastCheckedAt` is updated

All state is stored locally.

No database required.

---

## 📁 Project Structure

```
.
├── index.js
├── config.json
├── data/
│   ├── state.json
│   └── <sanitized_title>/
│       ├── snapshot_<timestamp>.html
├── logs/
│   ├── changes.log
│   └── <sanitized_title>/
│       ├── diff_<timestamp>.txt
```

---

## 🗂 State File

State is stored in:

```
data/state.json
```

Each monitored URL entry contains:

```json
{
  "hash": "sha256_hash",
  "lastCheckedAt": "ISO timestamp",
  "lastChangedAt": "ISO timestamp",
  "lastSnapshot": "path/to/snapshot.html"
}
```

---

## ▶️ Usage

### Continuous Monitoring Mode

```bash
node index.js
```

- Runs immediately on start
- Repeats every `intervalSeconds`
- Runs until manually stopped

---

### One-Time Execution Mode

```bash
node index.js --once
```

Useful for:

- Cron jobs
- GitHub Actions
- CI pipelines
- Scheduled monitoring tasks

---

### Web Configuration UI

The project includes a lightweight web UI for managing `config.json` without editing files manually.

#### Start the Web UI

```bash
npm run web-ui
```

By default, the UI runs on:
```
http://localhost:3000
```

#### Accessing the UI

1. Start the web UI with the command above
2. Open your browser and navigate to http://localhost:3000
3. View, add, edit, or delete monitored URLs
4. Adjust the polling interval
5. Click a diff link to view the exact changes in a modal

- The UI reads and writes the same `config.json` file used by the monitor
- Changes you make are picked up on the next monitoring cycle automatically
- Optional CSS selectors are respected for section-only monitoring
- Diffs are color‑coded (removed = light red, added = light green)

---

## 📝 Logging

Main log file:

```
logs/changes.log
```

Each log entry contains:

- Timestamp
- Status (`NEW`, `CHANGED`, `ERROR`, `FATAL`)
- URL
- Snapshot path
- Diff path (if applicable)

---

### Log Retention Policy

- Keeps only the last **24 hours** of log entries
- Keeps only the latest **3 snapshots per URL**
- Keeps only the latest **3 diff files per URL**

Older files are automatically removed.

---

## 🔍 Diff Format

When content changes, a simple unified diff is generated:

```
- old line
+ new line
```

Unchanged lines are omitted for clarity.

Diff files are stored in:

```
logs/<title>/diff_<title>_<timestamp>.txt
```

---

## 🛡 Error Handling

- Non-200 HTTP responses are treated as errors
- Network failures are logged
- Configuration errors are logged as `FATAL`
- Errors for one URL do not stop monitoring of others

---

## 🌍 Environment Variable Override

Override config path:

```bash
WEBPAGE_MONITOR_CONFIG=/custom/path/config.json node index.js
```

---

## 📌 Example Use Cases

- Monitor pricing changes
- Track blog or news updates
- Watch policy/legal page changes
- Detect CMS content modifications
- Monitor specific DOM elements only
- Lightweight alternative to commercial monitoring services
- CI-based webpage regression monitoring

---

## 📄 License

MIT License  
(Replace with your preferred license if different)

---

## 💡 Why This Tool?

- No SaaS dependency
- No third-party API
- No database
- Minimal footprint
- Fully self-contained
- Works in cron, Docker, or CI
- Transparent file-based auditing

---

## 🤝 Contributing

Pull requests are welcome.  
If you plan to add features (notifications, retries, email alerts, etc.), please open an issue first to discuss.

---

## 🧩 Future Enhancements (Ideas)

- Email or Slack notifications
- Webhook integration
- Retry with exponential backoff
- Content normalization (ignore timestamps, dynamic tokens)
- HTML → text diff mode
- Docker image
- GitHub Actions template

---

## 📬 Questions?

Open an issue in the repository and describe your use case.

---

**Simple. Transparent. Self-hosted.**
