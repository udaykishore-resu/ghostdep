# Chrome Web Store listing: GhostDep

Everything to paste into the developer dashboard. URLs assume the repo is `github.com/udaykishore-resu/ghostdep`; change them if you name it differently.

## Store listing tab

| Field | Value |
|---|---|
| Category | Developer Tools |
| Language | English |
| Store icon | `ghostdep-store-icon-128.png` |
| Screenshots | `ghostdep-screenshot-1.png`, `ghostdep-screenshot-2.png` |
| Small promo tile | `ghostdep-promo-440x280.png` |
| Marquee promo tile | leave empty |
| Global promo video | leave empty |
| Official URL | None |
| Homepage URL | `https://github.com/udaykishore-resu/ghostdep` |
| Support URL | `https://github.com/udaykishore-resu/ghostdep/issues` |
| Mature content | No |

### Description

```
GhostDep checks the packages an AI assistant tells you to install, before you install them.

AI assistants sometimes invent package names that sound right but do not exist. Attackers register those names and wait for someone to paste the install command. GhostDep reads the install commands in an answer and looks each package up on the real registry.

What it flags
- Packages that do not exist on PyPI, npm or crates.io
- Packages first published in the last 30 days
- Names one edit away from a well-known package, with the likely intended name
- Python import names used as package names (sklearn, cv2, yaml)
- npx commands that belong to a differently named package (npx tsc)
- npm packages marked deprecated

What it reads
pip, uv, pipx, poetry, npm, pnpm, yarn, bun, npx and cargo commands, plus package.json and requirements.txt blocks, Dockerfile RUN lines and CI run steps.

Where it runs
Automatically on ChatGPT, Claude, Gemini, AI Studio, Copilot, Perplexity, DeepSeek, Grok, Mistral and Poe. On any other page, click the toolbar icon and choose "Scan this page".

Privacy
Only package names are sent, only to the public registry they would be installed from, and well-known names are never sent. No chat text, no analytics, no account.

Limits
GhostDep checks existence, age, popularity and deprecation. It does not scan package code, so an established package that has been compromised will still pass.
```

## Privacy tab

**Single purpose**

```
Checks package names found in install commands on a web page against the public PyPI, npm and crates.io registries, and flags names that are missing, very new, deprecated, or imitate a popular package.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Caches registry lookup results in session storage so the same package is not looked up twice. Nothing is synced or kept after the browser closes. |
| `activeTab` | Lets the user scan the current page on demand by clicking "Scan this page", without the extension having standing access to every site. |
| `scripting` | Injects the scanner into the current tab when the user clicks "Scan this page". Only files packaged with the extension are injected. |
| Host permissions (`pypi.org`, `registry.npmjs.org`, `api.npmjs.org`, `crates.io`) | Looks up a package's existence, first-publish date, download count and deprecation status on the registry it would be installed from. |
| Content scripts on the listed AI chat sites | Reads code blocks in assistant answers to find install commands. Text the user is typing is ignored. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick **Website content** (the extension reads code blocks on the page and sends package names found there to the public registries). Tick nothing else. Certify all three statements.

**Privacy policy URL:** `https://github.com/udaykishore-resu/ghostdep/blob/main/PRIVACY.md`

## Distribution tab

Free · Public · All regions.

## Test instructions tab (optional, helps review)

```
No account needed. Open any page containing a code block such as:
  pip install requests fastapi-jwt-guard
On the supported chat sites the check runs by itself. On any other page, click the GhostDep toolbar icon, then "Scan this page". A red flag appears under the block for the package that does not exist on PyPI, and a summary appears at the bottom right.
```
