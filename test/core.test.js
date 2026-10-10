const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/lib/core.js');

const names = (text) => C.extractInstalls(text).map((x) => x.eco + ':' + x.name);
const NOW = Date.UTC(2026, 9, 9);
const DAY = 86400000;

test('pip variants', () => {
  assert.deepEqual(names('pip install requests'), ['pypi:requests']);
  assert.deepEqual(names('$ pip3 install -U "fastapi[standard]>=0.110" uvicorn==0.30.1'), ['pypi:fastapi', 'pypi:uvicorn']);
  assert.deepEqual(names('python -m pip install --upgrade Flask_SQLAlchemy'), ['pypi:flask-sqlalchemy']);
  assert.deepEqual(names('!pip install -q transformers datasets'), ['pypi:transformers', 'pypi:datasets']);
  assert.deepEqual(names('%pip install torch --index-url https://download.pytorch.org/whl/cpu'), ['pypi:torch']);
  assert.deepEqual(names('sudo pip install foo-bar && pip install baz.qux'), ['pypi:foo-bar', 'pypi:baz-qux']);
  assert.deepEqual(names('uv add httpx\nuv pip install rich\npoetry add pendulum\npipx install black\nuvx ruff check .'),
    ['pypi:httpx', 'pypi:rich', 'pypi:pendulum', 'pypi:black', 'pypi:ruff']);
  assert.deepEqual(names('pip install foo \\\n    bar \\\n    baz'), ['pypi:foo', 'pypi:bar', 'pypi:baz']);
  assert.deepEqual(names('RUN pip install --no-cache-dir flask gunicorn'), ['pypi:flask', 'pypi:gunicorn']);
  assert.deepEqual(names('      - run: pip install pytest'), ['pypi:pytest']);
  assert.deepEqual(names('pip install foo > install.log 2>&1'), ['pypi:foo']);
});

test('pip things that are not registry packages', () => {
  assert.deepEqual(names('pip install -r requirements.txt'), []);
  assert.deepEqual(names('pip install -e .'), []);
  assert.deepEqual(names('pip install .'), []);
  assert.deepEqual(names('pip install git+https://github.com/a/b.git'), []);
  assert.deepEqual(names('pip install ./dist/thing-1.0-py3-none-any.whl'), []);
  assert.deepEqual(names('pip install <package-name>'), []);
  assert.deepEqual(names('pip install $PKG ${OTHER}'), []);
  assert.deepEqual(names('pip --version'), []);
  assert.deepEqual(names('# pip install commented-out'), []);
  assert.deepEqual(names('echo "run pip install later"'), []);
});

test('npm family', () => {
  assert.deepEqual(names('npm install express'), ['npm:express']);
  assert.deepEqual(names('npm i -D @types/node typescript@5.4 --save-exact'), ['npm:@types/node', 'npm:typescript']);
  assert.deepEqual(names('pnpm add zod@^3 && yarn add -D vitest; bun add hono'), ['npm:zod', 'npm:vitest', 'npm:hono']);
  assert.deepEqual(names('yarn global add serve'), ['npm:serve']);
  assert.deepEqual(names('npx create-next-app@latest my-app --ts'), ['npm:create-next-app']);
  assert.deepEqual(names('npx -y shadcn@latest add button'), ['npm:shadcn']);
  assert.deepEqual(names('npx -p typescript tsc --init'), ['npm:typescript']);
  assert.deepEqual(names('npm create vite@latest my-app -- --template react'), ['npm:create-vite']);
  assert.deepEqual(names('pnpm create @scope/thing'), ['npm:@scope/create-thing']);
  assert.deepEqual(names('npm install'), []);
  assert.deepEqual(names('npm ci'), []);
  assert.deepEqual(names('npm install user/repo ./local ../x https://x.y/z.tgz'), []);
  assert.deepEqual(names('npm run build'), []);
});

test('cargo', () => {
  assert.deepEqual(names('cargo add serde --features derive'), ['crates:serde']);
  assert.deepEqual(names('cargo add tokio -F full anyhow'), ['crates:tokio', 'crates:anyhow']);
  assert.deepEqual(names('cargo install --locked ripgrep'), ['crates:ripgrep']);
  assert.deepEqual(names('cargo install --path .'), []);
  assert.deepEqual(names('cargo add foo --git https://github.com/a/foo'), []);
  assert.deepEqual(names('cargo build --release'), []);
});

test('package.json blocks', () => {
  const pj = JSON.stringify({ name: 'x', dependencies: { react: '^18', 'left-padz': '1.0.0', local: 'file:../local' }, devDependencies: { vite: '^5' } }, null, 2);
  assert.deepEqual(names(pj), ['npm:react', 'npm:left-padz', 'npm:vite']);
  assert.deepEqual(names('{ "a": 1 }'), []);
});

test('requirements.txt blocks need every line valid and one version pin', () => {
  assert.deepEqual(names('flask==3.0.0\nrequests>=2.31,<3\n# comment\nfastapi-turbo'), ['pypi:flask', 'pypi:requests', 'pypi:fastapi-turbo']);
  assert.deepEqual(names('hello\nworld'), []); // two bare words are not a requirements file
  assert.deepEqual(names('flask==3.0.0\nthis is prose'), []);
  assert.deepEqual(names('x = 1\ny == 2'), []);
});

test('deduplicates', () => {
  assert.deepEqual(names('pip install a-pkg\npip install A_pkg a.pkg'), ['pypi:a-pkg']);
});

test('edit distance', () => {
  assert.equal(C.editDistance('requests', 'requests', 1), 0);
  assert.equal(C.editDistance('requets', 'requests', 1), 1);
  assert.equal(C.editDistance('reqeusts', 'requests', 1), 1); // transposition
  assert.equal(C.editDistance('request', 'requests', 1), 1);
  assert.ok(C.editDistance('flask', 'django', 1) > 1);
});

test('near-miss detection', () => {
  assert.equal(C.nearPopular('pypi', 'requets'), 'requests');
  assert.equal(C.nearPopular('pypi', 'beautifulsoup-4'), 'beautifulsoup4');
  assert.equal(C.nearPopular('npm', 'expres'), 'express');
  assert.equal(C.nearPopular('npm', 'lodahs'), 'lodash');
  assert.equal(C.nearPopular('crates', 'serde_jsno'), 'serde-json');
  assert.equal(C.nearPopular('pypi', 'requests'), null);
  assert.equal(C.nearPopular('pypi', 'totally-unrelated-name'), null);
  assert.equal(C.nearPopular('crates', 'serde_json'), null);
});

test('verdicts', () => {
  const a = (eco, name, meta) => C.assess(eco, name, meta, NOW);
  assert.equal(a('pypi', 'requests', null).level, 'ok'); // well-known: no lookup needed
  assert.equal(a('pypi', 'fastapi-turbo', { exists: false }).level, 'danger');
  assert.equal(a('pypi', 'requets', { exists: false }).suggest, 'requests');
  assert.equal(a('pypi', 'some-lib', { exists: true, created: NOW - 5 * DAY }).level, 'danger');
  assert.equal(a('pypi', 'some-lib', { exists: true, created: NOW - 90 * DAY }).level, 'warn');
  assert.equal(a('pypi', 'some-lib', { exists: true, created: NOW - 2000 * DAY }).level, 'ok');
  assert.equal(a('npm', 'some-lib', { exists: true, created: NOW - 2000 * DAY, downloads: 12, downloadsWindow: 'week' }).level, 'warn');
  assert.equal(a('npm', 'some-lib', { exists: true, created: NOW - 2000 * DAY, downloads: 90000, downloadsWindow: 'week' }).level, 'ok');
  assert.equal(a('npm', 'expres', { exists: true, created: NOW - 100 * DAY, downloads: 40, downloadsWindow: 'week' }).level, 'danger');
  assert.equal(a('npm', 'expres', { exists: true, created: NOW - 3000 * DAY, downloads: 5000, downloadsWindow: 'week' }).level, 'warn');
  assert.equal(a('npm', 'reactt', { exists: true, created: NOW - 3000 * DAY, downloads: 9000000, downloadsWindow: 'week' }).level, 'ok'); // heavy use overrides resemblance
  assert.equal(a('pypi', 'sklearn', { exists: true, created: NOW - 3000 * DAY }).level, 'warn');
  assert.equal(a('pypi', 'sklearn', { exists: true, created: NOW - 3000 * DAY }).suggest, 'scikit-learn');
  assert.equal(a('pypi', 'cv2', { exists: false }).suggest, 'opencv-python');
  assert.equal(a('pypi', 'some-lib', { error: 'timed out' }).level, 'unknown'); // never a silent pass
  assert.equal(a('pypi', 'some-lib', null).level, 'unknown');
});

test('registry URLs', () => {
  assert.equal(C.registryUrl('npm', '@types/node'), 'https://www.npmjs.com/package/@types/node');
  assert.equal(C.registryUrl('pypi', 'requests'), 'https://pypi.org/project/requests/');
});

test('npx commands whose package has a different name', () => {
  const tsc = C.extractInstalls('npx tsc --init');
  assert.deepEqual(tsc, [{ eco: 'npm', name: 'tsc', run: true }]);
  assert.equal(C.keyOf(tsc[0]), 'npm:tsc#run');
  const v = C.assess('npm', 'tsc', null, NOW, { run: true });
  assert.equal(v.level, 'warn');
  assert.equal(v.suggest, 'typescript');
  // Installing (not running) the same name is a normal lookup, not a command warning.
  assert.deepEqual(C.extractInstalls('npm install firebase'), [{ eco: 'npm', name: 'firebase' }]);
  assert.deepEqual(C.extractInstalls('npx firebase deploy'), [{ eco: 'npm', name: 'firebase', run: true }]);
  // A command that IS its own package stays a plain lookup.
  assert.deepEqual(C.extractInstalls('npx openapi-typescript ./api.yaml -o types.ts'), [{ eco: 'npm', name: 'openapi-typescript' }]);
  assert.deepEqual(C.extractInstalls('pnpm dlx ng new app'), [{ eco: 'npm', name: 'ng', run: true }]);
});

test('deprecated packages are warned even when heavily downloaded', () => {
  const v = C.assess('npm', 'some-old-lib', { exists: true, created: NOW - 4000 * DAY, downloads: 700000, downloadsWindow: 'week', deprecated: 'Package no longer supported.' }, NOW);
  assert.equal(v.level, 'warn');
  assert.match(v.reasons.join(' '), /deprecated on npm/);
});

test('workspace siblings in a package.json are not reported as invented', () => {
  const pj = JSON.stringify({ name: '@cdk-mastery/cdktf-gcp', dependencies: { '@cdk-mastery/shared': '*', '@cdktf/provider-google': '^16', constructs: '^10' } });
  const items = C.extractInstalls(pj);
  assert.deepEqual(items, [
    { eco: 'npm', name: '@cdk-mastery/shared', sibling: true },
    { eco: 'npm', name: '@cdktf/provider-google' },
    { eco: 'npm', name: 'constructs' },
  ]);
  assert.equal(C.keyOf(items[0]), 'npm:@cdk-mastery/shared#ws');
  const v = C.assess('npm', '@cdk-mastery/shared', { exists: false }, NOW, { sibling: true });
  assert.equal(v.level, 'warn');
  assert.match(v.title, /workspace package/);
  // The same missing name from an install command is still treated as invented.
  assert.equal(C.assess('npm', '@cdk-mastery/shared', { exists: false }, NOW).level, 'danger');
  // An unscoped manifest name has no siblings.
  assert.deepEqual(C.extractInstalls(JSON.stringify({ name: 'app', dependencies: { '@x/y': '1' } })), [{ eco: 'npm', name: '@x/y' }]);
  // A sibling that DOES exist publicly is assessed normally.
  assert.equal(C.assess('npm', '@scope/real', { exists: true, created: NOW - 2000 * DAY, downloads: 90000, downloadsWindow: 'week' }, NOW, { sibling: true }).level, 'ok');
});
