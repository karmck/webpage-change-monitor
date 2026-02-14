import fs from 'node:fs';
import path from 'node:path';
import { statePath, rootDir, publicDir } from './utils.js';
import { appendLog } from './events.js';

function loadState() {
  if (!fs.existsSync(statePath)) return { urls: {} };
  return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function cleanupRemovedUrls(state, cfg) {
  if (!state || !state.urls) return;
  const configured = new Set((cfg && Array.isArray(cfg.urls) ? cfg.urls.map(e => (typeof e === 'string' ? e : e.url)) : []));
  const now = new Date().toISOString();
  for (const url of Object.keys(state.urls)) {
    if (configured.has(url)) continue;
    try {
      const info = state.urls[url] || {};
      let sanitized = null;
      if (info.lastSnapshot) {
        try { sanitized = path.basename(path.dirname(info.lastSnapshot)); } catch (e) { sanitized = null; }
      }
      if (!sanitized) sanitized = (url || '').replace(/[^a-zA-Z0-9]/g, '_');
      try { fs.rmSync(path.join(publicDir, 'data', sanitized), { recursive: true, force: true }); } catch (e) {}
      try { fs.rmSync(path.join(publicDir, 'logs', sanitized), { recursive: true, force: true }); } catch (e) {}
      appendLog(`${now} REMOVED [${sanitized}] ${url}`);
    } catch (e) {}
    try { delete state.urls[url]; } catch (e) {}
  }
}

export { loadState, saveState, cleanupRemovedUrls };
