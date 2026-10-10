# GhostDep privacy policy

Last updated: 2026-10-09

GhostDep does not collect, store, sell or share personal data, and has no server of its own.

**What leaves your browser.** When a page shows an install command (for example `pip install some-name`), the extension looks the package name up on the public registry it would be installed from: `pypi.org`, `registry.npmjs.org`, `api.npmjs.org` or `crates.io`. The request contains the package name only. It is sent without cookies or credentials. Names on the built-in list of well-known packages are answered locally and are never sent. No conversation text, prompt or page content other than those package names is transmitted.

**What is read.** The text of code blocks on the supported chat sites, and on any other page only after you click "Scan this page". Text you are typing is ignored.

**What is stored.** Lookup results are cached in `chrome.storage.session` (6 hours for packages that exist, 15 minutes for names that do not) and are cleared when the browser closes. Nothing is written to disk and nothing is synced.

**What is not done.** No analytics, no tracking, no advertising, no remote code.

Contact: open an issue on the project's repository.
