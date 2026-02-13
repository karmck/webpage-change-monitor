import { configPath, runOnce, readJson, rootDir, publicDir } from './utils.js';
import { readConfig } from './config.js';
import { loadState, saveState, cleanupRemovedUrls } from './state.js';
import { fetchContent, fetchRenderedContent, extractBySelector } from './fetcher.js';
import { simpleUnifiedDiff, hashContent } from './differ.js';
import { snapshotPathForUrl, writeSnapshot, diffPathForUrl, publishAllFromConfig, publishTitleAssets } from './storage.js';
import { appendLog, consoleLog } from './events.js';
import fs from 'node:fs';
import path from 'node:path';

async function checkOnce(config, state, RENDERER_BACKOFF_MINUTES = 60) {
  const now = new Date().toISOString();
  let changedCount = 0;
  for (const entry of config.urls) {
    const url = entry.url;
    const title = entry.title;
    console.error(`[DEBUG] Checking: [${title}] ${url}`);
    try {
      const selector = entry.selector;
      let rawBody = null;
      let body = '';
      if (entry.dynamicData) {
        const prev = state.urls[url] || {};
        if (prev.rendererFailedAt) {
          try {
            const failedAt = new Date(prev.rendererFailedAt);
            const cutoff = Date.now() - (RENDERER_BACKOFF_MINUTES * 60 * 1000);
            if (failedAt.getTime() > cutoff) {
              rawBody = await fetchContent(url, config.userAgent, title);
              body = await extractBySelector(rawBody, selector);
              continue;
            }
          } catch (e) {}
        }
        try {
          rawBody = await fetchRenderedContent(url, config.userAgent, title, selector, 'dynamicData');
          body = selector ? rawBody : await extractBySelector(rawBody, selector);
        } catch (e) {
          const nowts = new Date().toISOString();
          state.urls[url] = { ...(state.urls[url] || {}), rendererFailedAt: nowts };
          rawBody = await fetchContent(url, config.userAgent, title);
          body = await extractBySelector(rawBody, selector);
        }
      } else {
        rawBody = await fetchContent(url, config.userAgent, title);
        body = await extractBySelector(rawBody, selector);
        if (selector && (!body || body.trim().length === 0)) {
          try {
            const rendered = await fetchRenderedContent(url, config.userAgent, title, selector, 'selector-empty');
            body = rendered;
            rawBody = rendered;
          } catch (e) {}
        }
      }
      if (entry.compiledRegex) {
        try {
          const matches = body.match(entry.compiledRegex);
          body = matches && matches.length ? matches[0] : '';
        } catch (e) {}
      }
      const digest = hashContent(body);
      console.error(`[DEBUG] Selector: ${selector ?? 'none'} Extracted length: ${body.length} digest=${digest.slice(0,8)}`);
      const previous = state.urls[url];
      if (!previous) {
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
          const prevContent = fs.readFileSync(previousSnapshot, 'utf-8');
          const diffLines = simpleUnifiedDiff(prevContent, body);
          diffFile = diffPathForUrl(title);
          fs.mkdirSync(path.dirname(diffFile), { recursive: true });
          fs.writeFileSync(diffFile, diffLines.join('\n'), 'utf-8');
          try { publishTitleAssets(title); } catch (e) {}
          const logMsg = `${now} CHANGED [${title}] ${url} previous=${previousSnapshot} current=${snapshotFile} diff=${diffFile}`;
          appendLog(logMsg);
          console.error('\x1b[1;31mCHANGE DETECTED on ' + title + '\x1b[0m');
        } else {
          const logMsg = `${now} CHANGED [${title}] ${url} current=${snapshotFile}`;
          appendLog(logMsg);
          consoleLog(logMsg);
        }
        // cleanup snapshots keep latest 3
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
        const snapshotDir = path.join(publicDir, 'data', sanitizedTitle);
        if (fs.existsSync(snapshotDir)) {
          const allSnapshots = fs.readdirSync(snapshotDir)
            .filter(f => f.endsWith('.html'))
            .map(f => ({ name: f, path: path.join(snapshotDir, f), mtime: fs.statSync(path.join(snapshotDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
          for (let i = 3; i < allSnapshots.length; i++) try { fs.unlinkSync(allSnapshots[i].path); } catch (e) {}
        }
        state.urls[url] = { hash: digest, lastCheckedAt: now, lastChangedAt: now, lastSnapshot: snapshotFile };
      } else {
        state.urls[url] = { ...previous, lastCheckedAt: now };
      }
    } catch (error) {
      appendLog(`${now} ERROR [${title}] ${url} ${error && error.message}`);
    }
  }
  return changedCount;
}

async function main() {
  if (!fs.existsSync(configPath)) throw new Error('Missing config.json. Copy config.example.json to config.json first.');
  const config = readConfig(configPath);
  const state = loadState();
  try { cleanupRemovedUrls(state, config); saveState(state); } catch (e) {}
  try { publishAllFromConfig(config); } catch (e) {}
  console.error('[DEBUG] config loaded, URLs:', config.urls.length);
  console.error('[DEBUG] intervalMinutes:', config.intervalMinutes);
  console.error('[DEBUG] userAgent:', config.userAgent);

  const runCheck = async () => {
    const currentConfig = readConfig(configPath);
    console.error('[DEBUG] Running check...');
    const changed = await checkOnce(currentConfig, state);
    saveState(state);
    try { cleanupRemovedUrls(state, currentConfig); saveState(state); } catch (e) {}
    try { publishAllFromConfig(currentConfig); } catch (e) {}
    console.error('[DEBUG] Check complete, changed:', changed+ '\n');
    return currentConfig;
  };

  if (runOnce) {
    console.error('[DEBUG] Running once and exiting');
    await runCheck();
    return;
  }

  console.error('[DEBUG] Initial check');
  let currentConfig = await runCheck();
  console.error('[DEBUG] Scheduling checks every', currentConfig.intervalMinutes, 'minutes');
  console.error('[DEBUG] Initial check done. Monitoring forever. Press Ctrl+C to stop.'+ '\n');
  let timer = setInterval(async () => { currentConfig = await runCheck(); }, currentConfig.intervalSeconds * 1000);
  setInterval(() => {
    const newConfig = readConfig(configPath);
    if (newConfig.intervalMinutes !== currentConfig.intervalMinutes) {
      console.error('[DEBUG] Interval changed from', currentConfig.intervalMinutes, 'to', newConfig.intervalMinutes, 'minutes');
      currentConfig = newConfig;
      clearInterval(timer);
      timer = setInterval(async () => { currentConfig = await runCheck(); }, currentConfig.intervalSeconds * 1000);
    }
  }, 5000);
}

main().catch((error) => {
  const now = new Date().toISOString();
  appendLog(`${now} FATAL ${error.message}`);
  console.error(error.message);
  process.exitCode = 1;
});
