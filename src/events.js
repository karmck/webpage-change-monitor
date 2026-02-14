import fs from 'node:fs';
import path from 'node:path';
import { logPath, rootDir, publicDir } from './utils.js';

const eventsJsonPath = path.join(publicDir, 'logs', 'events.json');
const CHUNK_LIMIT = 200;

function trimLogFile() {
  if (!fs.existsSync(logPath)) return;
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n');
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filtered = lines.filter(line => {
    const ts = line.slice(0, line.indexOf(' '));
    return ts && new Date(ts) >= cutoff;
  });
  if (filtered.length < lines.length) {
    fs.writeFileSync(logPath, filtered.join('\n') + '\n', 'utf-8');
  }
}

function appendLog(line) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line + '\n', 'utf-8');
  trimLogFile();
}

function _makeRelative(p) {
  if (!p || typeof p !== 'string') return p;
  try {
    // If path contains the developer's absolute workspace prefix, strip it explicitly
    const devPrefix = '/home/kari/Projects/webpage-change-monitor/';
    if (p.startsWith(devPrefix)) return p.slice(devPrefix.length).replace(/^\/*/, '');
    if (path.isAbsolute(p)) return path.relative(rootDir, p);
    return p;
  } catch (e) { return p; }
}

function appendEvent(ev) {
  try {
    const dir = path.dirname(eventsJsonPath);
    fs.mkdirSync(dir, { recursive: true });
    let arr = [];
    if (fs.existsSync(eventsJsonPath)) {
      try { arr = JSON.parse(fs.readFileSync(eventsJsonPath, 'utf-8')); } catch (e) { arr = []; }
    }
    // normalize paths to be relative
    const copy = { ...ev };
    if (copy.snapshot) copy.snapshot = _makeRelative(copy.snapshot);
    if (copy.rawSnapshot) copy.rawSnapshot = _makeRelative(copy.rawSnapshot);
    if (copy.current) copy.current = _makeRelative(copy.current);
    if (copy.previous) copy.previous = _makeRelative(copy.previous);
    if (copy.diff) copy.diff = _makeRelative(copy.diff);
    if (copy.logPath) copy.logPath = _makeRelative(copy.logPath);
    arr.push(copy);
    // keep last CHUNK_LIMIT events
    if (arr.length > CHUNK_LIMIT) arr = arr.slice(arr.length - CHUNK_LIMIT);
    fs.writeFileSync(eventsJsonPath, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
  } catch (e) {}
}

const debugLogPath = path.join(publicDir, 'logs', 'debug.log');

function appendDebug(line) {
  try {
    fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
    fs.appendFileSync(debugLogPath, (line || '') + '\n', 'utf-8');
  } catch (e) {}
}

function migrateChangesLogToEvents() {
  try {
    if (!fs.existsSync(logPath)) return;
    const text = fs.readFileSync(logPath, 'utf-8').trim();
    if (!text) return;
    const lines = text.split('\n');
    const out = [];
    for (const line of lines) {
      // parse: TIMESTAMP TYPE [TITLE] URL rest
      const m = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+(\S+)\s*(.*)$/);
      if (!m) continue;
      const [, timestamp, type, title, url, rest] = m;
      const ev = { timestamp, type, title, url };
      // parse key=value tokens in rest
      const kvRe = /(\w+)=([^\s]+)/g;
      let kv;
      while ((kv = kvRe.exec(rest)) !== null) {
        const k = kv[1];
        let v = kv[2];
        // strip surrounding quotes
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (['snapshot','diff','previous','current','logPath'].includes(k)) ev[k] = _makeRelative(v);
        else ev[k] = v;
      }
      // for error lines that contain message after URL
      if (type === 'ERROR') {
        const msg = rest.trim();
        if (msg) ev.message = msg;
      }
      out.push(ev);
    }
    if (out.length) {
      const dir = path.dirname(eventsJsonPath);
      fs.mkdirSync(dir, { recursive: true });
      // limit to last CHUNK_LIMIT
      const trimmed = out.slice(-CHUNK_LIMIT);
      fs.writeFileSync(eventsJsonPath, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');
    }
  } catch (e) {}
}

function normalizeEventsJson() {
  try {
    if (!fs.existsSync(eventsJsonPath)) return;
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(eventsJsonPath, 'utf-8')); } catch (e) { return; }
    if (!Array.isArray(arr)) return;
    const out = arr.map(ev => {
      const copy = { ...ev };
      if (copy.snapshot) copy.snapshot = _makeRelative(copy.snapshot);
      if (copy.diff) copy.diff = _makeRelative(copy.diff);
      if (copy.previous) copy.previous = _makeRelative(copy.previous);
      if (copy.rawSnapshot) copy.rawSnapshot = _makeRelative(copy.rawSnapshot);
      if (copy.logPath) copy.logPath = _makeRelative(copy.logPath);
      return copy;
    });
    fs.writeFileSync(eventsJsonPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  } catch (e) {}
}

function consoleLog(line) {
  console.log(line);
}

export { appendLog, trimLogFile, consoleLog, appendEvent, migrateChangesLogToEvents, normalizeEventsJson, appendDebug };
