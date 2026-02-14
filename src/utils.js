import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.env.WEBPAGE_MONITOR_CONFIG ?? path.join(rootDir, 'config.json');
const publicDir = path.join(rootDir, 'public');
const statePath = path.join(publicDir, 'data', 'state.json');
const logPath = path.join(publicDir, 'logs', 'changes.log');
const RENDERER_BACKOFF_MINUTES = 60;

const args = new Set(process.argv.slice(2));
const runOnce = args.has('--once');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export { rootDir, configPath, statePath, logPath, publicDir, RENDERER_BACKOFF_MINUTES, runOnce, readJson, writeJson };
