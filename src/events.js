import fs from 'node:fs';
import path from 'node:path';
import { logPath } from './utils.js';

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

function consoleLog(line) {
  console.log(line);
}

export { appendLog, trimLogFile, consoleLog };
