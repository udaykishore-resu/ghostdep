/* GhostDep content script: reads install commands out of code blocks and flags packages that are missing or suspicious. */
(() => {
  'use strict';
  if (window.__ghostdepLoaded) {
    if (typeof window.__ghostdepRescan === 'function') window.__ghostdepRescan();
    return;
  }
  window.__ghostdepLoaded = true;

  const Core = globalThis.GhostDepCore;
  const PRECHECK = /\b(?:pip3?|npm|pnpm|pnpx|yarn|bun|bunx|npx|uvx?|pipx|pipenv|poetry|pdm|rye|hatch|cargo)\b|ependencies"|[=~<>!]=/i;
  const STABLE_MS = 1500; // a block must stop changing (the model stopped streaming) before its names are looked up
  const snap = new WeakMap(); // element -> { text, t, installs }
  const results = new Map(); // "eco:name" -> verdict
  const pending = new Set();
  let current = []; // [{key, eco, name, els: []}]
  let timer = null;
  let open = false;
  let showOk = false;
  let dead = false;
  let host = null;
  let shadow = null;

  // Read-only text areas hold file contents, not typing. GitHub's file view keeps the whole file in one
  // (marked aria-readonly) and draws the visible lines as separate elements with no <pre> around them.
  const READONLY_TEXT = 'textarea[readonly], textarea[aria-readonly="true"]';

  function blocks() {
    const out = [];
    for (const el of document.querySelectorAll('pre, code, ' + READONLY_TEXT)) {
      if (el.tagName === 'CODE' && el.closest('pre')) continue; // the <pre> covers it
      if (host && host.contains(el)) continue;
      if (el.tagName !== 'TEXTAREA' && el.closest('textarea, [contenteditable="true"], [contenteditable=""]')) continue; // what the user is typing
      out.push(el);
    }
    return out;
  }

  function textOf(el) {
    if (el.tagName === 'TEXTAREA') return el.value || '';
    // Chat UIs put a language label and a "Copy" button inside the <pre>; only the <code> child is the code.
    const src = el.tagName === 'PRE' ? el.querySelector('code') || el : el;
    return src.textContent || '';
  }

  function collect() {
    const now = Date.now();
    const byKey = new Map();
    let unstable = false;
    for (const el of blocks()) {
      const text = textOf(el);
      let s = snap.get(el);
      if (!s || s.text !== text) {
        s = { text, t: now, installs: null };
        snap.set(el, s);
      }
      if (s.installs === null) {
        if (text.length < 6 || !PRECHECK.test(text)) {
          s.installs = [];
        } else if (now - s.t < STABLE_MS) {
          unstable = true;
          continue;
        } else {
          s.installs = Core.extractInstalls(text);
        }
      }
      for (const it of s.installs) {
        const key = Core.keyOf(it);
        if (!byKey.has(key)) byKey.set(key, { key, eco: it.eco, name: it.name, run: !!it.run, sibling: !!it.sibling, els: [] });
        byKey.get(key).els.push(el);
      }
    }
    // `npx tsc` is fine when the page also installs `typescript`: drop the command warning in that case.
    for (const [key, f] of byKey) {
      if (f.run && byKey.has('npm:' + Core.binAlias(f.name))) byKey.delete(key);
    }
    return { list: [...byKey.values()], unstable };
  }

  const RANK = { danger: 0, unknown: 1, warn: 2, ok: 3 };
  const SYMBOL = { danger: '✖', warn: '⚠', unknown: '?', ok: '✓' };

  function paintInline() {
    const worst = new Map(); // el -> { level, names: [] }
    for (const f of current) {
      const v = results.get(f.key);
      if (!v || v.level === 'ok') continue;
      for (const el of f.els) {
        if (el.tagName === 'TEXTAREA') continue; // no outline or generated label possible; the panel carries the result
        const w = worst.get(el) || { level: v.level, names: [] };
        if (RANK[v.level] < RANK[w.level]) w.level = v.level;
        w.names.push(f.name + ' — ' + v.title + (v.suggest ? ' (did you mean ' + v.suggest + '?)' : ''));
        worst.set(el, w);
      }
    }
    for (const [el, w] of worst) {
      const label = SYMBOL[w.level] + ' GhostDep: ' + w.names.join(' · ');
      if (el.getAttribute('data-ghostdep') !== w.level) el.setAttribute('data-ghostdep', w.level);
      if (el.getAttribute('data-ghostdep-label') !== label) el.setAttribute('data-ghostdep-label', label);
    }
    for (const el of document.querySelectorAll('[data-ghostdep]')) {
      if (!worst.has(el)) {
        el.removeAttribute('data-ghostdep');
        el.removeAttribute('data-ghostdep-label');
      }
    }
  }

  // ---------- panel (shadow DOM outside <body>; built with DOM calls only, never innerHTML) ----------

  const PANEL_CSS = `
    :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color-scheme: light dark; }
    .wrap { --bg:#ffffff; --fg:#1f2328; --mut:#59636e; --line:#d1d9e0; --ok:#1a7f37; --warn:#8a5a00; --bad:#c21f2b; --unk:#59636e; --btn:#f3f5f7;
      color: var(--fg); display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
    @media (prefers-color-scheme: dark) { .wrap { --bg:#16181d; --fg:#e8eaed; --mut:#9aa0a6; --line:#3c4043; --ok:#4ac26b; --warn:#e3b341; --bad:#ff7b72; --unk:#9aa0a6; --btn:#23262c; } }
    button, a { font: inherit; color: inherit; }
    button { cursor: pointer; }
    button:focus-visible, a:focus-visible { outline: 2px solid #4493f8; outline-offset: 2px; }
    .pill { background: var(--bg); border:1px solid var(--line); border-radius:999px; padding:6px 12px; display:flex; gap:8px; align-items:center;
      box-shadow: 0 4px 16px rgba(0,0,0,.18); font-weight:600; }
    .pill .n { font-weight:500; }
    .ok { color: var(--ok); } .warn { color: var(--warn); } .danger { color: var(--bad); } .unknown { color: var(--unk); }
    .card { background: var(--bg); border:1px solid var(--line); border-radius:10px; width:min(480px, calc(100vw - 32px)); max-height:min(60vh, 560px);
      display:flex; flex-direction:column; box-shadow: 0 8px 28px rgba(0,0,0,.25); overflow:hidden; }
    .head { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); }
    .head b { font-size:14px; }
    .list { overflow:auto; margin:0; padding:0; list-style:none; }
    .row { padding:9px 12px; border-bottom:1px solid var(--line); }
    .row:last-child { border-bottom:0; }
    .top { display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
    .name { font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap:anywhere; }
    .eco { color: var(--mut); font-weight:400; }
    .title { font-weight:600; white-space:nowrap; }
    .why { color: var(--mut); font-size:12px; margin:3px 0 0; overflow-wrap:anywhere; }
    .acts { display:flex; gap:8px; margin-top:6px; }
    .btn { background: var(--btn); border:1px solid var(--line); border-radius:6px; padding:2px 9px; text-decoration:none; font-size:12px; white-space:nowrap; flex:none; }
    .x { background:none; border:0; font-size:18px; line-height:1; padding:2px 6px; color: var(--mut); }
    .foot { padding:8px 12px; border-top:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:8px; color: var(--mut); font-size:12px; }
    .empty { padding:14px 12px; color: var(--mut); }
  `;

  // Scroll the code block into view and flash it. The flash matters on short pages, where the block is
  // already on screen and scrolling alone would look like the button did nothing.
  function reveal(target) {
    // A text area has no visible box of its own on GitHub's file view; its parent covers the code.
    const box = target.tagName === 'TEXTAREA' ? target.parentElement || target : target;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.removeAttribute('data-ghostdep-flash');
    void box.offsetWidth; // restart the animation when clicked twice
    box.setAttribute('data-ghostdep-flash', '');
    setTimeout(() => box.removeAttribute('data-ghostdep-flash'), 1700);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('ghostdep-panel');
    shadow = host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(PANEL_CSS);
    shadow.adoptedStyleSheets = [sheet];
    document.documentElement.appendChild(host);
  }

  function renderPanel() {
    const rows = current.map((f) => ({ f, v: results.get(f.key) })).filter((r) => r.v);
    if (!rows.length) {
      if (host) host.remove();
      return;
    }
    ensureHost();
    rows.sort((a, b) => RANK[a.v.level] - RANK[b.v.level] || (a.f.name < b.f.name ? -1 : 1));
    const count = { danger: 0, warn: 0, unknown: 0, ok: 0 };
    for (const r of rows) count[r.v.level]++;
    const flagged = rows.filter((r) => r.v.level !== 'ok');

    const wrap = el('div', 'wrap');
    if (open) {
      const card = el('div', 'card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'GhostDep results');
      const head = el('div', 'head');
      head.appendChild(el('b', '', 'GhostDep — packages on this page'));
      const close = el('button', 'x', '×');
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', () => {
        open = false;
        renderPanel();
      });
      head.appendChild(close);
      card.appendChild(head);

      const shown = showOk ? rows : flagged;
      if (!shown.length) {
        card.appendChild(el('div', 'empty', 'All ' + count.ok + ' package' + (count.ok === 1 ? '' : 's') + ' in install commands exist and look established.'));
      } else {
        const list = el('ul', 'list');
        for (const { f, v } of shown) {
          const li = el('li', 'row');
          const top = el('div', 'top');
          const name = el('span', 'name', f.name + ' ');
          name.appendChild(el('span', 'eco', Core.REGISTRY[f.eco]));
          top.appendChild(name);
          top.appendChild(el('span', 'title ' + v.level, SYMBOL[v.level] + ' ' + v.title));
          li.appendChild(top);
          for (const r of v.reasons) li.appendChild(el('p', 'why', r));
          const acts = el('div', 'acts');
          const jump = el('button', 'btn', 'Show in page');
          jump.addEventListener('click', () => {
            const target = f.els.find((e) => e.isConnected);
            if (target) reveal(target);
          });
          acts.appendChild(jump);
          if (v.url) {
            const a = el('a', 'btn', 'Open on ' + Core.REGISTRY[f.eco]);
            a.href = v.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            // Some pages (GitHub's raw file view) are served sandboxed, which silently blocks links that open
            // a new tab. The extension opens the tab itself, so the link works everywhere.
            a.addEventListener('click', (ev) => {
              ev.preventDefault();
              const fallback = () => window.open(v.url, '_blank', 'noopener');
              try {
                chrome.runtime.sendMessage({ type: 'ghostdep:open', url: v.url }).catch(fallback);
              } catch (_) {
                fallback();
              }
            });
            acts.appendChild(a);
          }
          li.appendChild(acts);
          list.appendChild(li);
        }
        card.appendChild(list);
      }

      const foot = el('div', 'foot');
      foot.appendChild(el('span', '', 'Existence and age only. This does not scan package code.'));
      if (count.ok) {
        const t = el('button', 'btn', showOk ? 'Hide verified' : 'Show verified (' + count.ok + ')');
        t.addEventListener('click', () => {
          showOk = !showOk;
          renderPanel();
        });
        foot.appendChild(t);
      }
      card.appendChild(foot);
      wrap.appendChild(card);
    }

    const pill = el('button', 'pill');
    pill.setAttribute('aria-expanded', String(open));
    pill.appendChild(el('span', '', 'GhostDep'));
    if (count.danger) pill.appendChild(el('span', 'n danger', SYMBOL.danger + ' ' + count.danger + ' high risk'));
    if (count.warn) pill.appendChild(el('span', 'n warn', SYMBOL.warn + ' ' + count.warn + ' to check'));
    if (count.unknown) pill.appendChild(el('span', 'n unknown', SYMBOL.unknown + ' ' + count.unknown + ' unchecked'));
    if (count.ok) pill.appendChild(el('span', 'n ok', SYMBOL.ok + ' ' + count.ok + ' ok'));
    pill.addEventListener('click', () => {
      open = !open;
      renderPanel();
    });
    wrap.appendChild(pill);
    shadow.replaceChildren(wrap);
  }

  // ---------- scan loop ----------

  function scan() {
    timer = null;
    if (dead) return;
    const { list, unstable } = collect();
    current = list;
    paintInline();
    renderPanel();
    if (unstable) schedule(STABLE_MS + 60);

    const need = current.filter((f) => !results.has(f.key) && !pending.has(f.key));
    if (!need.length) return;
    for (const f of need) pending.add(f.key);
    let sent;
    try {
      sent = chrome.runtime.sendMessage({ type: 'ghostdep:check', items: need.map((f) => ({ eco: f.eco, name: f.name, run: f.run, sibling: f.sibling })) });
    } catch (_) {
      dead = true; // extension was reloaded; this copy of the script is orphaned
      return;
    }
    sent.then(
      (res) => {
        for (const f of need) pending.delete(f.key);
        if (!res || !res.ok) return;
        const hadDanger = [...results.values()].some((v) => v.level === 'danger');
        for (const k in res.results) results.set(k, res.results[k]);
        if (!hadDanger && Object.values(res.results).some((v) => v.level === 'danger')) open = true; // first high-risk hit opens the panel
        paintInline();
        renderPanel();
      },
      () => {
        for (const f of need) pending.delete(f.key);
      }
    );
  }

  let waitingSince = 0;
  function schedule(delay) {
    if (dead) return;
    const now = Date.now();
    if (timer) {
      if (now - waitingSince > 3000) return; // a page that never stops mutating must not starve the scan
      clearTimeout(timer);
    } else {
      waitingSince = now;
    }
    timer = setTimeout(scan, delay || 700);
  }

  window.__ghostdepRescan = () => schedule(50);

  new MutationObserver((muts) => {
    for (const m of muts) {
      if (host && (m.target === host || host.contains(m.target))) continue;
      schedule();
      return;
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  schedule(300);
})();
