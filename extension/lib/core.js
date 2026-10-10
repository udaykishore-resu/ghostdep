/*
 * GhostDep core — pure logic, no browser APIs.
 * Loaded three ways: content script (classic), service worker (importScripts), Node tests (require).
 */
(function (root) {
  'use strict';

  const Popular = root.GhostDepPopular || (typeof require === 'function' ? require('./popular.js') : null);

  // ---------- command parsing ----------

  // Flags that consume the next token as their value.
  const VALUE_FLAGS = {
    pypi: new Set(['-r', '--requirement', '-c', '--constraint', '-e', '--editable', '-i', '--index-url', '--extra-index-url', '-f', '--find-links',
      '-t', '--target', '--prefix', '--root', '--python', '-p', '--group', '--extra', '--with', '--from', '--platform', '--python-version',
      '--implementation', '--abi', '--cert', '--proxy', '--src', '--config-settings', '--optional', '--index', '--default-index', '-G', '-E']),
    npm: new Set(['--registry', '--prefix', '-w', '--workspace', '--tag', '--filter', '-C', '--cwd', '--dir', '--otp', '--cache', '--userconfig']),
    crates: new Set(['--features', '-F', '--version', '--vers', '--git', '--path', '--registry', '--index', '--rename', '-p', '--package',
      '--branch', '--tag', '--rev', '--root', '--target', '--profile', '-j', '--jobs', '--bin', '--example', '--manifest-path', '--target-dir']),
  };
  // Flags meaning "the packages come from somewhere that is not the public registry": skip the whole command.
  const SKIP_COMMAND_FLAGS = {
    pypi: new Set(['-r', '--requirement', '-e', '--editable']),
    npm: new Set([]),
    crates: new Set(['--git', '--path']),
  };

  function tokenize(cmd) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(cmd)) !== null) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
    return out;
  }

  /** Split a block of shell-ish text into individual commands. */
  function splitCommands(text) {
    const cmds = [];
    const joined = String(text).replace(/\\\r?\n/g, ' ');
    for (let line of joined.split(/\r?\n/)) {
      line = line.replace(/^\s*(?:PS\s+[^>]*>|\$|>>>|>|%|!)\s*/, ''); // prompts and notebook magics
      line = line.replace(/^\s*(?:-\s+)?(?:run\s*:\s*[|>]?|RUN\s+)/i, ''); // CI `run:` steps and Dockerfile RUN
      if (!line.trim() || /^\s*#/.test(line)) continue;
      line = line.replace(/\s+#.*$/, ''); // trailing comment
      for (const part of line.split(/&&|\|\||;|\|/)) if (part.trim()) cmds.push(part.trim());
    }
    return cmds;
  }

  /**
   * Identify an install command. Returns { eco, args, mode } or null.
   * mode: 'list' (every positional arg is a package), 'first' (only the first), 'create' (npm create/init).
   */
  function classify(tokens) {
    let t = tokens.slice();
    while (t.length && (t[0] === 'sudo' || t[0] === 'time' || t[0] === 'command' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]))) t.shift();
    if (!t.length) return null;
    const c = t[0].replace(/\.exe$/i, '').toLowerCase();
    const s1 = (t[1] || '').toLowerCase();
    const s2 = (t[2] || '').toLowerCase();

    if (/^(python|python3|python3\.\d+|py)$/.test(c) && s1 === '-m' && /^pip3?$/.test(s2)) t = t.slice(2);
    const c0 = t[0].replace(/\.exe$/i, '').toLowerCase();
    const a1 = (t[1] || '').toLowerCase();
    const a2 = (t[2] || '').toLowerCase();

    if (/^pip(3(\.\d+)?)?$/.test(c0) && a1 === 'install') return { eco: 'pypi', args: t.slice(2), mode: 'list' };
    if (c0 === 'uv') {
      if (a1 === 'pip' && a2 === 'install') return { eco: 'pypi', args: t.slice(3), mode: 'list' };
      if (a1 === 'add') return { eco: 'pypi', args: t.slice(2), mode: 'list' };
      if (a1 === 'tool' && (a2 === 'install' || a2 === 'run')) return { eco: 'pypi', args: t.slice(3), mode: 'first' };
      return null;
    }
    if (c0 === 'uvx') return { eco: 'pypi', args: t.slice(1), mode: 'first' };
    if (c0 === 'pipx' && (a1 === 'install' || a1 === 'run')) return { eco: 'pypi', args: t.slice(2), mode: 'first' };
    if ((c0 === 'poetry' || c0 === 'pdm' || c0 === 'rye' || c0 === 'hatch') && a1 === 'add') return { eco: 'pypi', args: t.slice(2), mode: 'list' };
    if (c0 === 'pipenv' && a1 === 'install') return { eco: 'pypi', args: t.slice(2), mode: 'list' };

    if (c0 === 'npm') {
      if (['install', 'i', 'add', 'in', 'ins', 'inst'].includes(a1)) return { eco: 'npm', args: t.slice(2), mode: 'list' };
      if (a1 === 'exec' || a1 === 'x') return { eco: 'npm', args: t.slice(2), mode: 'first' };
      if (a1 === 'create' || a1 === 'init') return { eco: 'npm', args: t.slice(2), mode: 'create' };
      return null;
    }
    if (c0 === 'pnpm') {
      if (['add', 'install', 'i'].includes(a1)) return { eco: 'npm', args: t.slice(2), mode: 'list' };
      if (a1 === 'dlx') return { eco: 'npm', args: t.slice(2), mode: 'first' };
      if (a1 === 'create') return { eco: 'npm', args: t.slice(2), mode: 'create' };
      return null;
    }
    if (c0 === 'yarn') {
      if (a1 === 'add') return { eco: 'npm', args: t.slice(2), mode: 'list' };
      if (a1 === 'global' && a2 === 'add') return { eco: 'npm', args: t.slice(3), mode: 'list' };
      if (a1 === 'dlx') return { eco: 'npm', args: t.slice(2), mode: 'first' };
      if (a1 === 'create') return { eco: 'npm', args: t.slice(2), mode: 'create' };
      return null;
    }
    if (c0 === 'bun') {
      if (['add', 'install', 'i'].includes(a1)) return { eco: 'npm', args: t.slice(2), mode: 'list' };
      if (a1 === 'x') return { eco: 'npm', args: t.slice(2), mode: 'first' };
      if (a1 === 'create') return { eco: 'npm', args: t.slice(2), mode: 'create' };
      return null;
    }
    if (c0 === 'npx' || c0 === 'bunx' || c0 === 'pnpx') return { eco: 'npm', args: t.slice(1), mode: 'first' };

    if (c0 === 'cargo' && (a1 === 'add' || a1 === 'install' || a1 === 'binstall')) return { eco: 'crates', args: t.slice(2), mode: 'list' };
    return null;
  }

  const PLACEHOLDER = /^<|<[^>=\s]*>|[${}*]|\.\.\./; // <package-name>, $PKG, {name}, foo*, ...
  const NOT_REGISTRY = /^(?:\.|\/|~|[A-Za-z]:\\)|:\/\/|^git\+|^file:|^link:|^workspace:|^github:|^gitlab:|^bitbucket:|^npm:|\\|\.(?:whl|tar\.gz|tgz|zip|tar)$/i;

  function normalizePypi(name) {
    return name.toLowerCase().replace(/[-_.]+/g, '-');
  }

  /** Turn one positional argument into a registry package name, or null. */
  function toName(eco, token) {
    if (!token || PLACEHOLDER.test(token) || NOT_REGISTRY.test(token)) return null;
    if (eco === 'pypi') {
      const m = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)(?:\[[^\]]*\])?\s*(?:(?:===|==|>=|<=|~=|!=|>|<|@).*)?$/.exec(token);
      return m ? normalizePypi(m[1]) : null;
    }
    if (eco === 'npm') {
      const m = /^((?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*)(?:@[^/]*)?$/i.exec(token);
      if (!m) return null; // also rejects GitHub shorthand `user/repo`
      return m[1].toLowerCase();
    }
    if (eco === 'crates') {
      const m = /^([A-Za-z][A-Za-z0-9_-]*)(?:@.+)?$/.exec(token);
      return m ? m[1].toLowerCase() : null;
    }
    return null;
  }

  /** `npm create vite@latest` runs the package `create-vite`. */
  function createName(token) {
    const base = token.replace(/(?!^)@[^/]*$/, '');
    if (PLACEHOLDER.test(base) || NOT_REGISTRY.test(base)) return null;
    let m = /^(@[a-z0-9~][a-z0-9._~-]*)\/([a-z0-9~][a-z0-9._~-]*)$/i.exec(base);
    if (m) return (m[1] + '/create-' + m[2]).toLowerCase();
    m = /^(@[a-z0-9~][a-z0-9._~-]*)$/i.exec(base);
    if (m) return (m[1] + '/create').toLowerCase();
    m = /^[a-z0-9~][a-z0-9._~-]*$/i.exec(base);
    return m ? ('create-' + base).toLowerCase() : null;
  }

  function fromCommand(cmd) {
    const info = classify(tokenize(cmd));
    if (!info) return [];
    const { eco, args, mode } = info;
    const valueFlags = VALUE_FLAGS[eco];
    const skipFlags = SKIP_COMMAND_FLAGS[eco];
    const names = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--') {
        if (mode !== 'list') break; // everything after -- belongs to the launched program
        continue;
      }
      if (/^[0-9&]*[<>]/.test(a)) break; // shell redirect: the command's arguments are over
      if (a.startsWith('-')) {
        const flag = a.split('=')[0];
        if (skipFlags.has(flag)) return [];
        // `npx -p pkg cmd` / `npx --package=pkg cmd`: the flag's value is the package that gets downloaded.
        if (eco === 'npm' && mode === 'first' && (flag === '-p' || flag === '--package')) {
          const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1];
          const n = toName(eco, v);
          return n ? [{ eco, name: n }] : [];
        }
        if (valueFlags.has(flag) && !a.includes('=')) i++;
        continue;
      }
      const n = mode === 'create' ? createName(a) : toName(eco, a);
      if (mode !== 'list') {
        if (n) names.push(n);
        break; // remaining args are for the launched program
      }
      if (n) names.push(n);
    }
    // `run` marks a name that is being executed (npx, dlx, exec) rather than installed.
    return names.map((name) => (mode === 'first' && eco === 'npm' && binAlias(name) ? { eco, name, run: true } : { eco, name }));
  }

  /** The package that really provides an npx command, when it is not the command's own name. */
  function binAlias(name) {
    return (Popular && Object.prototype.hasOwnProperty.call(Popular.npmBinAliases, name) && Popular.npmBinAliases[name]) || null;
  }

  const keyOf = (it) => it.eco + ':' + it.name + (it.run ? '#run' : '') + (it.sibling ? '#ws' : '');

  // ---------- manifest-style blocks ----------

  function fromPackageJson(text) {
    const t = text.trim();
    if (t[0] !== '{' || t.indexOf('ependencies') === -1) return [];
    let obj;
    try {
      obj = JSON.parse(t);
    } catch (_) {
      return [];
    }
    const out = [];
    // A dependency in the same @scope as the manifest's own name is almost always a workspace sibling.
    const own = obj && typeof obj.name === 'string' ? /^(@[^/]+)\//.exec(obj.name.toLowerCase()) : null;
    const ownScope = own ? own[1] + '/' : null;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = obj && obj[field];
      if (!deps || typeof deps !== 'object') continue;
      for (const [name, ver] of Object.entries(deps)) {
        if (typeof ver === 'string' && NOT_REGISTRY.test(ver)) continue;
        const n = toName('npm', name);
        if (!n) continue;
        out.push(ownScope && n.startsWith(ownScope) ? { eco: 'npm', name: n, sibling: true } : { eco: 'npm', name: n });
      }
    }
    return out;
  }

  const REQ_LINE = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)(\[[^\]]*\])?\s*((?:===|==|>=|<=|~=|!=|>|<)\s*[\w.*+!-]+(?:\s*,\s*(?:===|==|>=|<=|~=|!=|>|<)\s*[\w.*+!-]+)*)?\s*(?:;.*)?$/;

  /** A block is treated as requirements.txt only if EVERY line is a requirement and at least one is version-pinned. */
  function fromRequirements(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+#.*$/, '').trim())
      .filter((l) => l && !l.startsWith('#'));
    if (lines.length < 2 || lines.length > 300) return [];
    const out = [];
    let pinned = 0;
    for (const l of lines) {
      if (/^(-r|-c|-e|-i|-f|--)/.test(l)) continue; // option lines are fine, just not packages
      const m = REQ_LINE.exec(l);
      if (!m) return [];
      if (m[3]) pinned++;
      out.push({ eco: 'pypi', name: normalizePypi(m[1]) });
    }
    return pinned ? out : [];
  }

  /** Everything installable that a block of text mentions. Deduplicated, in first-seen order. */
  function extractInstalls(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const t = text.length > 40000 ? text.slice(0, 40000) : text;
    let found = fromPackageJson(t);
    if (!found.length) found = fromRequirements(t);
    if (!found.length) for (const cmd of splitCommands(t)) found.push(...fromCommand(cmd));
    const seen = new Set();
    return found.filter((f) => {
      const k = keyOf(f);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // ---------- name similarity ----------

  /** Damerau-Levenshtein (optimal string alignment) with an early exit above `max`. */
  function editDistance(a, b, max) {
    if (a === b) return 0;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null;
    let prev = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      const cur = new Array(lb + 1);
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = 1; j <= lb; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  const squash = (s) => s.replace(/[-_.]/g, '');
  const canon = (eco, name) => (eco === 'crates' ? name.replace(/_/g, '-') : name);

  function isPopular(eco, name) {
    return !!Popular && Popular[eco].has(canon(eco, name));
  }

  /** A well-known package this name is suspiciously close to, or null. */
  function nearPopular(eco, name) {
    if (!Popular) return null;
    const n = canon(eco, name);
    const list = Popular[eco];
    if (list.has(n) || n.length < 4) return null;
    const sq = squash(n);
    for (const p of list) {
      if (p.length < 4) continue;
      if (squash(p) === sq) return p;
      if (Math.abs(p.length - n.length) <= 1 && editDistance(n, p, 1) === 1) return p;
    }
    return null;
  }

  // ---------- verdict ----------

  const DAY = 86400000;
  const REGISTRY = { pypi: 'PyPI', npm: 'npm', crates: 'crates.io' };

  function fmtAge(days) {
    if (days < 1) return 'today';
    if (days < 60) return Math.round(days) + ' day' + (Math.round(days) === 1 ? '' : 's') + ' ago';
    if (days < 730) return Math.round(days / 30.4) + ' months ago';
    return Math.round(days / 365.25) + ' years ago';
  }

  function registryUrl(eco, name) {
    if (eco === 'pypi') return 'https://pypi.org/project/' + encodeURIComponent(name) + '/';
    if (eco === 'npm') return 'https://www.npmjs.com/package/' + name;
    return 'https://crates.io/crates/' + encodeURIComponent(name);
  }

  /**
   * meta: { exists: bool, created: ms|null, downloads: number|null, downloadsWindow: 'week'|'90 days', error: string|null }
   * Returns { level: 'danger'|'warn'|'ok'|'unknown', title, reasons: [], suggest }
   */
  function assess(eco, name, meta, now, opts) {
    const reg = REGISTRY[eco];
    const t = now || Date.now();

    const bin = opts && opts.run && eco === 'npm' ? binAlias(name) : null;
    if (bin) {
      return {
        level: 'warn',
        title: 'command, not a package',
        reasons: [
          '`' + name + '` is a command that ships in the `' + bin + '` package. Running it through npx only works when `' + bin +
            '` is already installed in the project. Otherwise npm downloads the separate package that is literally named `' + name + '`.',
        ],
        suggest: bin,
      };
    }

    if (isPopular(eco, name)) {
      return { level: 'ok', title: 'well-known package', reasons: ['On the built-in list of widely used ' + reg + ' packages.'], suggest: null };
    }

    const alias = eco === 'pypi' && Popular ? Popular.pypiAliases[name] || null : null;
    const near = nearPopular(eco, name);

    if (!meta || meta.error) {
      return {
        level: 'unknown',
        title: 'could not check',
        reasons: ['Lookup on ' + reg + ' failed' + (meta && meta.error ? ' (' + meta.error + ')' : '') + '. Not verified either way.'],
        suggest: alias || near,
      };
    }

    if (!meta.exists && opts && opts.sibling) {
      const scope = name.slice(0, name.indexOf('/'));
      return {
        level: 'warn',
        title: 'not on ' + reg + ' (workspace package?)',
        reasons: [
          'No public package with this name. It shares the ' + scope + ' scope with the package that depends on it, so it is probably a local workspace package. ' +
            'If this manifest came from an AI answer rather than your own repository, treat the name as invented.',
        ],
        suggest: null,
      };
    }

    if (!meta.exists) {
      const reasons = ['No package with this name on ' + reg + '. If an AI suggested it, the name is invented — and anyone can register it later with whatever code they like.'];
      if (alias) reasons.push('`' + name + '` is an import name. The package to install is `' + alias + '`.');
      else if (near) reasons.push('Did you mean `' + near + '`?');
      return { level: 'danger', title: 'does not exist on ' + reg, reasons, suggest: alias || near };
    }

    const reasons = [];
    let level = 'ok';
    const bump = (l) => {
      if (l === 'danger' || (l === 'warn' && level === 'ok')) level = l;
    };

    const age = meta.created ? (t - meta.created) / DAY : null;
    if (age !== null && age < 30) {
      bump('danger');
      reasons.push('First published ' + fmtAge(age) + '. Brand-new packages matching an AI suggestion are the classic slopsquatting pattern.');
    } else if (age !== null && age < 180) {
      bump('warn');
      reasons.push('First published ' + fmtAge(age) + '.');
    }

    const low = eco === 'crates' ? 3000 : 500;
    const lowDl = typeof meta.downloads === 'number' && meta.downloads < low;
    if (lowDl) {
      bump('warn');
      reasons.push('Only ' + meta.downloads.toLocaleString('en-US') + ' downloads in the last ' + meta.downloadsWindow + '.');
    }

    if (meta.deprecated) {
      bump('warn');
      reasons.push('Marked deprecated on ' + reg + ': \u201C' + meta.deprecated + '\u201D');
    }

    if (alias) {
      bump('warn');
      reasons.push('`' + name + '` is an import name. The package you almost certainly want is `' + alias + '`.');
    } else if (near && !(typeof meta.downloads === 'number' && meta.downloads >= low * 100)) {
      // Heavily used packages that merely resemble another name (preact/react) are left alone.
      const young = age !== null && age < 730;
      bump(young || lowDl ? 'danger' : 'warn');
      reasons.push('One edit away from the well-known `' + near + '`. Check you meant this one.');
    }

    if (level === 'ok') {
      const bits = [];
      if (age !== null) bits.push('first published ' + fmtAge(age));
      if (typeof meta.downloads === 'number') bits.push(meta.downloads.toLocaleString('en-US') + ' downloads in the last ' + meta.downloadsWindow);
      reasons.push('Exists on ' + reg + (bits.length ? ' — ' + bits.join(', ') : '') + '.');
    }

    const title = level === 'ok' ? 'exists on ' + reg : level === 'danger' ? 'high risk' : 'check before installing';
    return { level, title, reasons, suggest: alias || near };
  }

  const api = {
    extractInstalls, splitCommands, tokenize, classify, toName, createName, fromCommand, fromPackageJson, fromRequirements,
    editDistance, nearPopular, isPopular, assess, registryUrl, normalizePypi, REGISTRY, binAlias, keyOf,
  };
  root.GhostDepCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
