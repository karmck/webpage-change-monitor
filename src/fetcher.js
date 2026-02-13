import { JSDOM } from 'jsdom';
import { promiseWithTimeout, ensureBrowser } from './fetcher_internal_helper.js';

async function extractBySelector(html, selector) {
  if (!selector) return html;
  const dom = new JSDOM(html);
  const targets = dom.window.document.querySelectorAll(selector);
  if (!targets.length) return '';
  return Array.from(targets).map(el => el.outerHTML).join('\n');
}

async function fetchContent(url, userAgent, debugTitle) {
  const ts = Date.now();
  const u = new URL(url);
  u.searchParams.set('_t', ts.toString());
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(u.toString(), { headers: { 'user-agent': userAgent }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      clearTimeout(timeout);
      return await response.text();
    } finally { clearTimeout(timeout); }
  } catch (err) {
    console.error(`[DEBUG] fetch failed/timeout for ${debugTitle}, falling back to renderer: ${err && err.message}`);
    return await fetchRenderedContent(url, userAgent, debugTitle, undefined, 'fetch-failed');
  }
}

async function fetchRenderedContent(url, userAgent, debugTitle, selector, reason = 'unknown') {
  const browser = await ensureBrowser();
  let context;
  try {
    context = await promiseWithTimeout(browser.newContext({ userAgent }), 15000, 'newContext timed out');
    const page = await promiseWithTimeout(context.newPage(), 10000, 'newPage timed out');
    page.on('console', () => {});
    page.on('pageerror', () => {});
    page.on('requestfailed', () => {});
    page.on('response', () => {});
    if (selector) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        const pollInterval = 500;
        const pollTimeout = 10000;
        const start = Date.now();
        let ready = false;
        while (Date.now() - start < pollTimeout) {
          try {
            const ok = await page.evaluate((sel) => {
              const els = Array.from(document.querySelectorAll(sel));
              if (!els.length) return false;
              return els.some(e => {
                const txt = (e.innerText || e.textContent || '').trim();
                const html = (e.innerHTML || '').trim();
                return (txt && txt.length > 5) || (html && html.length > 20);
              });
            }, selector);
            if (ok) { ready = true; break; }
          } catch (e) {}
          await page.waitForTimeout(pollInterval);
        }
        const html = await page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map(e => e.outerHTML).join('\n'), selector);
        try { await context.close(); } catch (e) {}
        return html;
      } catch (e) {}
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    const content = await page.content();
    try { await context.close(); } catch (e) {}
    return content;
  } catch (e) {
    console.error(`[DEBUG] Playwright error for [${debugTitle}]: ${e && e.message}`);
    try { if (context) await context.close(); } catch (er) {}
    throw e;
  }
}

export { extractBySelector, fetchContent, fetchRenderedContent };
