/* GhostDep service worker: looks package names up on the public registries and returns a verdict. */
importScripts('lib/popular.js', 'lib/core.js');

const Core = self.GhostDepCore;
const TTL_FOUND = 6 * 60 * 60 * 1000;
const TTL_MISSING = 15 * 60 * 1000; // a missing name can be registered at any moment; re-check soon
const TTL_ERROR = 60 * 1000;
const BIG_ENOUGH = 50000; // weekly npm downloads above which the full package document is not fetched
const inflight = new Map();

async function getJson(url, timeoutMs) {
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs || 12000),
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { data: await res.json() };
}

async function lookupPypi(name) {
  const r = await getJson('https://pypi.org/pypi/' + encodeURIComponent(name) + '/json');
  if (r.missing) return { exists: false };
  let created = null;
  const releases = (r.data && r.data.releases) || {};
  for (const v in releases) {
    for (const f of releases[v] || []) {
      const t = Date.parse(f.upload_time_iso_8601 || f.upload_time || '');
      if (!Number.isNaN(t) && (created === null || t < created)) created = t;
    }
  }
  return { exists: true, created, downloads: null, downloadsWindow: null }; // PyPI's API has no download counts
}

async function lookupNpm(name) {
  const path = name.replace('/', '%2F');
  const latest = await getJson('https://registry.npmjs.org/' + path + '/latest');
  if (latest.missing) return { exists: false };
  const dep = latest.data && typeof latest.data.deprecated === 'string' ? latest.data.deprecated.trim() : '';
  const deprecated = dep ? (dep.length > 160 ? dep.slice(0, 157) + '\u2026' : dep) : null;

  let downloads = null;
  try {
    const d = await getJson('https://api.npmjs.org/downloads/point/last-week/' + name, 8000);
    if (d.data && typeof d.data.downloads === 'number') downloads = d.data.downloads;
  } catch (_) {
    /* download stats are optional */
  }

  let created = null;
  if (downloads === null || downloads < BIG_ENOUGH) {
    try {
      const doc = await getJson('https://registry.npmjs.org/' + path, 15000);
      const t = doc.data && doc.data.time && Date.parse(doc.data.time.created);
      if (t && !Number.isNaN(t)) created = t;
    } catch (_) {
      /* age is optional */
    }
  }
  return { exists: true, created, downloads, downloadsWindow: 'week', deprecated };
}

async function lookupCrates(name) {
  const r = await getJson('https://crates.io/api/v1/crates/' + encodeURIComponent(name));
  if (r.missing) return { exists: false };
  const c = (r.data && r.data.crate) || {};
  const t = Date.parse(c.created_at || '');
  return {
    exists: true,
    created: Number.isNaN(t) ? null : t,
    downloads: typeof c.recent_downloads === 'number' ? c.recent_downloads : null,
    downloadsWindow: '90 days',
  };
}

const LOOKUP = { pypi: lookupPypi, npm: lookupNpm, crates: lookupCrates };

async function lookup(eco, name) {
  const key = 'pkg:' + eco + ':' + name;
  const now = Date.now();
  try {
    const hit = (await chrome.storage.session.get(key))[key];
    if (hit) {
      const ttl = hit.v.error ? TTL_ERROR : hit.v.exists ? TTL_FOUND : TTL_MISSING;
      if (now - hit.t < ttl) return hit.v;
    }
  } catch (_) {
    /* no cache: go to network */
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let v;
    try {
      v = await LOOKUP[eco](name);
    } catch (e) {
      v = { error: e && e.name === 'TimeoutError' ? 'timed out' : 'network error' };
    }
    try {
      await chrome.storage.session.set({ [key]: { t: Date.now(), v } });
    } catch (_) {
      /* over quota */
    }
    return v;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

async function checkAll(items) {
  const out = {};
  const queue = items.slice(0, 150);
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const it = queue[next++];
      if (!it || !LOOKUP[it.eco] || typeof it.name !== 'string' || it.name.length > 214) continue;
      const run = it.run === true && !!Core.binAlias(it.name);
      const sibling = it.sibling === true && it.eco === 'npm' && it.name.startsWith('@');
      const key = Core.keyOf({ eco: it.eco, name: it.name, run, sibling });
      // Well-known names and known command names are answered locally: no request leaves the browser for them.
      const meta = run || Core.isPopular(it.eco, it.name) ? null : await lookup(it.eco, it.name);
      out[key] = Core.assess(it.eco, it.name, meta, Date.now(), { run, sibling });
      out[key].url = run
        ? Core.registryUrl(it.eco, Core.binAlias(it.name))
        : meta && meta.exists === false
          ? null
          : Core.registryUrl(it.eco, it.name);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'ghostdep:check' || !Array.isArray(msg.items)) return false;
  checkAll(msg.items).then(
    (results) => sendResponse({ ok: true, results }),
    (e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) })
  );
  return true;
});
