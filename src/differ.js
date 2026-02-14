import crypto from 'node:crypto';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function fileHash(filePath) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); } catch (e) { return null; }
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

function simpleUnifiedDiff(oldStr, newStr) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const out = [];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const a = i < oldLines.length ? oldLines[i] : undefined;
    const b = j < newLines.length ? newLines[j] : undefined;
    if (a === b) { i++; j++; }
    else if (a === undefined) { out.push('+' + b); j++; }
    else if (b === undefined) { out.push('-' + a); i++; }
    else { out.push('-' + a); out.push('+' + b); i++; j++; }
  }
  return out;
}

function collapseWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// Produce a visible-text normalized representation preserving block breaks
function normalizeHtmlToText(html) {
  const withoutComments = (html || '').replace(/<!--([\s\S]*?)-->/g, '');
  const dom = new JSDOM(withoutComments);
  const doc = dom.window.document;

  // remove script/style
  doc.querySelectorAll('script, style').forEach(n => n.remove());

  // handle selects: replace with selected option text
  doc.querySelectorAll('select').forEach(sel => {
    try {
      const options = Array.from(sel.querySelectorAll('option'));
      const chosen = options.find(o => o.hasAttribute('selected')) || options[0];
      const txt = chosen ? chosen.textContent : '';
      sel.parentNode.replaceChild(doc.createTextNode(txt), sel);
    } catch (e) {}
  });

  // inputs -> value or placeholder
  doc.querySelectorAll('input').forEach(inp => {
    try {
      const t = (inp.getAttribute('value') || inp.getAttribute('placeholder') || '');
      if (inp.type && (inp.type.toLowerCase() === 'submit' || inp.type.toLowerCase() === 'button')) {
        inp.parentNode.replaceChild(doc.createTextNode(t), inp);
      } else {
        inp.parentNode.replaceChild(doc.createTextNode(t), inp);
      }
    } catch (e) {}
  });

  const container = doc.body || doc.documentElement;

  const BLOCK_TAGS = new Set([
    'p','div','section','article','header','footer','aside','nav',
    'ul','ol','li','table','thead','tbody','tfoot','tr','th','td',
    'h1','h2','h3','h4','h5','h6','figure','figcaption','form','label','blockquote'
  ]);

  function nodeToText(node) {
    if (!node) return '';
    const Node = dom.window.Node;
    if (node.nodeType === Node.TEXT_NODE) return collapseWhitespace(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'br') return '\n';
    let out = '';
    if (BLOCK_TAGS.has(tag)) out += '\n';
    for (const child of Array.from(node.childNodes)) out += nodeToText(child);
    if (BLOCK_TAGS.has(tag)) out += '\n';
    return out;
  }

  const raw = nodeToText(container || doc.documentElement || doc);
  const lines = raw.split(/\n+/).map(l => collapseWhitespace(l)).filter(Boolean);
  return lines.join('\n');
}

export { hashContent, fileHash, filesAreEqual, simpleUnifiedDiff, normalizeHtmlToText };
