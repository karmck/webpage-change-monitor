import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath =
  process.env.WEBPAGE_MONITOR_CONFIG ?? path.join(rootDir, "config.json");
const statePath = path.join(rootDir, "data", "state.json");
const logPath = path.join(rootDir, "logs", "changes.log");

const args = new Set(process.argv.slice(2));
const runOnce = args.has("--once");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function trimLogFile() {
  if (!fs.existsSync(logPath)) return;
  const content = fs.readFileSync(logPath, "utf-8");
  const lines = content.trim().split("\n");
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  const filtered = lines.filter(line => {
    const ts = line.slice(0, line.indexOf(" "));
    return ts && new Date(ts) >= cutoff;
  });
  if (filtered.length < lines.length) {
    fs.writeFileSync(logPath, filtered.join("\n") + "\n", "utf-8");
  }
}

function appendLog(line) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line + "\n", "utf-8");
  trimLogFile();
  // Keep only the most recent 3 diff files per title in logs/
  const logsDir = path.dirname(logPath);
  if (fs.existsSync(logsDir)) {
    const titleDirs = fs.readdirSync(logsDir)
      .filter(f => !f.startsWith(".") && fs.statSync(path.join(logsDir, f)).isDirectory());
    for (const dir of titleDirs) {
      const diffFiles = fs.readdirSync(path.join(logsDir, dir))
        .filter(f => f.startsWith("diff_") && f.endsWith(".txt"))
        .map(f => ({ name: f, path: path.join(logsDir, dir, f), mtime: fs.statSync(path.join(logsDir, dir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      for (let i = 3; i < diffFiles.length; i++) {
        try { fs.unlinkSync(diffFiles[i].path); } catch {}
      }
    }
  }
}

function diffPathForUrl(title) {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const diffDir = path.join(rootDir, "logs", sanitizedTitle);
  return path.join(diffDir, `diff_${sanitizedTitle}_${ts}.txt`);
}

function consoleLog(line) {
  console.log(line);
}

function simpleUnifiedDiff(oldStr, newStr) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const out = [];
  let i = 0, j = 0;
  const maxLines = Math.max(oldLines.length, newLines.length);
  while (i < oldLines.length || j < newLines.length) {
    const a = i < oldLines.length ? oldLines[i] : undefined;
    const b = j < newLines.length ? newLines[j] : undefined;
    if (a === b) {
      // Skip unchanged lines entirely
      i++; j++;
    } else if (a === undefined) {
      out.push("+" + b);
      j++;
    } else if (b === undefined) {
      out.push("-" + a);
      i++;
    } else {
      out.push("-" + a);
      out.push("+" + b);
      i++; j++;
    }
  }
  return out;
}

function snapshotPathForUrl(title) {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = path.join(rootDir, "data", sanitizedTitle);
  return path.join(snapshotDir, `${sanitizedTitle}_${ts}.html`);
}

function writeSnapshot(content, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function loadState() {
  if (!fs.existsSync(statePath)) return { urls: {} };
  return readJson(statePath);
}

function saveState(state) {
  writeJson(statePath, state);
}

function validateConfig(config) {
  if (!config || !Array.isArray(config.urls) || config.urls.length === 0) {
    throw new Error("config.json must include a non-empty urls array");
  }
  const intervalSeconds = Number(config.intervalSeconds ?? 300);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 10) {
    throw new Error("intervalSeconds must be a number >= 10");
  }
  const urls = config.urls.map(entry => {
    if (typeof entry === "string") {
      return { url: entry, title: entry };
    }
    if (!entry.url) throw new Error("Each url entry must have a 'url' field");
    return { url: entry.url, title: entry.title ?? entry.url };
  });
  return {
    intervalSeconds,
    userAgent: config.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    urls
  };
}

async function fetchContent(url, userAgent, debugTitle) {
  const ts = Date.now();
  const u = new URL(url);
  u.searchParams.set("_t", ts.toString());
  console.error(`[DEBUG] Request: [${debugTitle}] ${u.toString()} User-Agent: ${userAgent}`);
  const response = await fetch(u.toString(), {
    headers: {
      "user-agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function checkOnce(config, state) {
  const now = new Date().toISOString();
  let changedCount = 0;

  for (const entry of config.urls) {
    const url = entry.url;
    const title = entry.title;
    console.error(`[DEBUG] Checking: [${title}] ${url}`);
    try {
      const body = await fetchContent(url, config.userAgent, title);
      const digest = hashContent(body);
      const previous = state.urls[url];
      

      if (!previous) {
        // First time: snapshot and log NEW
        const snapshotFile = snapshotPathForUrl(title);
        writeSnapshot(body, snapshotFile);
        state.urls[url] = { hash: digest, lastCheckedAt: now, lastChangedAt: now, lastSnapshot: snapshotFile };
        appendLog(`${now} NEW [${title}] ${url} snapshot=${snapshotFile}`);
        continue;
      }

      if (previous.hash !== digest) {
        changedCount += 1;
        const snapshotFile = snapshotPathForUrl(title);
        writeSnapshot(body, snapshotFile);
        const previousSnapshot = previous.lastSnapshot;

        let diffFile = null;
        if (previousSnapshot && fs.existsSync(previousSnapshot)) {
          const prevContent = fs.readFileSync(previousSnapshot, "utf-8");
          const diffLines = simpleUnifiedDiff(prevContent, body);

          diffFile = diffPathForUrl(title);
          fs.mkdirSync(path.dirname(diffFile), { recursive: true });
          fs.writeFileSync(diffFile, diffLines.join("\n"), "utf-8");

          const logMsg = `${now} CHANGED [${title}] ${url} previous=${previousSnapshot} current=${snapshotFile} diff=${diffFile}`;
          appendLog(logMsg);
          console.error("\x1b[1;31mCHANGE DETECTED on " + title + "\x1b[0m");
          consoleLog(`[${title}] --- DIFF START ---`);
          consoleLog(diffLines.join("\n"));
          consoleLog(`[${title}] --- DIFF END ---`);
        } else {
          const logMsg = `${now} CHANGED [${title}] ${url} current=${snapshotFile}`;
          appendLog(logMsg);
          consoleLog(logMsg);
        }

        // Cleanup older snapshot files for this title, keep only the most recent 3
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
        const snapshotDir = path.join(rootDir, "data", sanitizedTitle);
        if (fs.existsSync(snapshotDir)) {
          const allSnapshots = fs.readdirSync(snapshotDir)
            .filter(f => f.endsWith(".html"))
            .map(f => ({ name: f, path: path.join(snapshotDir, f), mtime: fs.statSync(path.join(snapshotDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
          for (let i = 3; i < allSnapshots.length; i++) {
            try { fs.unlinkSync(allSnapshots[i].path); } catch {}
          }
        }

        state.urls[url] = { hash: digest, lastCheckedAt: now, lastChangedAt: now, lastSnapshot: snapshotFile };
      } else {
        state.urls[url] = { ...previous, lastCheckedAt: now };
      }
    } catch (error) {
        appendLog(`${now} ERROR [${title}] ${url} ${error.message}`);
    }
  }

  return changedCount;
}

async function main() {
  if (!fs.existsSync(configPath)) {
    throw new Error("Missing config.json. Copy config.example.json to config.json first.");
  }

  const config = validateConfig(readJson(configPath));
  const state = loadState();

  console.error("[DEBUG] config loaded, URLs:", config.urls.length);
  console.error("[DEBUG] intervalSeconds:", config.intervalSeconds);

  const runCheck = async () => {
    console.error("[DEBUG] Running check...");
    const changed = await checkOnce(config, state);
    saveState(state);
    console.error("[DEBUG] Check complete, changed:", changed);
    return changed;
  };

  if (runOnce) {
    console.error("[DEBUG] Running once and exiting");
    await runCheck();
    return;
  }

  console.error("[DEBUG] Initial check");
  await runCheck();
  console.error("[DEBUG] Scheduling checks every", config.intervalSeconds, "seconds");
  console.error("[DEBUG] Initial check done. Monitoring forever. Press Ctrl+C to stop.");
  setInterval(runCheck, config.intervalSeconds * 1000);
}

main().catch((error) => {
  const now = new Date().toISOString();
  appendLog(`${now} FATAL ${error.message}`);
  console.error(error.message);
  process.exitCode = 1;
});
