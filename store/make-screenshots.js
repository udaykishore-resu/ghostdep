/* Regenerates the 1280x800 store screenshots: the real extension running in Chromium on store/demo-page.html.
   Lookups are live, so the SHAs / verdicts in the pictures are whatever is true on the day you run it. */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EXT = path.resolve(__dirname, '..', 'extension');
const OUT = __dirname;

async function launch(ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
  const opts = { channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext] };
  if (process.env.HTTPS_PROXY) opts.proxy = { server: process.env.HTTPS_PROXY };
  const ctx = await chromium.launchPersistentContext(dir, opts);
  if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  return ctx;
}
const clickIn = (page, tag, sel, re) => page.evaluate(([t, s, r]) => {
  const root = document.querySelector(t).shadowRoot;
  const el = [...root.querySelectorAll(s)].find((e) => !r || new RegExp(r).test(e.textContent));
  if (el) el.click();
  return !!el;
}, [tag, sel, re || '']);

(async () => {
  // GhostDep
  const ctx = await launch(EXT);
  const html = fs.readFileSync(path.join(__dirname, 'demo-page.html'), 'utf8');
  await ctx.route('https://chatgpt.com/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  const page = await ctx.newPage();
  await page.goto('https://chatgpt.com/c/demo');
  await page.waitForFunction(() => document.querySelectorAll('[data-ghostdep]').length >= 3, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const open = await page.evaluate(() => !!document.querySelector('ghostdep-panel').shadowRoot.querySelector('.card'));
  if (!open) await clickIn(page, 'ghostdep-panel', '.pill');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'ghostdep-screenshot-1.png') });
  console.log('ghostdep labels:', await page.evaluate(() => [...document.querySelectorAll('[data-ghostdep]')].map((e) => e.getAttribute('data-ghostdep-label'))));
  await clickIn(page, 'ghostdep-panel', '.btn', 'Show verified');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const l = document.querySelector('ghostdep-panel').shadowRoot.querySelector('.list'); if (l) l.scrollTop = l.scrollHeight; });
  await page.screenshot({ path: path.join(OUT, 'ghostdep-screenshot-2.png') });
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
