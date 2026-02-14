import fs from 'node:fs';
import path from 'node:path';
import { rootDir, publicDir, configPath, statePath } from './utils.js';
import { fileHash, filesAreEqual } from './differ.js';
import { writeJson } from './utils.js';

function writeIndexJson(dir, key, list) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const out = {};
    out[key] = list;
    const dest = path.join(dir, 'index.json');
    const content = JSON.stringify(out, null, 2) + '\n';
    try {
      if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf-8') === content) return;
    } catch (e) {}
    fs.writeFileSync(dest, content, 'utf-8');
  } catch (e) {}
}

function diffPathForUrl(title) {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const diffDir = path.join(publicDir, 'logs', sanitizedTitle);
  return path.join(diffDir, `diff_${sanitizedTitle}_${ts}.txt`);
}

function snapshotPathForUrl(title) {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(publicDir, 'data', sanitizedTitle);
  return path.join(snapshotDir, `${sanitizedTitle}_${ts}.normalized.txt`);
}

function snapshotRawPathForUrl(title) {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(publicDir, 'data', sanitizedTitle);
  return path.join(snapshotDir, `${sanitizedTitle}_${ts}.html`);
}

function writeSnapshot(content, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function publishConfig() {
  try {
    fs.mkdirSync(publicDir, { recursive: true });
    const dest = path.join(publicDir, 'config.json');
    fs.copyFileSync(configPath, dest);
  } catch (e) {}
}

function publishTitleAssets(title) {
  try {
    const sanitized = title.replace(/[^a-zA-Z0-9]/g, '_');
    const dstSnapDir = path.join(publicDir, 'data', sanitized);
    if (fs.existsSync(dstSnapDir)) {
      fs.mkdirSync(dstSnapDir, { recursive: true });
      const files = fs.readdirSync(dstSnapDir).filter(f => f.toLowerCase().endsWith('.normalized.txt'));
      const snapObjs = [];
      files.forEach(f => {
        const dst = path.join(dstSnapDir, f);
        try { const mtime = fs.statSync(dst).mtime; snapObjs.push({ name: f, path: dst, mtime }); } catch (e) { snapObjs.push({ name: f, path: dst, mtime: new Date(0) }); }
      });
      snapObjs.sort((a, b) => b.mtime - a.mtime);
      for (let i = 3; i < snapObjs.length; i++) try { fs.unlinkSync(snapObjs[i].path); } catch (e) {}
      const snaps = snapObjs.slice(0, 3).map(s => s.name);
      writeIndexJson(dstSnapDir, 'snapshots', snaps);
    }

    const dstDiffDir = path.join(publicDir, 'logs', sanitized);
    if (fs.existsSync(dstDiffDir)) {
      fs.mkdirSync(dstDiffDir, { recursive: true });
      const files = fs.readdirSync(dstDiffDir).filter(f => f.startsWith('diff_') && f.endsWith('.txt'));
      const diffObjs = [];
      files.forEach(f => {
        const dst = path.join(dstDiffDir, f);
        try { const mtime = fs.statSync(dst).mtime; diffObjs.push({ name: f, path: dst, mtime }); } catch (e) { diffObjs.push({ name: f, path: dst, mtime: new Date(0) }); }
      });
      diffObjs.sort((a, b) => b.mtime - a.mtime);
      for (let i = 3; i < diffObjs.length; i++) try { fs.unlinkSync(diffObjs[i].path); } catch (e) {}
      const diffs = diffObjs.slice(0, 3).map(d => d.name);
      writeIndexJson(dstDiffDir, 'diffs', diffs);
    }
  } catch (e) {}
}

function publishAllFromConfig(cfg) {
  try {
    publishConfig();
    try {
      if (fs.existsSync(statePath)) {
        const dstStateDir = path.join(publicDir, 'data');
        fs.mkdirSync(dstStateDir, { recursive: true });
        const dest = path.join(dstStateDir, 'state.json');
        if (!filesAreEqual(statePath, dest)) fs.copyFileSync(statePath, dest);
      }
    } catch (e) {}
    try {
      const changesLog = path.join(rootDir, 'logs', 'changes.log');
      if (fs.existsSync(changesLog)) {
        const dstLogDir = path.join(publicDir, 'logs');
        fs.mkdirSync(dstLogDir, { recursive: true });
        const dest = path.join(dstLogDir, 'changes.log');
        if (!filesAreEqual(changesLog, dest)) fs.copyFileSync(changesLog, dest);
      }
    } catch (e) {}
    if (!cfg || !Array.isArray(cfg.urls)) return;
    for (const entry of cfg.urls) {
      const title = typeof entry === 'string' ? entry : (entry.title ?? entry.url);
      publishTitleAssets(title);
    }
  } catch (e) {}
}

export { writeIndexJson, diffPathForUrl, snapshotPathForUrl, snapshotRawPathForUrl, writeSnapshot, publishConfig, publishTitleAssets, publishAllFromConfig };
