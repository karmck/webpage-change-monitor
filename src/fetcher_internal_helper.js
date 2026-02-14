let _browser = null;

export function promiseWithTimeout(p, ms, msg) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error(msg || 'timeout')); } }, ms);
    p.then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } }).catch(e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
  });
}

export async function ensureBrowser() {
  if (_browser) return _browser;
  try {
    const playwright = await import('playwright');
    _browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    console.error('[DEBUG] Playwright browser launched');
    return _browser;
  } catch (e) {
    console.error('[DEBUG] Playwright not available:', e && e.message);
    throw e;
  }
}
