import crypto from 'node:crypto';
import fs from 'node:fs';

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

export { hashContent, fileHash, filesAreEqual, simpleUnifiedDiff };
