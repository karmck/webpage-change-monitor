import fs from 'node:fs';
import { readJson } from './utils.js';

function validateConfig(config) {
  if (!config || !Array.isArray(config.urls) || config.urls.length === 0) {
    throw new Error('config.json must include a non-empty urls array');
  }
  const intervalMinutes = Number(config.intervalMinutes ?? 5);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    throw new Error('intervalMinutes must be a number >= 1');
  }
  const urls = config.urls.map(entry => {
    if (typeof entry === 'string') return { url: entry, title: entry };
    if (!entry.url) throw new Error("Each url entry must have a 'url' field");
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
    userAgent: config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    urls
  };
}

function readConfig(path) {
  return validateConfig(readJson(path));
}

export { validateConfig, readConfig };
