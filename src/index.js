import { configPath, runOnce, readJson, rootDir, publicDir } from './utils.js';
import { readConfig } from './config.js';
import { loadState, saveState, cleanupRemovedUrls } from './state.js';
import { fetchContent, fetchRenderedContent, extractBySelector } from './fetcher.js';
import { simpleUnifiedDiff, hashContent, normalizeHtmlToText } from './differ.js';
import { snapshotPathForUrl, snapshotRawPathForUrl, writeSnapshot, diffPathForUrl, publishAllFromConfig, publishTitleAssets } from './storage.js';
import { appendLog, consoleLog, appendEvent, migrateChangesLogToEvents, normalizeEventsJson, appendDebug } from './events.js';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(rootDir, '.env') });

import { notifyTelegramBatch } from './telegram.js';

async function checkOnce(config, state, RENDERER_BACKOFF_MINUTES = 60, changesCollector = []) {
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
            const rendered = await fetchRenderedContent(url, config.userAgent, title, selector, 'selector-no-results');
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
      // normalize extracted body to visible-text format with preserved line breaks
      const normalized = normalizeHtmlToText(body || '');
      const digest = hashContent(normalized);
      console.error(`[DEBUG] Selector: ${selector ?? 'none'} Extracted length: ${normalized.length} digest=${digest.slice(0,8)}`);
      const previous = state.urls[url];
      if (!previous) {
        const rawSnapshotFile = snapshotRawPathForUrl(title);
        const snapshotFile = snapshotPathForUrl(title);
        // write raw HTML snapshot (archive) of the extracted content (prefer `body` which is the selector-extracted HTML)
        try { writeSnapshot(body || rawBody, rawSnapshotFile); } catch (e) {}
        writeSnapshot(normalized, snapshotFile);
        try { publishTitleAssets(title); } catch (e) {}
        state.urls[url] = { hash: digest, lastCheckedAt: now, lastChangedAt: now, lastSnapshot: snapshotFile };
        appendLog(`${now} NEW [${title}] ${url} snapshot=${snapshotFile}`);
        try { appendEvent({ timestamp: now, type: 'NEW', title, url, snapshot: snapshotFile, rawSnapshot: rawSnapshotFile }); } catch (e) {}
        continue;
      }
      if (previous.hash !== digest) {
        changedCount += 1;
        const rawSnapshotFile = snapshotRawPathForUrl(title);
        const snapshotFile = snapshotPathForUrl(title);
        try { writeSnapshot(body || rawBody, rawSnapshotFile); } catch (e) {}
        writeSnapshot(normalized, snapshotFile);
        const previousSnapshot = previous.lastSnapshot;
        let diffFile = null;
        if (previousSnapshot && fs.existsSync(previousSnapshot)) {
          const prevContent = fs.readFileSync(previousSnapshot, 'utf-8');
          const diffLines = simpleUnifiedDiff(prevContent, normalized);
          diffFile = diffPathForUrl(title);
          fs.mkdirSync(path.dirname(diffFile), { recursive: true });
          fs.writeFileSync(diffFile, diffLines.join('\n'), 'utf-8');
          try { publishTitleAssets(title); } catch (e) {}
          const logMsg = `${now} CHANGED [${title}] ${url} previous=${previousSnapshot} current=${snapshotFile} diff=${diffFile}`;
          appendLog(logMsg);
          try { appendEvent({ timestamp: now, type: 'CHANGED', title, url, previous: previousSnapshot, snapshot: snapshotFile, diff: diffFile }); } catch (e) {}
          console.error('\x1b[1;31mCHANGE DETECTED on ' + title + '\x1b[0m');
        } else {
          const logMsg = `${now} CHANGED [${title}] ${url} current=${snapshotFile}`;
          appendLog(logMsg);
          try { appendEvent({ timestamp: now, type: 'CHANGED', title, url, snapshot: snapshotFile }); } catch (e) {}
          consoleLog(logMsg);
        }
        // cleanup snapshots keep latest 3
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
        const snapshotDir = path.join(publicDir, 'data', sanitizedTitle);
        if (fs.existsSync(snapshotDir)) {
          const allSnapshots = fs.readdirSync(snapshotDir)
            .filter(f => f.toLowerCase().endsWith('.normalized.txt'))
            .map(f => ({ name: f, path: path.join(snapshotDir, f), mtime: fs.statSync(path.join(snapshotDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
          for (let i = 3; i < allSnapshots.length; i++) try { fs.unlinkSync(allSnapshots[i].path); } catch (e) {}
        }
        state.urls[url] = { hash: digest, lastCheckedAt: now, lastChangedAt: now, lastSnapshot: snapshotFile };

        changesCollector.push({ title, url, content: normalized });
      } else {
        state.urls[url] = { ...previous, lastCheckedAt: now };
      }
    } catch (error) {
      appendLog(`${now} ERROR [${title}] ${url} ${error && error.message}`);
      try { appendEvent({ timestamp: now, type: 'ERROR', title, url, message: error && error.message }); } catch (e) {}
    }
  }
  return changedCount;
}

async function main() {
  if (!fs.existsSync(configPath)) throw new Error('Missing config.json. Copy config.example.json to config.json first.');
  const config = readConfig(configPath);
  const state = loadState();
  // Migrate any existing raw-HTML snapshots in state to normalized text snapshots
  try {
    for (const url of Object.keys(state.urls || {})) {
      try {
        const info = state.urls[url] || {};
        const prevSnap = info.lastSnapshot;
        if (!prevSnap) continue;
        if (typeof prevSnap === 'string' && prevSnap.toLowerCase().endsWith('.normalized.txt')) continue;
        if (!fs.existsSync(prevSnap)) continue;
        // read raw html, normalize, write sibling normalized file
        try {
          const raw = fs.readFileSync(prevSnap, 'utf-8');
          const normalizedPrev = normalizeHtmlToText(raw);
          const dir = path.dirname(prevSnap);
          const base = path.basename(prevSnap).replace(/\.html$/i, '.normalized.txt');
          const newPath = path.join(dir, base);
          fs.writeFileSync(newPath, normalizedPrev + '\n', 'utf-8');
          // update state hash to normalized hash and point to new snapshot
          state.urls[url] = { ...(state.urls[url] || {}), hash: hashContent(normalizedPrev), lastSnapshot: newPath };
          appendLog(`${new Date().toISOString()} MIGRATED [${base}] ${url} -> normalized snapshot`);
          try { appendEvent({ timestamp: new Date().toISOString(), type: 'MIGRATED', title: title, url, snapshot: newPath }); } catch (e) {}
        } catch (e) {}
      } catch (e) {}
    }
  } catch (e) {}
  // migrate existing changes.log into structured events.json (and normalize paths)
  try { migrateChangesLogToEvents(); } catch (e) {}
  // normalize any existing events.json entries to use repo-relative paths
  try { normalizeEventsJson(); } catch (e) {}
  try { cleanupRemovedUrls(state, config); saveState(state); } catch (e) {}

  // Redirect selected console outputs to debug log as well (preserve originals)
  try {
    const util = await import('node:util');
    const origError = console.error.bind(console);
    const origDebug = console.debug ? console.debug.bind(console) : null;
    console.error = function(...args) {
      try { appendDebug(`[ERROR] ${new Date().toISOString()} ${util.format(...args)}`); } catch (e) {}
      origError(...args);
    };
    console.debug = function(...args) {
      try { appendDebug(`[DEBUG] ${new Date().toISOString()} ${util.format(...args)}`); } catch (e) {}
      if (origDebug) origDebug(...args); else origError(...args);
    };
  } catch (e) {}
  try { publishAllFromConfig(config); } catch (e) {}
  console.error('[DEBUG] config loaded, URLs:', config.urls.length);
  console.error('[DEBUG] intervalMinutes:', config.intervalMinutes);
  console.error('[DEBUG] userAgent:', config.userAgent);

  const runCheck = async () => {
    const currentConfig = readConfig(configPath);
    console.error('[DEBUG] Running check...');
    const changes = [];
    const changed = await checkOnce(currentConfig, state, undefined, changes);
    saveState(state);
    try { cleanupRemovedUrls(state, currentConfig); saveState(state); } catch (e) {}
    try { publishAllFromConfig(currentConfig); } catch (e) {}
    if (changes.length > 0) {
      try {
        await notifyTelegramBatch(changes);
      } catch (e) {
        console.error('[DEBUG] Telegram batch failed:', e && e.message);
      }
    }

    console.error('[DEBUG] Check complete, changed:', changed+ '\n');
    return currentConfig;
  };

  if (runOnce) {
    console.error('[DEBUG] Running once and exiting');
    await runCheck();
    process.exit(0);
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
  try { appendEvent({ timestamp: now, type: 'FATAL', message: error && error.message }); } catch (e) {}
  console.error(error.message);
  process.exitCode = 1;
});
