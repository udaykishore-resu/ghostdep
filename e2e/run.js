/* End-to-end check: loads the unpacked extension in Chromium and serves fixture pages at the real URLs
   the content script matches. Lookups from the service workers go to the real GitHub / registry endpoints. */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
};

async function launch(ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-e2e-'));
  const opts = {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1180, height: 900 },
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext],
  };
  if (process.env.HTTPS_PROXY) opts.proxy = { server: process.env.HTTPS_PROXY };
  const ctx = await chromium.launchPersistentContext(dir, opts);
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  return { ctx, sw };
}

const panelText = (page, tag) =>
  page.evaluate((t) => {
    const h = document.querySelector(t);
    return h && h.shadowRoot ? h.shadowRoot.textContent : '';
  }, tag);

async function ghostdep() {
  console.log('\n=== GhostDep ===');
  const { ctx, sw } = await launch(EXT);
  try {
  check('service worker registered', !!sw, sw && sw.url());
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/chat.html'), 'utf8');
  await ctx.route('https://chatgpt.com/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('https://chatgpt.com/c/demo');
  await page.waitForFunction(() => document.querySelectorAll('[data-ghostdep]').length >= 8, null, { timeout: 60000 }).catch(() => {});

  const get = (id) => page.evaluate((i) => {
    const e = document.getElementById(i);
    return e ? { level: e.getAttribute('data-ghostdep'), label: e.getAttribute('data-ghostdep-label') } : null;
  }, id);

  const pip = await get('b-pip');
  check('PyPI: invented name flagged, real ones not named', pip.level === 'danger' && /fastapi-turbo-zzq9x — does not exist on PyPI/.test(pip.label) && !/cowsay|requests/.test(pip.label), pip);
  const npm = await get('b-npm');
  check('npm: missing scoped package flagged', npm.level === 'danger' && /@zz-nope-scope-q9x\/missing-pkg — does not exist on npm/.test(npm.label), npm);
  const hdr = await get('b-hdr');
  check('block with a language label and Copy button inside the <pre> still parses', hdr.level === 'danger' && /hdr-case-zzq9x/.test(hdr.label), hdr);
  const tscFlag = await get('b-tsc');
  check('npx tsc is flagged as a command from another package', tscFlag.level === 'warn' && /tsc — command, not a package \(did you mean typescript\?\)/.test(tscFlag.label), tscFlag);
  const dep = await get('b-dep');
  check('live npm lookup: deprecated package is warned', dep.level === 'warn' && /request/.test(dep.label), dep);
  const cargo = await get('b-cargo');
  check('crates.io: missing crate flagged', cargo.level === 'danger' && /zz-ghostdep-missing-crate-q9x — does not exist on crates\.io/.test(cargo.label), cargo);
  const sk = await get('i-sklearn');
  check('inline code: import-name confusion warned with the real package', sk.level === 'warn' && /scikit-learn/.test(sk.label), sk);
  check('unrelated inline code untouched', (await get('i-none')).level === null);
  const req = await get('b-req');
  check('requirements block: typo of a popular name flagged', req && req.level !== null && /requets/.test(req.label || ''), req);

  await page.evaluate(() => document.querySelector('ghostdep-panel').shadowRoot.querySelector('.pill').click()).catch(() => {});
  let state = await page.evaluate(() => {
    const r = document.querySelector('ghostdep-panel').shadowRoot;
    return { open: !!r.querySelector('.card'), pill: r.querySelector('.pill').textContent, rows: [...r.querySelectorAll('.row')].map((e) => e.textContent) };
  });
  if (!state.open) {
    await page.evaluate(() => document.querySelector('ghostdep-panel').shadowRoot.querySelector('.pill').click());
    state = await page.evaluate(() => {
      const r = document.querySelector('ghostdep-panel').shadowRoot;
      return { open: !!r.querySelector('.card'), pill: r.querySelector('.pill').textContent, rows: [...r.querySelectorAll('.row')].map((e) => e.textContent) };
    });
  }
  check('panel open with flagged rows only', state.open && state.rows.length >= 5 && !state.rows.some((r) => /^(requests|express|serde|anyhow) /.test(r)), state.pill);
  check('text the user typed (textarea / contenteditable) is never looked up', !state.rows.some((r) => /typed-by|also-typed/.test(r)));
  const requets = state.rows.find((r) => r.startsWith('requets'));
  check('typo row suggests the real package', requets && /requests/.test(requets), requets);
  await page.screenshot({ path: path.join(OUT, 'ghostdep.png'), fullPage: true });

  // Real, established, not on the built-in list: must come back ok from the live registry.
  await page.evaluate(() => {
    const r = document.querySelector('ghostdep-panel').shadowRoot;
    [...r.querySelectorAll('.btn')].find((b) => /Show verified/.test(b.textContent)).click();
  });
  const all = await page.evaluate(() => [...document.querySelector('ghostdep-panel').shadowRoot.querySelectorAll('.row')].map((e) => e.textContent));
  const cowsay = all.find((r) => r.startsWith('cowsay'));
  check('live PyPI lookup: cowsay exists with a first-published age', cowsay && /exists on PyPI/.test(cowsay) && /first published \d+ years ago/.test(cowsay), cowsay);
  const isodd = all.find((r) => r.startsWith('is-odd'));
  check('live npm lookup: is-odd exists', isodd && /exists on npm/.test(isodd), isodd);
  check('npm create maps to create-vite', all.some((r) => r.startsWith('create-vite')));

  const depRow = all.find((r) => r.startsWith('request '));
  check('deprecation reason quotes the registry message', depRow && /Marked deprecated on npm/.test(depRow), depRow && depRow.slice(0, 160));

  // Once the page also installs typescript, the `npx tsc` warning must go away.
  await page.evaluate(() => {
    const pre = document.createElement('pre');
    pre.id = 'b-ts';
    const code = document.createElement('code');
    code.textContent = 'npm install -D typescript';
    pre.appendChild(code);
    document.getElementById('thread').appendChild(pre);
  });
  await page.waitForFunction(() => !document.getElementById('b-tsc').hasAttribute('data-ghostdep'), null, { timeout: 15000 }).catch(() => {});
  check('npx tsc warning is dropped when the page installs typescript', (await get('b-tsc')).level === null);

  // Streaming: partial names must not be looked up.
  await page.evaluate(() => window.streamBlock());
  await page.waitForFunction(() => document.getElementById('b-stream') && document.getElementById('b-stream').hasAttribute('data-ghostdep'), null, { timeout: 30000 }).catch(() => {});
  const stream = await get('b-stream');
  check('streamed block flagged once complete', stream.level === 'danger' && /streamed-final-name-zzq9x/.test(stream.label), stream);
  const cached = await sw.evaluate(async () => Object.keys(await chrome.storage.session.get(null)));
  const partial = cached.filter((k) => /pkg:pypi:stream/.test(k));
  check('no partial names were sent to the registry while streaming', partial.length === 1 && partial[0] === 'pkg:pypi:streamed-final-name-zzq9x', partial);
  check('well-known names never hit the network', !cached.some((k) => /:(requests|express|serde|anyhow|flask)$/.test(k)), cached.length + ' cached lookups');
  check('no page errors', errors.length === 0, errors);

  // Popup page loads and its script runs without errors.
  const extId = new URL(sw.url()).host;
  const pop = await ctx.newPage();
  const popErrors = [];
  pop.on('pageerror', (e) => popErrors.push(String(e)));
  await pop.goto('chrome-extension://' + extId + '/popup.html');
  check('popup renders', (await pop.locator('#scan').count()) === 1 && popErrors.length === 0, popErrors);
  await pop.close();

  const other = await ctx.newPage();
  await other.goto('https://example.org/post');
  await other.waitForTimeout(2500);
  check('not active on unlisted sites by default', (await other.evaluate(() => document.querySelectorAll('[data-ghostdep]').length)) === 0);
  } finally {
    await ctx.close();
  }
}

// The activeTab grant needs a real toolbar click, which automation cannot perform. So the injection
// code path is exercised on a copy of the extension that is granted example.org up front.
async function ghostdepOnDemand() {
  console.log('\n=== GhostDep on-demand injection (copy of the extension with example.org pre-granted) ===');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostdep-copy-'));
  fs.cpSync(EXT, copy, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
  mf.host_permissions.push('https://example.org/*');
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(mf, null, 2));
  const { ctx, sw } = await launch(copy);
  try {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures/chat.html'), 'utf8');
    await ctx.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
    const page = await ctx.newPage();
    await page.goto('https://example.org/post');
    const inject = () =>
      sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://example.org/*' });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/popular.js', 'lib/core.js', 'content.js'] });
      });
    await inject();
    await page.waitForFunction(() => document.querySelectorAll('[data-ghostdep]').length >= 8, null, { timeout: 60000 }).catch(() => {});
    check('same files the popup injects produce flags on an unlisted site', (await page.evaluate(() => document.querySelectorAll('[data-ghostdep]').length)) >= 5);
    await inject(); // second click on "Scan this page"
    await page.waitForTimeout(1500);
    check('injecting twice does not duplicate the panel', (await page.evaluate(() => document.querySelectorAll('ghostdep-panel').length)) === 1);
  } finally {
    await ctx.close();
  }
}

// GitHub's file view has no code block at all. This serves a page of the same shape at a github.com URL.
async function ghostdepFileView() {
  console.log('\n=== GhostDep on a GitHub-style file view (copy of the extension with github.com pre-granted) ===');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostdep-copy-'));
  fs.cpSync(EXT, copy, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
  mf.host_permissions.push('https://github.com/*');
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(mf, null, 2));
  const { ctx, sw } = await launch(copy);
  try {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures/github-file.html'), 'utf8');
    await ctx.route('https://github.com/acme/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('https://github.com/acme/mono/blob/main/cdktf-gcp/package.json');
    check('fixture has no <pre> or <code>, like the real file view', (await page.evaluate(() => document.querySelectorAll('pre, code').length)) === 0);
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/*' });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/popular.js', 'lib/core.js', 'content.js'] });
    });
    await page.waitForFunction(() => document.querySelector('ghostdep-panel'), null, { timeout: 60000 }).catch(() => {});
    const pill = await page.evaluate(() => { const h = document.querySelector('ghostdep-panel'); return h ? h.shadowRoot.querySelector('.pill').textContent : null; });
    check('file view is read from its read-only text area', !!pill && /to check/.test(pill) && /ok/.test(pill), pill);
    check('workspace sibling is a caution, not "high risk"', !!pill && !/high risk/.test(pill), pill);
    await page.evaluate(() => document.querySelector('ghostdep-panel').shadowRoot.querySelector('.pill').click());
    const rows = await page.evaluate(() => [...document.querySelector('ghostdep-panel').shadowRoot.querySelectorAll('.row')].map((e) => e.textContent));
    const ws = rows.find((r) => r.startsWith('@cdk-mastery/shared'));
    check('sibling row explains itself', !!ws && /workspace package/.test(ws), ws && ws.slice(0, 120));
    check('deprecated providers are listed', rows.filter((r) => /Marked deprecated on npm/.test(r)).length === 3, rows.length + ' rows');
    check('an editable text area on the same page is still ignored', !rows.some((r) => /typed-in-a-comment-box/.test(r)));
    check('no page errors', errors.length === 0, errors);
  } finally {
    await ctx.close();
  }
}

// GitHub serves raw files with a `sandbox` policy: page scripts are off and links cannot open new tabs.
// Page-side evaluate() is blocked there too, so this test looks at the page through the extension itself.
async function ghostdepSandboxedPage() {
  console.log('\n=== GhostDep on a sandboxed raw-file page (copy of the extension with the host pre-granted) ===');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostdep-copy-'));
  fs.cpSync(EXT, copy, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
  mf.host_permissions.push('https://raw.githubusercontent.com/*');
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(mf, null, 2));
  const { ctx, sw } = await launch(copy);
  try {
    const body = JSON.stringify({ name: '@acme/app', dependencies: { '@acme/shared': '*', '@cdktf/provider-google': '^16.12.1', react: '^18' } }, null, 2);
    await ctx.route('https://raw.githubusercontent.com/**', (r) =>
      r.fulfill({ contentType: 'text/plain; charset=utf-8', headers: { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }, body })
    );
    await ctx.route('https://www.npmjs.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>registry stub</title>' }));
    const page = await ctx.newPage();
    await page.goto('https://raw.githubusercontent.com/acme/app/main/package.json');
    // Runs inside the tab through the extension (the page's own script context is sandboxed off).
    const readPill = () =>
      sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://raw.githubusercontent.com/*' });
        const r = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const h = document.querySelector('ghostdep-panel');
            return h ? h.shadowRoot.querySelector('.pill').textContent : null;
          },
        });
        return r[0].result;
      });
    const clickRegistryLink = () =>
      sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://raw.githubusercontent.com/*' });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const r = document.querySelector('ghostdep-panel').shadowRoot;
            if (!r.querySelector('.card')) r.querySelector('.pill').click();
            r.querySelector('a.btn').click();
          },
        });
      });
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://raw.githubusercontent.com/*' });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/popular.js', 'lib/core.js', 'content.js'] });
    });
    let pill = null;
    for (let i = 0; i < 40 && !pill; i++) {
      await page.waitForTimeout(500);
      pill = await readPill();
    }
    check('panel appears on a sandboxed page', !!pill && /to check/.test(pill), pill);
    const opened = ctx.waitForEvent('page', { timeout: 8000 }).then((p) => p.url(), () => null);
    await clickRegistryLink();
    const url = await opened;
    check('"Open on npm" opens the registry page in a new tab despite the sandbox', url === 'https://www.npmjs.com/package/@cdktf/provider-google', url);
  } finally {
    await ctx.close();
  }
}

(async () => {
  try {
    await ghostdep();
    await ghostdepOnDemand();
    await ghostdepFileView();
    await ghostdepSandboxedPage();
  } catch (e) {
    console.error('HARNESS ERROR', e);
    process.exitCode = 2;
  }
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) process.exitCode = 1;
})();
