import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

// Compute project root (same approach as utils.js)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'public', 'data');

function collapseWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeHtmlToText(html) {
  // strip HTML comments before parsing to avoid relying on DOM Comment APIs
  const withoutComments = html.replace(/<!--([\s\S]*?)-->/g, '');
  const dom = new JSDOM(withoutComments);
  const doc = dom.window.document;

  // remove script/style elements
  doc.querySelectorAll('script, style').forEach(n => n.remove());

  // Replace selects with their selected option's text (or first option)
  doc.querySelectorAll('select').forEach(sel => {
    try {
      const options = Array.from(sel.querySelectorAll('option'));
      let chosen = options.find(o => o.hasAttribute('selected')) || options[0];
      const txt = chosen ? chosen.textContent : '';
      const tn = doc.createTextNode(txt);
      sel.parentNode.replaceChild(tn, sel);
    } catch (e) {}
  });

  // Replace input[type=submit|button] with their value
  doc.querySelectorAll('input[type="submit"], input[type="button"]').forEach(inp => {
    try {
      const v = inp.getAttribute('value') || '';
      const tn = doc.createTextNode(v);
      inp.parentNode.replaceChild(tn, inp);
    } catch (e) {}
  });

  // Replace other inputs with their value or placeholder
  doc.querySelectorAll('input').forEach(inp => {
    try {
      if (inp.type && (inp.type.toLowerCase() === 'submit' || inp.type.toLowerCase() === 'button')) return;
      const v = inp.getAttribute('value') || inp.getAttribute('placeholder') || '';
      const tn = doc.createTextNode(v);
      inp.parentNode.replaceChild(tn, inp);
    } catch (e) {}
  });

  const container = doc.body || doc.documentElement;

  // Produce text while preserving block-level breaks.
  const BLOCK_TAGS = new Set([
    'p','div','section','article','header','footer','aside','nav',
    'ul','ol','li','table','thead','tbody','tfoot','tr','th','td',
    'h1','h2','h3','h4','h5','h6','figure','figcaption','form','label','blockquote'
  ]);

  function nodeToText(node) {
    if (!node) return '';
    const Node = dom.window.Node;
    if (node.nodeType === Node.TEXT_NODE) {
      return collapseWhitespace(node.nodeValue || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'br') return '\n';
    let out = '';
    if (BLOCK_TAGS.has(tag)) out += '\n';
    for (const child of Array.from(node.childNodes)) {
      out += nodeToText(child);
    }
    if (BLOCK_TAGS.has(tag)) out += '\n';
    return out;
  }

  let raw = nodeToText(container || doc.documentElement || doc);

  // Normalize: collapse multiple blank lines, trim each line's whitespace
  const lines = raw.split(/\n+/).map(l => collapseWhitespace(l)).filter(Boolean);
  return lines.join('\n');
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

function processAllSnapshots() {
  if (!fs.existsSync(dataDir)) {
    console.error('No snapshots directory found at', dataDir);
    return 1;
  }

  const titles = fs.readdirSync(dataDir).filter(f => fs.statSync(path.join(dataDir, f)).isDirectory());
  if (!titles.length) {
    console.error('No title subdirectories in', dataDir);
    return 1;
  }

  let processed = 0;
  for (const title of titles) {
    const dir = path.join(dataDir, title);
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.html'));
    if (!files.length) continue;
    const outDir = dir; // write normalized files alongside snapshots
    for (const f of files) {
      try {
        const p = path.join(dir, f);
        const html = fs.readFileSync(p, 'utf-8');
        const txt = normalizeHtmlToText(html);
        const outName = f.replace(/\.html$/i, '.normalized.txt');
        const outPath = path.join(outDir, outName);
        fs.writeFileSync(outPath, txt + '\n', 'utf-8');
        processed += 1;
        console.log('WROTE', outPath);
      } catch (e) {
        console.error('FAILED', title, f, e && e.message);
      }
    }
  }

  console.log('Done. Processed', processed, 'snapshots.');
  return 0;
}

if (process.argv.includes('--help')) {
  console.log('Usage: node src/normalize_snapshots_text.js');
  process.exit(0);
}

const code = processAllSnapshots();
process.exit(code);
