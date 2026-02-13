import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath =
  process.env.WEBPAGE_MONITOR_CONFIG ?? path.join(rootDir, "config.json");
const statePath = path.join(rootDir, "data", "state.json");
const logPath = path.join(rootDir, "logs", "changes.log");
const publicDir = path.join(rootDir, "public");

const args = new Set(process.argv.slice(2));
const runOnce = args.has("--once");
const RENDERER_BACKOFF_MINUTES = 60;

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

// Publish helpers for static UI
function publishConfig() {
  try {
    fs.mkdirSync(publicDir, { recursive: true });
    const dest = path.join(publicDir, "config.json");
    try {
      if (filesAreEqual && filesAreEqual(configPath, dest)) return;
    } catch (e) {}
    fs.copyFileSync(configPath, dest);
  } catch (e) {}
}

function writeIndexJson(dir, key, list) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const out = {};
    out[key] = list;
    const dest = path.join(dir, "index.json");
    const content = JSON.stringify(out, null, 2) + "\n";
    try {
      if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf-8') === content) {
        return;
      }
    } catch (e) {}
    fs.writeFileSync(dest, content, "utf-8");
  } catch (e) {}
}

function fileHash(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (e) { return null; }
}

function promiseWithTimeout(p, ms, msg) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error(msg || 'timeout')); } }, ms);
    p.then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } }).catch(e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
  });
}

function filesAreEqual(a, b) {
  try {
    if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    if (sa.size !== sb.size) return false;
    const ha = fileHash(a);
    const hb = fileHash(b);
    return ha && hb && ha === hb;
  } catch (e) { return false; }
}

function publishTitleAssets(title) {
  try {
    const sanitized = title.replace(/[^a-zA-Z0-9]/g, "_");
    // snapshots: copy then trim public copies to latest 3
    const srcSnapDir = path.join(rootDir, "data", sanitized);
    const dstSnapDir = path.join(publicDir, "data", sanitized);
    if (fs.existsSync(srcSnapDir)) {
      fs.mkdirSync(dstSnapDir, { recursive: true });
      const files = fs.readdirSync(srcSnapDir).filter(f => f.endsWith('.html'));
      const snapObjs = [];
      files.forEach(f => {
        const src = path.join(srcSnapDir, f);
        const dst = path.join(dstSnapDir, f);
        try { if (!filesAreEqual(src, dst)) fs.copyFileSync(src, dst); } catch (e) {}
        try {
          const mtime = fs.statSync(path.join(dst)).mtime;
          snapObjs.push({ name: f, path: dst, mtime });
        } catch (e) {
          snapObjs.push({ name: f, path: dst, mtime: new Date(0) });
        }
      });
      // sort newest first, keep only the latest 3 in public
      snapObjs.sort((a, b) => b.mtime - a.mtime);
      for (let i = 3; i < snapObjs.length; i++) {
        try { fs.unlinkSync(snapObjs[i].path); } catch (e) {}
      }
      const snaps = snapObjs.slice(0, 3).map(s => s.name);
      writeIndexJson(dstSnapDir, 'snapshots', snaps);
    }

    // diffs: copy then trim public copies to latest 3
    const srcDiffDir = path.join(rootDir, "logs", sanitized);
    const dstDiffDir = path.join(publicDir, "logs", sanitized);
    if (fs.existsSync(srcDiffDir)) {
      fs.mkdirSync(dstDiffDir, { recursive: true });
      const files = fs.readdirSync(srcDiffDir).filter(f => f.startsWith('diff_') && f.endsWith('.txt'));
      const diffObjs = [];
      files.forEach(f => {
        const src = path.join(srcDiffDir, f);
        const dst = path.join(dstDiffDir, f);
        try { if (!filesAreEqual(src, dst)) fs.copyFileSync(src, dst); } catch (e) {}
        try {
          const mtime = fs.statSync(path.join(dst)).mtime;
          diffObjs.push({ name: f, path: dst, mtime });
        } catch (e) {
          diffObjs.push({ name: f, path: dst, mtime: new Date(0) });
        }
      });
      // sort newest first, keep only the latest 3 in public
      diffObjs.sort((a, b) => b.mtime - a.mtime);
      for (let i = 3; i < diffObjs.length; i++) {
        try { fs.unlinkSync(diffObjs[i].path); } catch (e) {}
      }
      const diffs = diffObjs.slice(0, 3).map(d => d.name);
      writeIndexJson(dstDiffDir, 'diffs', diffs);
    }
  } catch (e) {}
}

function publishAllFromConfig(cfg) {
  try {
    publishConfig();
    // Publish data state file so gh-pages retains hashes between runs
    try {
      if (fs.existsSync(statePath)) {
        const dstStateDir = path.join(publicDir, 'data');
        fs.mkdirSync(dstStateDir, { recursive: true });
        const dest = path.join(dstStateDir, 'state.json');
        if (!filesAreEqual(statePath, dest)) fs.copyFileSync(statePath, dest);
      }
    } catch (e) {}
    // Publish logs changes files so gh-pages retains hashes between runs
    try {
      if (fs.existsSync(logPath)) {
        const dstLogDir = path.join(publicDir, 'logs');
        fs.mkdirSync(dstLogDir, { recursive: true });
        const dest = path.join(dstLogDir, 'changes.log');
        if (!filesAreEqual(logPath, dest)) fs.copyFileSync(logPath, dest);
      }
    } catch (e) {}
    if (!cfg || !Array.isArray(cfg.urls)) return;
    for (const entry of cfg.urls) {
      const title = typeof entry === 'string' ? entry : (entry.title ?? entry.url);
      publishTitleAssets(title);
    }
  } catch (e) {}
}

function cleanupRemovedUrls(state, cfg) {
  if (!state || !state.urls) return;
  const configured = new Set((cfg && Array.isArray(cfg.urls) ? cfg.urls.map(e => (typeof e === 'string' ? e : e.url)) : []));
  const now = new Date().toISOString();
  for (const url of Object.keys(state.urls)) {
    if (configured.has(url)) continue;
    try {
      const info = state.urls[url] || {};
      // derive sanitized title from lastSnapshot path if present, else fallback from url
      let sanitized = null;
      if (info.lastSnapshot) {
        try { sanitized = path.basename(path.dirname(info.lastSnapshot)); } catch (e) { sanitized = null; }
      }
      if (!sanitized) sanitized = (url || '').replace(/[^a-zA-Z0-9]/g, "_");

      // remove data and logs for this title
      try { fs.rmSync(path.join(rootDir, 'data', sanitized), { recursive: true, force: true }); } catch (e) {}
      try { fs.rmSync(path.join(rootDir, 'logs', sanitized), { recursive: true, force: true }); } catch (e) {}

      // remove published copies
      try { fs.rmSync(path.join(publicDir, 'data', sanitized), { recursive: true, force: true }); } catch (e) {}
      try { fs.rmSync(path.join(publicDir, 'logs', sanitized), { recursive: true, force: true }); } catch (e) {}

      appendLog(`${now} REMOVED [${sanitized}] ${url}`);
    } catch (e) {
      // ignore cleanup errors per-title
    }
    // remove from state
    try { delete state.urls[url]; } catch (e) {}
  }
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
  const intervalMinutes = Number(config.intervalMinutes ?? 5);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    throw new Error("intervalMinutes must be a number >= 1");
  }
  const urls = config.urls.map(entry => {
    if (typeof entry === "string") {
      return { url: entry, title: entry };
    }
    if (!entry.url) throw new Error("Each url entry must have a 'url' field");
    // support optional regex filtering: `regex` (string) and optional `regexFlags` (string)
    let compiledRegex = undefined;
    if (entry.regex) {
      try {
        const flags = entry.regexFlags ?? 'g';
        compiledRegex = new RegExp(entry.regex, flags);
      } catch (e) {
        throw new Error(`Invalid regex for url ${entry.url}: ${e && e.message}`);
      }
    }
    return { url: entry.url, title: entry.title ?? entry.url, selector: entry.selector, dynamicData: Boolean(entry.dynamicData), regex: entry.regex, regexFlags: entry.regexFlags, compiledRegex };
  });
  return {
    intervalSeconds: intervalMinutes * 60,
    intervalMinutes,
    userAgent: config.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    urls
  };
}

async function fetchContent(url, userAgent, debugTitle) {
  // Try lightweight fetch first
  const ts = Date.now();
  const u = new URL(url);
  u.searchParams.set("_t", ts.toString());
  try {
    // timeout the fetch to avoid indefinite hangs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(u.toString(), { headers: { "user-agent": userAgent }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      clearTimeout(timeout);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error(`[DEBUG] fetch failed/timeout for ${debugTitle}, falling back to renderer: ${err && err.message}`);
    return await fetchRenderedContent(url, userAgent, debugTitle, undefined, 'fetch-failed');
  }
}

// Renderer fallback for pages that require JS to render (uses Playwright)
let _browser = null;
// Playwright-based renderer fallback
async function ensureBrowser() {
  if (_browser) return _browser;
  try {
    const playwright = await import('playwright');
    _browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    // Playwright browser launched (no verbose logs)
    return _browser;
  } catch (e) {
    console.error('[DEBUG] Playwright not available:', e && e.message);
    throw e;
  }
}

async function fetchRenderedContent(url, userAgent, debugTitle, selector, reason = 'unknown') {
  const browser = await ensureBrowser();
  // Indicate Playwright will be used for this check (single concise debug log)
  console.error(`[DEBUG] Playwright used for [${debugTitle}] reason=${reason} selector=${selector ?? 'none'}`);
  let context;
  let page;
  try {
    context = await promiseWithTimeout(browser.newContext({ userAgent }), 15000, 'newContext timed out');
    page = await promiseWithTimeout(context.newPage(), 10000, 'newPage timed out');

    // Attach verbose handlers
    // suppress verbose page event logging
    page.on('console', () => {});
    page.on('pageerror', () => {});
    page.on('requestfailed', () => {});
    page.on('response', () => {});
    const navStart = Date.now();
    if (selector) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        // Wait until the selector's elements contain non-empty content (text or innerHTML),
        // which helps ensure dynamic data loaded into the element. Poll manually to avoid
        // serialization issues with page.waitForFunction in some environments.
        try {
          const pollInterval = 500;
          const pollTimeout = 10000;
          const start = Date.now();
          let ready = false;
          while (Date.now() - start < pollTimeout) {
            try {
              const ok = await page.evaluate((sel) => {
                const els = Array.from(document.querySelectorAll(sel));
                if (!els.length) return false;
                return els.some(e => {
                  const txt = (e.innerText || e.textContent || '').trim();
                  const html = (e.innerHTML || '').trim();
                  return (txt && txt.length > 5) || (html && html.length > 20);
                });
              }, selector);
              if (ok) { ready = true; break; }
            } catch (e) {
              // evaluation failed for this iteration; continue polling
            }
            await page.waitForTimeout(pollInterval);
          }
          if (ready) /* selector content ready */ null;
            else /* selector content wait timed out */ null;
        } catch (e) {
          console.error(`[PLAYWRIGHT] selector content wait failed: ${e && e.message}`);
        }
        const html = await page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map(e => e.outerHTML).join('\n'), selector);
          /* selector found */
        /* extracted fragment length: ${html && html.length} */
        try { await context.close(); } catch (e) {}
        return html;
      } catch (e) {
        /* selector not found */
        // fall back to full content
      }
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    const content = await page.content();
    /* navigation/content retrieved */
    try { await context.close(); } catch (e) {}
    return content;
  } catch (e) {
    console.error(`[DEBUG] Playwright error for [${debugTitle}]: ${e && e.message}`);
    try { if (context) await context.close(); } catch (er) {}
    try { if (_browser) { await _browser.close(); _browser = null; } } catch (er) {}
    throw e;
  }
}

async function extractBySelector(html, selector) {
  if (!selector) return html;
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(html);
  const targets = dom.window.document.querySelectorAll(selector);
  if (!targets.length) return "";
  // Return concatenated HTML of all matching elements
  return Array.from(targets).map(el => el.outerHTML).join("\n");
}

async function checkOnce(config, state) {
  const now = new Date().toISOString();
  let changedCount = 0;

  for (const entry of config.urls) {
    const url = entry.url;
    const title = entry.title;
    console.error(`[DEBUG] Checking: [${title}] ${url}`);
    try {
      const selector = entry.selector;
      let rawBody = null;
      let body = "";
      if (entry.dynamicData) {
        console.error(`[DEBUG] dynamicData=true, forcing renderer for [${title}] ${url}`);
        // If we've recently seen renderer failures for this URL, skip rendering for a while
        const prev = state.urls[url] || {};
        if (prev.rendererFailedAt) {
          try {
            const failedAt = new Date(prev.rendererFailedAt);
            const cutoff = Date.now() - (RENDERER_BACKOFF_MINUTES * 60 * 1000);
            if (failedAt.getTime() > cutoff) {
              console.error(`[DEBUG] Skipping renderer for ${title}; previous failure at ${prev.rendererFailedAt}`);
              rawBody = await fetchContent(url, config.userAgent, title);
              body = await extractBySelector(rawBody, selector);
              // skip the renderer attempt
              continue;
            }
          } catch (e) {}
        }
        // Force using the renderer for dynamic pages
        try {
          rawBody = await fetchRenderedContent(url, config.userAgent, title, selector, 'dynamicData');
          // If we requested a selector from the renderer, it already returns the fragment
          // so treat it as the final body without re-running selector extraction.
          body = selector ? rawBody : await extractBySelector(rawBody, selector);
        } catch (e) {
          // record failure timestamp and fallback to lightweight fetch
          const now = new Date().toISOString();
          state.urls[url] = { ...(state.urls[url] || {}), rendererFailedAt: now };
          console.error(`[DEBUG] Renderer failed for ${title}; recorded rendererFailedAt=${now}`);
          rawBody = await fetchContent(url, config.userAgent, title);
          body = await extractBySelector(rawBody, selector);
        }
      } else {
        rawBody = await fetchContent(url, config.userAgent, title);
        body = await extractBySelector(rawBody, selector);
        // If a selector is provided but extraction returned empty, try rendering with the renderer (Playwright)
        if (selector && (!body || body.trim().length === 0)) {
          try {
            const rendered = await fetchRenderedContent(url, config.userAgent, title, selector, 'selector-empty');
            body = rendered;
            rawBody = rendered;
          } catch (e) {
            // continue with original body
          }
        }
      }
      // If a regex filter is configured, only keep the matched content for snapshots/comparisons
      if (entry.compiledRegex) {
        try {
            const matches = body.match(entry.compiledRegex);
            const matchCount = matches ? matches.length : 0;
            // keep only the first match (first batch)
            body = matches && matches.length ? matches[0] : "";
            console.error(`[DEBUG] Regex applied: pattern="${entry.regex}" flags="${entry.regexFlags ?? 'g'}" matches=${matchCount} kept_length=${body.length}`);
        } catch (e) {
          // on regex errors, fall back to original body
          console.error(`[DEBUG] Regex error for [${title}]: ${e && e.message}`);
        }
      }
      // Compute digest after any regex filtering so snapshots and hashes match
      const digest = hashContent(body);
      console.error(`[DEBUG] Selector: ${selector ?? "none"} Extracted length: ${body.length} digest=${digest.slice(0,8)}`);
      const previous = state.urls[url];
      

      if (!previous) {
        // First time: snapshot and log NEW
        const snapshotFile = snapshotPathForUrl(title);
        writeSnapshot(body, snapshotFile);
        try { publishTitleAssets(title); } catch (e) {}
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
          try { publishTitleAssets(title); } catch (e) {}

          const logMsg = `${now} CHANGED [${title}] ${url} previous=${previousSnapshot} current=${snapshotFile} diff=${diffFile}`;
          appendLog(logMsg);
          console.error("\x1b[1;31mCHANGE DETECTED on " + title + "\x1b[0m");
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
  try { cleanupRemovedUrls(state, config); saveState(state); } catch (e) {}
  try { publishAllFromConfig(config); } catch (e) {}

  console.error("[DEBUG] config loaded, URLs:", config.urls.length);
  console.error("[DEBUG] intervalMinutes:", config.intervalMinutes);
  console.error("[DEBUG] userAgent:", config.userAgent);

  const runCheck = async () => {
    const currentConfig = validateConfig(readJson(configPath));
    console.error("[DEBUG] config loaded, URLs:", currentConfig.urls.length);
    console.error("[DEBUG] Running check...");
    const changed = await checkOnce(currentConfig, state);
    saveState(state);
    try { cleanupRemovedUrls(state, currentConfig); saveState(state); } catch (e) {}
    try { publishAllFromConfig(currentConfig); } catch (e) {}
    console.error("[DEBUG] Check complete, changed:", changed+ "\n");
    return currentConfig;
  };

  if (runOnce) {
    console.error("[DEBUG] Running once and exiting");
    await runCheck();
    return;
  }

  console.error("[DEBUG] Initial check");
  let currentConfig = await runCheck();
  console.error("[DEBUG] Scheduling checks every", currentConfig.intervalMinutes, "minutes");
  console.error("[DEBUG] Initial check done. Monitoring forever. Press Ctrl+C to stop."+ "\n");
  let timer = setInterval(async () => {
    currentConfig = await runCheck();
  }, currentConfig.intervalSeconds * 1000);
  setInterval(() => {
    const newConfig = validateConfig(readJson(configPath));
    if (newConfig.intervalMinutes !== currentConfig.intervalMinutes) {
      console.error("[DEBUG] Interval changed from", currentConfig.intervalMinutes, "to", newConfig.intervalMinutes, "minutes");
      currentConfig = newConfig;
      clearInterval(timer);
      timer = setInterval(async () => {
        currentConfig = await runCheck();
      }, currentConfig.intervalSeconds * 1000);
    }
  }, 5000);
}

main().catch((error) => {
  const now = new Date().toISOString();
  appendLog(`${now} FATAL ${error.message}`);
  console.error(error.message);
  process.exitCode = 1;
});
