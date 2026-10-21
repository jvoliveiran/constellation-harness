---
status: approved
task: 023-board-markdown-task-description-and-plan-dialog.md
scope-approved-by: product-manager, software-architect
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board UI: markdown rendering, task description, plan dialog (task 023)

## Overview

**Problem**: The Now panel shows the track chip, the branch, the task file
name, the stepper, and the facts row. The rest of the card is blank. The
user cannot read what the workflow works on, and cannot open the plan.

**Impact**: The user reads the task body as rendered markdown under the
facts row, with the task title in the header. One click opens the plan in
a dialog. The panel follows the in-flight task live. Task 024 reuses the
snapshot `title`, `/api/item`, `renderMarkdown`, and the route parser.

**Scope**:

- In: the vendored `markdown-it` build with `VERSION`, license, and the
  sha256 check in `selftest.sh`; a second inline script with its own CSP
  hash; `renderMarkdown` and `renderItemBody` in `board-render.mjs`;
  `extractTitle` and the node `title` in `board-model.mjs`; `GET /api/item`
  for the kinds `task` and `plan`; the Now panel description region, the
  task title in the header, and the View plan button; the native
  `<dialog>` on the `#/plan/<file>` route; the `.md` prose styles and the
  Dialog styles; the four task 029 items; one CHANGELOG entry under
  `[Unreleased]`; the README board paragraph (one sentence).
- Out (task scope notes): the Open task button and the `#/item/...` route
  (024); the internal link rewrite (024); `/api/item` kinds `epic` and
  `feature` (024); the Stepper restyle (025); the `● live` item (026); the
  running-row pulse (025); a live refresh of an open plan dialog (parked
  in the task). The facts row, the backlog tree, the watch, the probe, and
  the filesystem block of 022 do not change.

**Blocks**: tasks 024 and 025 (they build on `title`, `/api/item`,
`renderMarkdown`, `parseRoute`, and the dialog).
**Blocked By**: nothing. Task 022 is on `main` at d5836a9. The branch
`feat/023-board-markdown-task-description-and-plan-dialog` is checked out.

**Track**: Planned Work, product-scoped. PM × Architect pairing converged
(both `AGREED`; see the Feasibility Result at the end).

**Version**: no bump. The Technical Writer adds the entry under
`## [Unreleased]`. Task 026 cuts 1.4.0.

**Task 029**: its four items are criteria 14 to 17 of task 023. The PR of
task 023 ships them. The squash commit of that PR is the `commit:` of
task 023 and of task 029. The close of 023 closes 029 in the same change,
by the convention of this repo (a chore PR flips both to `done` with the
same merge commit).

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them verbatim
and adds technical notes.

### Task description

1. Given a workflow in flight on task `018-…md`, when the page renders,
   then the Now header shows the task id and the title from the first H1.
   - Note: D4 (`extractTitle`, node `title`) and D6 (`renderNow` moves to
     `board-render.mjs`). Test 15 pins the header. Without an H1 the
     header shows the file name, as today.
2. Given a workflow in flight on task `018-…md`, when the page renders,
   then the Now panel shows the task body as rendered markdown, without
   the front matter and without the first H1.
   - Note: D3 (`renderMarkdown`) and D6 (the `#desc` region, the fetch
     rule). Tests 9, 10, 13, 23. Manual test step 1.
3. Given a task body taller than half the viewport, when the page renders,
   then the description region stops at 50vh and scrolls inside itself.
   - Note: D7. Test 30 pins `max-height: 50vh` and `overflow: auto` on
     `#desc`. Manual test step 2 confirms the scroll.
4. Given the task file changes on disk, when 2 seconds pass, then the
   description shows the new text without a reload.
   - Note: D6. The watch fires on `fs.watch` at once, or on the 1.5 s poll
     plus the 150 ms debounce. The snapshot carries the new `mtime`; the
     page fetches the body once per `mtime` (test 23). Manual test step 3.

### Plan dialog

5. Given the state holds `plan` and the plan is in the tree, when the user
   clicks View plan, then a dialog opens with the plan rendered from
   markdown and the plan status chip, and the route is `#/plan/<file>`.
   - Note: D6. Tests 17, 19, 20, 22. Manual test step 4.
6. Given the plan dialog is open, when the user presses Esc, then the
   dialog closes and the previous route returns.
   - Note: D6. The native `cancel` event closes the dialog; the `close`
     handler restores the route that was active before the click, or
     `#/`. Manual test step 5.
7. Given the user reloads the page on `#/plan/<file>`, when the snapshot
   arrives, then the plan dialog opens again.
   - Note: D6. `syncRoute()` runs on every snapshot. Test 22, manual test
     step 6.
8. Given the state holds no plan, or the plan is not in the tree, when the
   page renders, then View plan is disabled and its title says why.
   - Note: D6, `renderNowActions`. Test 17 pins both reasons.

### Route `/api/item`

9. Given `GET /api/item?kind=task&file=../x.md`, a name not in the tree,
   a kind other than `task` or `plan`, or a symlinked file, then the
   response is 404.
   - Note: D5. Tests 26 and 29. "A symlinked file" means a symlink whose
     target leaves `.constellation/`, or a target that is not a regular
     file: `openContained` refuses it. A symlink to a regular file inside
     `.constellation/` reads, as the scan of 1.3.4 does for the tree. The
     tree and the route agree on what is readable.
10. Given a task file of 600 KB, when the page requests it, then the
    response carries the first 512 KB and `truncated: true`, and the page
    ends the body with the muted line `truncated at 512 KB`.
    - Note: D5 (`BODY_CAP_BYTES`), D3 (`renderItemBody`). Tests 12 and 28.

### Markdown safety and vendor file

11. Given a task body with raw HTML, a `javascript:` link, a relative
    link, and a remote image, when the page renders it, then the HTML
    shows as text, the `javascript:` link and the relative link have no
    `href`, the image shows as a link with its alt text, and every `http(s)`
    link has `rel="noopener noreferrer"` and `target="_blank"`.
    - Note: D3. Tests 13 and 14 run the vendored library in a `vm`
      context, so the proof is mechanical and needs no browser.
12. Given `board-vendor/VERSION`, then it records the markdown-it version,
    the source URL, the license, and the sha256 of `markdown-it.min.js`.
    Given a change of one byte in the vendor file, then
    `scripts/selftest.sh` fails.
    - Note: D1. Test 1 and `selftest.sh` step 12.
13. Given the vendor file is missing at start, when the board starts, then
    it logs one line, the server serves the page, and the page shows
    bodies in `<pre>` as text.
    - Note: D2 (`readVendor` with `try/catch`). Tests 5 and 11.

### Task 029 items (folded in)

14. Given the served page, then a test asserts that `page.js`, each
    `board-render.mjs` export source, and the vendor file hold no
    `</script` and no `<!--`, and that `page.css` holds no `</style`.
    - Note: D2. The vendor file holds one `<!--`, inside a regex literal
      of its HTML block rule. Test 4 asserts, for the vendor file, no
      `</script` and no `<script` (both case-insensitive). That is the
      condition under which a `<!--` cannot change how the HTML parser
      ends the script element. The architect took this decision under the
      PM's delegation (scope pass, 19-10-2026); the PM confirms the
      wording of the vendor clause at the plan review.
15. Given the Show all button holds a child element, when the user clicks
    the child, then the Agents card shows all rows
    (`closest('[data-action="show-all"]')`).
    - Note: D8. Test 21.
16. Given a backlog node with the status `done in-progress`, when the
    backlog renders, then its chip carries the class `s-other` only. The
    status maps through a fixed allow-list, as `glyph()` does.
    - Note: D8. Test 24.
17. Given an `events.jsonl` agent line with a non-string `agent_type`, when
    the Agents card renders, then the card shows the row and the other
    rows, and no error stops the render.
    - Note: D8. Test 25.

### Gate

18. Given the change, then the CSP header lists exactly two script hashes
    and one style hash, and the test that pins one script hash changes to
    two.
    - Note: D2. Test 3 replaces the 022 test
      `serve: the page holds one script, one style, and the script compiles`.
19. Given the change, then `renderMarkdown` (stub library: front matter
    strip, H1 drop, options passed) and the title extraction have unit
    tests, `/api/item` has HTTP tests for criteria 9 and 10, the suite
    holds more than the 160 tests of task 022 with no test deleted, and
    `scripts/selftest.sh` prints `selftest: ALL GREEN`.
    - Note: tests 6, 9, 26 to 29. The count goes from 160 to 190. Four
      022 tests change their body (D2); none is deleted.

## Design decisions

### D1 — Vendor `markdown-it` 14.3.0, the minified UMD build, verbatim

```
plugins/constellation/scripts/board-vendor/
  markdown-it.min.js      124 782 bytes, ASCII, from the npm tarball, byte for byte
  markdown-it.LICENSE     the MIT text of the package, byte for byte
  VERSION                 key: value lines, see below
```

`VERSION`:

```
name: markdown-it
version: 14.3.0
file: markdown-it.min.js
source: https://registry.npmjs.org/markdown-it/-/markdown-it-14.3.0.tgz (package/dist/markdown-it.min.js)
tarball-integrity: sha512-RCEsPjR+sr0x+AuYp601tKTkgFG4YEPLCzHST3cQ/fhlJkqAkz1L2/Qbp1j9qw5SBwQHFBoW8+hoN5xssOF0Tw==
license: MIT (markdown-it.LICENSE)
sha256: 70fe17bd06c7fa819f03a1ed10957904318103624198845dc893b309bf495e28
```

Facts, checked on 19-10-2026 against the copy that npm installed in the
local npx cache from that tarball (`~/.npm/_npx/10f54a790ecaa614/`):

- The file is pure ASCII (no byte outside `0x20` to `0x7E` and `\n`), so
  the UTF-8 text that `readFileSync(..., 'utf8')` returns re-encodes to
  the same bytes. The CSP hash of the served block and the sha256 in
  `VERSION` are one digest in two encodings (base64 and hex). Test 3 pins
  this.
- The UMD header sets `globalThis.markdownit`. The page reads
  `window.markdownit`.
- The text holds no `</script`, no `<script`, and no `style="` in any
  case. It holds one `<!--` (D2) and ends with
  `//# sourceMappingURL=markdown-it.min.js.map` and no newline. Open
  DevTools request that map and get a 404 from the board. That is
  DevTools-only and not a CSP violation. Accepted.
- The default `validateLink` refuses `javascript:`, `vbscript:`, `file:`,
  and `data:` targets, except `data:image/(gif|png|jpeg|webp)`. With
  `html: false` the HTML block and inline rules return at once, so the
  regex that holds `<!--` never runs.
- 14.3.0 is the newest 14.x in that cache. Pin 14.3.0. If `npm view`
  shows a newer version at implementation time, keep 14.3.0: the hashes
  above are for 14.3.0, and an upgrade is one later task.

Vendor procedure (the engineer, in the scratchpad; nothing runs from the
repo):

```bash
S="$SCRATCH/vendor"; mkdir -p "$S"; cd "$S"
npm pack markdown-it@14.3.0 --pack-destination .          # npm checks the tarball against the registry integrity
npm view markdown-it@14.3.0 dist.integrity                 # expect sha512-RCEsPjR+sr0x+AuYp601tKTkgFG4YEPLCzHST3cQ/fhlJkqAkz1L2/Qbp1j9qw5SBwQHFBoW8+hoN5xssOF0Tw==
openssl dgst -sha512 -binary markdown-it-14.3.0.tgz | base64   # must equal the text after sha512-
tar -xzf markdown-it-14.3.0.tgz package/dist/markdown-it.min.js package/LICENSE
V=/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board-vendor
mkdir -p "$V"
cp package/dist/markdown-it.min.js "$V/markdown-it.min.js"
cp package/LICENSE "$V/markdown-it.LICENSE"
shasum -a 256 "$V/markdown-it.min.js"   # expect 70fe17bd06c7fa819f03a1ed10957904318103624198845dc893b309bf495e28
wc -c "$V/markdown-it.min.js"           # expect 124782
```

When the registry is not reachable, the cached copy at
`~/.npm/_npx/10f54a790ecaa614/node_modules/markdown-it/dist/markdown-it.min.js`
is the same file. The sha256 and the size above are the acceptance test
either way. A different digest means a different file: stop and report.

`selftest.sh` gains step 12, after the board tests:

```bash
# 12. Vendor integrity — the sha256 of board-vendor/markdown-it.min.js must equal the value in VERSION.
VDIR="$ROOT/plugins/constellation/scripts/board-vendor"
if command -v sha256sum >/dev/null 2>&1; then VSUM="$(sha256sum "$VDIR/markdown-it.min.js" | cut -d' ' -f1)"
else VSUM="$(shasum -a 256 "$VDIR/markdown-it.min.js" | cut -d' ' -f1)"; fi
VPIN="$(sed -n 's/^sha256: *//p' "$VDIR/VERSION")"
[ -n "$VPIN" ] && [ "$VSUM" = "$VPIN" ] || fail "board-vendor: markdown-it.min.js sha256 ${VSUM:-none} does not match VERSION (${VPIN:-none})"
say "12. vendor integrity checked"
```

The step needs no Node, so it runs on every machine. The `node --check`
loop of step 11 does not include the vendor file: it is third-party
minified code, and test 2 compiles it.

Rejected: a CDN `<script src>`. Spec §2 forbids it. Rejected: the
non-minified build. It is 2.5 times larger and no easier to audit than
the pinned digest.

### D2 — Second inline script, served verbatim, own CSP hash, tolerant read

`board-ui/page.html` gets a marker line before the page script:

```html
@@VENDOR@@
<script>@@SCRIPT@@</script>
```

In `board.mjs`, next to `uiFile`:

```js
/** The vendored markdown-it text, or null. A missing file logs one line: the page then shows bodies in <pre>. */
function readVendor() {
  try {
    return fs.readFileSync(new URL('./board-vendor/markdown-it.min.js', import.meta.url), 'utf8');
  } catch (e) {
    console.error(`board: board-vendor/markdown-it.min.js missing (${e.code ?? 'error'}) — task and plan bodies render as plain text`);
    return null;
  }
}
const VENDOR = readVendor();
const PAGE = fillMarker(fillMarker(fillMarker(uiFile('page.html'), '@@CSS@@', PAGE_STYLE), '@@VENDOR@@', VENDOR == null ? '' : `<script>${VENDOR}</script>`), '@@SCRIPT@@', PAGE_SCRIPT);
const SCRIPT_HASHES = [VENDOR, PAGE_SCRIPT].filter((t) => t != null).map(cspHash).join(' ');
// script-src: `script-src ${SCRIPT_HASHES}`
```

Rules:

- The marker is the whole element. A missing vendor leaves no empty
  `<script></script>` behind, so the CSP lists one hash and the browser
  reports nothing.
- The vendor block comes first. `page.js` reads `window.markdownit` at
  call time, not at load, so order is a readability choice.
- The vendor text is served byte for byte. No transform at serve time.
  The HTML parser: `<!--` inside script data enters the "escaped" state,
  and `</script` still ends the element in that state. Only `<script`
  after a `<!--` enters the "double escaped" state, in which `</script`
  does not end the element. The vendor holds no `<script` and no
  `</script` in any case, so the one `<!--` cannot move the end of the
  element. Test 4 pins both absences, so a future vendor upgrade that
  breaks the condition fails the suite.
- `page.js` and every `board-render.mjs` export source hold no `</script`
  and no `<!--`; `page.css` holds no `</style`. These are our files, so
  the stricter rule applies there. Test 4.
- The read happens at module load, as `uiFile` does. The log line goes to
  stderr once per process, in `--quiet` and in `--probe` too. The repo
  always ships the file, so the 022 test `cli: --quiet without
  config.json exits 0 and prints nothing` stays green.

Four 022 tests change their body, none is deleted:

| Test | Change |
|---|---|
| `serve: the page CSP hashes match the inline script and style` | Hash every `<script>` block; assert `script-src` equals the two hashes in page order. |
| `serve: the page serves page.css and page.js byte for byte` | Take the last `<script>` block. |
| `serve: the page script compiles and embeds the backlog renderer` | Take the last block (the greedy regex spans both blocks and does not compile). |
| `serve: the page script embeds feedText from the module` | Same. |
| `serve: the page holds one script, one style, and the script compiles` | Becomes test 2: two scripts. |

The helper `inlineBlock(html, tag)` becomes `inlineBlocks(html, tag)`,
an array; the vendor block is `[0]`, the page script `[1]`.

Rejected: a separate `<script src="/vendor/markdown-it.min.js">` with
`script-src 'self'`. It drops the hash pin on the served script (any
same-origin script URL would run) and contradicts criterion 18.
Rejected: `<script src>` with an `integrity` attribute matched by a CSP
hash. Firefox does not match external scripts against CSP hashes, so the
page would have no renderer there.

### D3 — `renderMarkdown(text, markdownit, esc)` and `renderItemBody(item, markdownit, esc)`

Both in `board-render.mjs`, self-contained (D2 of plan 022). `markdownit`
is the factory (`window.markdownit` on the page, a stub or the `vm`-loaded
vendor in tests). `esc` is the page helper, as every render function
takes it.

```js
/**
 * Render a work-item body as HTML: strip the front matter, drop the first H1 (the header shows
 * it), then render with markdown-it under the spec §7 options and renderer rules. markdownit is
 * the library factory (window.markdownit); null renders the text in a <pre>. The page receives
 * this function through toString(), so the body uses no module-scope symbol and no import.
 */
export function renderMarkdown(text, markdownit, esc) {
  var body = String(text == null ? '' : text).replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').replace(/^# .*(\r?\n|$)/m, '');
  if (!markdownit) return '<pre class="md-raw">' + esc(body) + '</pre>';
  var md = markdownit({ html: false, linkify: false, typographer: false, breaks: false });
  var isRemote = function (href) { return /^https?:\/\//i.test(href || ''); };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    var token = tokens[idx];
    var href = token.attrGet('href');
    if (isRemote(href)) { token.attrSet('rel', 'noopener noreferrer'); token.attrSet('target', '_blank'); }
    else if (token.attrIndex('href') >= 0) token.attrs.splice(token.attrIndex('href'), 1);
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    var token = tokens[idx];
    var src = token.attrGet('src') || '';
    var label = self.renderInlineAsText(token.children, options, env) || src;
    return isRemote(src)
      ? '<a href="' + esc(src) + '" rel="noopener noreferrer" target="_blank">' + esc(label) + '</a>'
      : '<a>' + esc(label) + '</a>';
  };
  return md.render(body);
}

/** The body of one /api/item response: the rendered markdown, then the muted truncation line when the read hit the cap. */
export function renderItemBody(item, markdownit, esc) {
  return renderMarkdown(item.text, markdownit, esc) + (item.truncated ? '<p class="muted">truncated at 512 KB</p>' : '');
}
```

Rules:

- The front-matter strip takes a leading `---` line through the next
  `---` line. A file with no closing fence renders as is: the fence shows
  as a rule and the fields as text. That is visible and harmless.
- The H1 drop removes the first line that starts with `# ` after the
  strip. `extractTitle` (D4) takes the same line, so the header shows
  what the body drops. A `# ` line inside a fenced block before the real
  H1 would be taken instead. No task or plan file starts with a fence.
  Accepted.
- The `href` rule keeps `http(s)://` only. Every other target (`#...`,
  `mailto:`, a relative path, or the empty string that `validateLink`
  leaves for `javascript:`) loses its `href`. The anchor stays as inert
  text, so the body reads the same. Task 024 adds the internal rewrite
  before this rule.
- An image is a link to its remote source with the alt text as label, or
  an inert anchor with the alt text. An empty alt shows the source text.
  `img-src data:` blocks every remote image anyway (spec §7).
- `md.render` escapes raw HTML (`html: false`), code, and attribute
  values. `esc` covers only the strings that the image rule builds.
- One `markdownit(...)` instance per call. A render runs once per body
  change (D6), not per snapshot, and the instance costs a few
  milliseconds. Caching is premature.

Rejected: `md.validateLink` override. The default already refuses the
dangerous schemes; the `href` rule above is stricter and testable.

### D4 — `extractTitle` and the node `title`

In `board-model.mjs`:

```js
/** The first `# ` line after the front matter, trimmed, or null. The same line that renderMarkdown drops. */
export function extractTitle(text) {
  const body = String(text ?? '').replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
  const match = /^# (.*)$/m.exec(body);
  return match ? match[1].trim() : null;
}
```

- `toNode` adds `title: extractTitle(text)`. The 64 KB read prefix holds
  the H1 of every real file. A capped file with no H1 in the prefix gets
  `null`, as a file without an H1 does.
- `groupNode` adds `title: node.title`, so epics, features, and orphan
  plans carry it (024 Title column). `attachPlans` sets
  `target.plan = { file, status, title }`, so the dialog header can show
  the plan title.
- The snapshot grows by one short string per node. Test
  `toNode: wire node carries no raw fields map` stays green: it pins
  `fields`, `links`, `order`, `mtime`, not the key set.
- The regex appears in `extractTitle` and in `renderMarkdown` (D2 of plan
  022 forbids a shared module symbol in render code). Tests 6 and 9 pin
  the same fixture, so the copies cannot drift apart without a red test.

### D5 — `GET /api/item?kind=<task|plan>&file=<name>`

`serve` gains a third argument. `board.mjs` exports a bounded reader.

```js
export const BODY_CAP_BYTES = 512 * 1024;
let bodyBuffer = null;
const getBodyBuffer = () => (bodyBuffer ??= Buffer.alloc(BODY_CAP_BYTES));
const ITEM_DIRS = { task: 'tasksDir', plan: 'plansDir' };

/**
 * Read one work-item body for /api/item: at most BODY_CAP_BYTES through openContained. The caller
 * has checked the kind, the name, and the tree. Returns { kind, file, mtime, truncated, text }, or
 * null when the file cannot be read (missing, outside the root, not a regular file).
 */
export function readItem(projectDir, kind, file) {
  const p = paths(projectDir);
  const { root } = resolveRoot(projectDir);
  if (!root || !ITEM_DIRS[kind]) return null;
  try {
    const { text, truncated, mtime } = readPrefix(root, path.join(p[ITEM_DIRS[kind]], file), getBodyBuffer());
    return { kind, file, mtime, truncated, text };
  } catch {
    return null;
  }
}
```

In `serve(getSnapshot, subscribe, readItem = () => null)`:

```js
if (url.pathname === '/api/item') {
  const kind = url.searchParams.get('kind');
  const file = url.searchParams.get('file');
  const item = render.treeHolds(getSnapshot().tree, kind, file) ? readItem(kind, file) : null;
  if (!item) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(item));
  return;
}
```

`runServer` passes `(kind, file) => readItem(projectDir, kind, file)`.
Tests build the same closure over a temporary project.

`treeHolds` in `board-render.mjs`, the one gate for the route and for the
View plan button:

```js
/**
 * True when file matches the name rule of spec §4.4 and the snapshot tree holds it as the given
 * kind. Task 023 knows task and plan; 024 adds epic and feature. A null tree holds nothing.
 */
export function treeHolds(tree, kind, file) {
  if (!tree || typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(file)) return false;
  if (kind === 'task') return tree.tasks.some(function (t) { return t.file === file; });
  if (kind === 'plan') return tree.tasks.some(function (t) { return !!t.plan && t.plan.file === file; }) || tree.orphanPlans.some(function (p) { return p.file === file; });
  return false;
}
```

Rules:

- The route never lists a directory and never stats a name that the tree
  does not hold. The name rule refuses `..`, `/`, a leading dot, and an
  empty name before any filesystem call.
- Every refusal is a 404 with the body `not found`: a bad kind, a bad
  name, a name outside the tree, a read failure of any code. The reason
  stays off the wire; the snapshot already shows `unreadable: <code>` on
  the node.
- `readPrefix` with a 512 KB buffer is the `readBody` of spec §8.2. The
  buffer allocates on the first request and is reused: the server is
  single-threaded and the read is synchronous.
- `mtime` is the file mtime at read time. The page compares it with the
  node `mtime` in the next snapshot to decide on a refetch (D6).
- Nosniff and the Host check apply, as on every route. `GET` only.

Rejected: a `/api/item` that walks the directory for the name. The tree
is the allow-list, as spec §8.2 says.

### D6 — Page: Now card structure, fetch rule, route, dialog

`board-ui/page.html`, the Now card and the dialog:

```html
<section class="card"><h2>Now</h2><div id="now"></div><div id="desc" class="md" hidden></div><div id="now-actions" class="actions" hidden></div><div id="now-errs" class="errs"></div></section>
...
<dialog id="dialog" aria-labelledby="dialog-title"></dialog>
```

New exports of `board-render.mjs` (self-contained, formatters in `view`):

- `renderNow(view, esc)` — moved from `page.js` (plan 022 D2 said 023
  moves it). `view = { state, progress, task, tokenDelta, projectDir,
  hhmm, fmtDur, fmtTok, since }`. `task` is the tree node of `state.task`
  or null. The header span becomes
  `<span>task <code>023</code> Board UI: markdown…</span>` from `task.id`
  and `task.title`; without a node or a title it stays
  `task <code>023-x.md</code>`. The errors leave this function: `page.js`
  writes them to `#now-errs`. The function stays under 50 lines; the
  stepper strip is its own export `renderSteps(progress, esc)`.
- `renderNowActions(view, esc)` — `view = { state, tree }`. Returns one
  button. Enabled:
  `<button type="button" class="btn primary" data-action="view-plan" data-file="<plan>">View plan</button>`.
  Disabled with the reason in `title`: `no plan in the workflow state`
  when `state.plan` is empty; `plan <file> is not in .constellation/plans/`
  when `treeHolds(tree, 'plan', state.plan)` is false.
- `renderPlanDialog(view, esc)` — `view = { plan: { file, status, title,
  taskId }, item, markdownit }`. Returns the inner HTML of the dialog: a
  `.dlg-head` with `<span id="dialog-title">` (the title, or the file),
  `<code>file</code>`, `<span class="chip p-<status>">`, `task <id>`, and
  `<button type="button" class="btn secondary" data-action="close-dialog" aria-label="Close">✕</button>`;
  then `<div class="dlg-body md">` with `renderItemBody(item, markdownit, esc)`,
  or the muted line `plan unavailable (<status>)` when `item` is `{ error }`.
  The status class maps through the allow-list `draft`, `approved`, else
  `p-other` (same rule as D8).
- `parseRoute(hash)` — `#/plan/<file>` with the name rule gives
  `{ view: 'plan', file }`; everything else gives `{ view: 'overview' }`.
  Task 024 extends it.

`page.js` runtime:

- State: `var taskBody = { file: null, mtime: null, item: null }`,
  `var dialog = { file: null, item: null }`, `var routeBefore = null`,
  `var fetchSeq = 0`.
- `render()` → `renderMeta`, `renderNowCard`, `renderBacklogCard`,
  `renderAgentsCard`, `syncRoute`, `tick`.
- `renderNowCard()`: `#now` gets `renderNow(...)`; `#now-errs` gets the
  snapshot errors; `#now-actions` gets `renderNowActions(...)` and loses
  `hidden` when a state exists; `#desc` loses `hidden` when a state with
  a task exists. Then `syncTaskBody()`.
- `syncTaskBody()`: the task node is `snap.tree.tasks.find(file ===
  state.task)`. When `state.task` or the node `mtime` differs from
  `taskBody`, call `loadItem('task', file)`; on resolve, when the reply
  is still the newest request (`fetchSeq`), store it and set
  `#desc.innerHTML = renderItemBody(item, window.markdownit, esc)`. On a
  failure, `#desc` shows `<p class="muted">task body unavailable (<status>)</p>`.
  No state, or no task, clears `taskBody` and hides `#desc`. The region
  re-renders only on a body change, so its scroll position survives the
  snapshots that change nothing (criterion 3 with a live page).
- `loadItem(kind, file)`: `fetch('/api/item?kind=' + kind + '&file=' + encodeURIComponent(file))`,
  then `r.ok ? r.json() : { error: r.status }`. `connect-src 'self'`
  allows it.
- `syncRoute()`: `var route = parseRoute(location.hash)`. Plan route with
  `treeHolds(snap.tree, 'plan', route.file)`: when `dialog.file !==
  route.file`, fetch the plan, set `dialog`, write
  `renderPlanDialog(...)` into `#dialog`, and call `showModal()` when the
  dialog is not open. Any other case: when the dialog is open, call
  `close()`. A plan route whose file is not in the tree renders the
  overview and leaves the hash alone, as spec §4.4 says.
- Click on `[data-action="view-plan"]` (delegated on `#now-actions`,
  `closest`): `routeBefore = location.hash || '#/'`, then
  `location.hash = '#/plan/' + file`. The `hashchange` listener calls
  `syncRoute()`.
- Click on `[data-action="close-dialog"]` (delegated on `#dialog`):
  `dialog.close()`. Esc fires the native `cancel`, then `close`.
- The `close` event handler: when `parseRoute(location.hash).view ===
  'plan'`, call `history.replaceState(null, '', routeBefore || '#/')`,
  reset `dialog` and `routeBefore`, and call `syncRoute()`.
  `replaceState` fires no `hashchange`, so the call is explicit. A reload
  on `#/plan/<file>` has no `routeBefore`, so Esc lands on `#/` and
  never leaves the page.
- The Show all listener uses `ev.target.closest('[data-action="show-all"]')`
  (D8).
- No change to the SSE client, the theme, or `tick()`.

Headless Chrome, `showModal()`, `hashchange`, `replaceState`, and `fetch`
need no CSP source beyond the current header. No inline handler and no
inline style appear, as today.

Rejected: `history.back()` on close. On a reload at `#/plan/<file>` it
leaves the board. Rejected: a re-render of the whole Now card per body
change. The description and the dialog hold the only large DOM, and they
change only on an `mtime` change.

### D7 — Styles: `.md` prose, the description region, the dialog

Append to `page.css` before the media query, with the token rules of 022
(every color a `var()`, no literal):

```css
/* Now card: description and actions */
#desc { max-height: 50vh; overflow: auto; margin-top: 14px; padding-right: 4px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.muted { color: var(--muted); font-size: 12px; }

/* Markdown prose */
.md { max-width: 72ch; overflow-wrap: anywhere; }
.md h1, .md h2, .md h3, .md h4 { line-height: 1.25; margin: 18px 0 8px; }
.md h1 { font-size: 20px; } .md h2 { font-size: 16px; } .md h3, .md h4 { font-size: 14px; }
.md p, .md ul, .md ol { margin: 0 0 10px; }
.md ul, .md ol { padding-left: 22px; } .md ul { list-style: disc; } .md ol { list-style: decimal; }
.md li { display: list-item; padding: 2px 0; border: 0; font-size: 14px; }
.md code { color: var(--text); background: var(--surface-2); padding: 1px 4px; border-radius: 4px; }
.md pre { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow: auto; }
.md pre code { background: transparent; padding: 0; }
.md blockquote { margin: 0 0 10px; padding: 2px 12px; border-left: 3px solid var(--accent); color: var(--muted); }
.md table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 0 0 12px; font-size: 13px; }
.md th, .md td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
.md th { background: var(--surface-2); }
.md a { color: var(--accent); } .md a:not([href]) { color: inherit; text-decoration: underline dotted; cursor: default; }
.md-raw { white-space: pre-wrap; font-size: 13px; }

/* Dialog */
dialog { width: min(960px, 92vw); height: 85vh; max-height: 85vh; padding: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); box-shadow: 0 24px 64px color-mix(in srgb, var(--bg) 70%, transparent); }
dialog::backdrop { background: color-mix(in srgb, var(--bg) 60%, transparent); }
dialog[open] { display: flex; flex-direction: column; }
.dlg-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.dlg-head #dialog-title { font-size: 16px; font-weight: 600; }
.dlg-head .btn { margin-left: auto; width: 32px; padding: 0; }
.dlg-body { overflow: auto; min-height: 0; padding: 16px; }
```

- `.md li` overrides the global `li` row style of the Agents card (flex,
  border) inside prose. `.md table { display: block }` keeps a wide table
  inside 390 px with its own scroll; it is the usual trick and needs no
  wrapper, because markdown-it emits a bare `<table>`.
- The one shadow level of spec §4.1 is `color-mix` on `--bg`, so test 12
  of 022 (no color literal) stays green. Browsers before Chrome 122 and
  Safari 17.4 do not pass custom properties to `::backdrop`; they show
  the UA backdrop. Accepted.
- The 022 test `page.css: the Now card cannot overflow a 390 px viewport`
  stays green: `.md pre` and `.md table` scroll inside, and `.md` wraps
  anywhere.

### D8 — Task 029 items

- `page.js`: the `#agents` listener reads
  `ev.target.closest && ev.target.closest('[data-action="show-all"]')`.
- `renderBacklog`, `header()`: the chip class comes from an allow-list
  inside the function, `var STATUS_CLASSES = ['inbox', 'refined', 'in-progress', 'parked', 'done', 'dropped']`;
  a status outside it gives `s-other`. The chip text stays `esc(status)`.
  The same rule applies to the plan chip in `renderPlanDialog` (`draft`,
  `approved`, else `p-other`).
- `renderAgents`, `name()`: `String(a.agent_type || 'agent').replace(...)`.
  A number, an object, or an array becomes text through `String()`, so
  the row renders and the card never throws on one bad line.
- Test 4 (D2) is the markup-guard assert of item 1.

### D9 — Tests: the `vm` harness runs the vendor and the page

- `loadVendor()` in `board.test.mjs`: `vm.runInNewContext(vendorText + ';markdownit', {})`
  returns the factory. Tests 13 and 14 render real markdown with it, so
  criterion 11 is mechanical.
- `bootPage` grows: the sandbox gets `location`, `history`, `fetch`
  (a stub that records calls and resolves a given item), the ids `now`,
  `desc`, `now-actions`, `now-errs`, `backlog`, `agents`, `dialog`
  (with `showModal`, `close`, `open`), `window.addEventListener`, and an
  `EventSource` stub that stores its instance in the sandbox. The script
  under test is `renderPrelude + page.js`, built as `board.mjs` builds it
  (`Object.entries(render)`), so `page.js` can call the render functions.
  `feed(snapshot)` calls `es.onmessage({ data: JSON.stringify(snapshot) })`.
  The 022 theme tests keep their calls.

## Implementation

All paths are under
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/`
unless given in full.

### Files

| File | Change | Lines (about) |
|---|---|---|
| `board-vendor/markdown-it.min.js` | New. The npm build, verbatim (D1). | +1 (124 782 bytes) |
| `board-vendor/markdown-it.LICENSE` | New. The MIT text of the package. | +21 |
| `board-vendor/VERSION` | New. Seven `key: value` lines (D1). | +7 |
| `board-model.mjs` | `extractTitle`; `title` in `toNode`, `groupNode`, and `task.plan` (D4). | +12 |
| `board-render.mjs` | `renderMarkdown`, `renderItemBody`, `treeHolds`, `renderNow` (moved), `renderSteps`, `renderNowActions`, `renderPlanDialog`, `parseRoute` (D3, D5, D6); the allow-list in `header()` and `String()` in `name()` (D8). | +130 |
| `board-ui/page.html` | The Now card structure, the `@@VENDOR@@` line, the `<dialog>` (D2, D6). | +4 |
| `board-ui/page.css` | D7. | +30 |
| `board-ui/page.js` | `renderNow` leaves; `renderNowCard`, `syncTaskBody`, `loadItem`, `syncRoute`, the click and `hashchange` and `close` listeners, `closest` (D6, D8). | +70, -30 |
| `board.mjs` | `readVendor`, `VENDOR`, the third `fillMarker`, `SCRIPT_HASHES` (D2); `BODY_CAP_BYTES`, `getBodyBuffer`, `ITEM_DIRS`, `readItem`, the `/api/item` branch, the third `serve` argument (D5). | +50 |
| `board.test.mjs` | Four 022 tests edited (D2); the 30 tests of the Validation section; `inlineBlocks`, `loadVendor`, the `bootPage` growth (D9). | +420 |
| `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh` | Step 12 (D1). | +7 |
| `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md` | Entry under `[Unreleased]`. Technical Writer at Gate 2. | — |
| `/Users/joaooliveira/study/constellation-harness/README.md` | Board paragraph: one sentence on the vendored file. Technical Writer at Gate 2. | +1 |

No change to `board.md`, `plugin.json`, `marketplace.json`, `hooks.json`,
`log-event.sh`, or `templates/`. The plugin ships its directory, so
`board-vendor/` ships with no list to edit.

### Order, with checkpoint commits

Each step ends GREEN, then VERIFY per
`constellation:test-verified-development` (mutation variant, named per
test below), then one commit. The commit body records the VERIFY
evidence.

1. **Vendor and page assembly.** Run the vendor procedure (D1). Write
   `VERSION` and the license. Add `readVendor`, the marker, the two
   hashes (D2). Edit the four 022 tests. Add tests 1 to 5 and
   `selftest.sh` step 12.
   Commit: `feat: board vendors markdown-it 14.3.0 as a second inline script with its own CSP hash (task 023)`.
2. **Model and render functions.** `extractTitle` and `title` (D4);
   `renderMarkdown`, `renderItemBody` (D3); `treeHolds`, `parseRoute`
   (D5, D6). Add tests 6 to 14, 18, 19.
   Commit: `feat: board renders markdown bodies, extracts titles, and parses the plan route (task 023)`.
3. **Route `/api/item`.** `readItem`, the `serve` branch (D5). Add tests
   26 to 29.
   Commit: `feat: board serves task and plan bodies on /api/item under the 512 KB cap (task 023)`.
4. **Now panel and dialog.** `renderNow` moves; `renderSteps`,
   `renderNowActions`, `renderPlanDialog`; `page.html`, `page.css`,
   `page.js` (D6, D7). Add tests 15, 16, 17, 20, 22, 23, 30.
   Commit: `feat: board Now panel shows the task description and opens the plan in a dialog (task 023)`.
5. **Task 029 items.** `closest`, the allow-list, `String()` (D8). Add
   tests 21, 24, 25.
   Commit: `fix: board page markup guards, Show all child click, status class allow-list, non-string agent_type (task 029)`.
6. **Manual browser check** (Validation). Fix what it finds, then commit
   under `fix:` when a fix was needed.

### Data flow

- Start: `readVendor` → `VENDOR` → `PAGE` with two script blocks →
  `PAGE_CSP` with `SCRIPT_HASHES`.
- Snapshot: `scanWorkItems` → `toNode` with `title` → `buildTree` with
  `title` on group nodes and `task.plan`.
- Page: `snap` → `renderNow` (header with `task.title`) →
  `renderNowActions` (`treeHolds`) → `syncTaskBody` (`state.task` or
  `mtime` changed → `GET /api/item?kind=task` → `renderItemBody` →
  `#desc`) → `syncRoute` (`parseRoute` → plan route and `treeHolds` →
  `GET /api/item?kind=plan` → `renderPlanDialog` → `showModal`).
- Click View plan → `routeBefore` → `location.hash` → `hashchange` →
  `syncRoute`. Esc or ✕ → `close` → `replaceState(routeBefore)` →
  `syncRoute`.
- Server: `/api/item` → `treeHolds(snapshot.tree, kind, file)` →
  `readItem` → `readPrefix` with the 512 KB buffer → JSON.

## Validation

Follow `constellation:test-verified-development`. Every new test has a
named mutation: apply it, run the file, confirm the named test fails for
that reason, restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none. Fixtures are in-memory snapshots, temporary directories,
  real local sockets, a stub `markdownit` factory for the contract tests,
  and the real vendor text in a `vm` context for the safety tests.

All 160 current tests pass on `main` at d5836a9.

**Automated Test**: vendor and page assembly (criteria 12, 13, 14, 18)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 1 | `board-vendor: VERSION pins the vendor file` | `VERSION` holds `version: 14.3.0`, `license: MIT`, a `source:` that starts with `https://`, and a `sha256:` equal to the hex sha256 of the file bytes. | Change one hex digit of `sha256:` in `VERSION`. |
| 2 | `serve: the page holds two scripts, the vendor first, and both compile` | Two `<script>` blocks, one `<style>`; block 0 equals the vendor file text; block 1 ends with `page.js`; `new Function` on each does not throw. | Swap the marker lines in `page.html`. |
| 3 | `serve: the CSP lists two script hashes, one style hash, and the vendor hash is the VERSION sha256` | `script-src` holds exactly two `sha256-`, in block order, each the hash of its block; `style-src` one; `Buffer.from(hash0, 'base64').toString('hex')` equals the `VERSION` value. | Hash `PAGE_SCRIPT` only. |
| 4 | `page sources cannot end their element: no script or comment opener in our code, none in the vendor` | `page.js` and every render export source: no `/<\/script/i`, no `<!--`; `page.css`: no `/<\/style/i`; the vendor: no `/<\/script/i`, no `/<script/i`. | Put `'<!--'` in a string of `renderMarkdown`. |
| 5 | `cli: a missing vendor file logs one line and serves the page with one script hash` | Copy `board.mjs`, `board-model.mjs`, `board-render.mjs`, and `board-ui/` to a temporary directory (no `board-vendor/`), spawn it on a free port with a temporary project; stderr holds one line that starts with `board: board-vendor/markdown-it.min.js missing`; `GET /` is 200 with one `<script>` block and one hash in `script-src`. | Remove the `try/catch` in `readVendor`. |

**Automated Test**: model (criterion 1)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 6 | `extractTitle: the first H1 after the front matter, else null` | FM + `# Title` → `Title`; a `# note` line inside the FM is skipped; `#Title` → null; no H1 → null; CRLF and BOM files give the same. | Search from line 0. |
| 7 | `toNode: a node carries its title` | `mk('task', '001-a.md', [...])` with the `doc` helper → `title === 'Title'`; a file without H1 → `null`. | Drop `title` from `toNode`. |
| 8 | `buildTree: epic, feature, orphan plan, and task.plan carry title` | The v1 fixture: every group node has `title`; `tasks[0].plan.title` equals the plan H1. | Omit `title` in `groupNode`. |

**Automated Test**: `renderMarkdown` and `renderItemBody` (criteria 2, 10, 11, 13)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 9 | `renderMarkdown: strips the front matter, drops the first H1, and passes the §7 options` | Stub factory records options, returns `{ render: (s) => 'R(' + s + ')', renderer: { rules: {} } }`. Input FM + `# T` + body → `R(body)`; options deepEqual `{ html: false, linkify: false, typographer: false, breaks: false }`. | `html: true`; or keep the H1. |
| 10 | `renderMarkdown: only the first H1 goes, a later H1 and an H2 stay` | Body with `# A`, text, `# B`, `## C` → the output holds `# B` and `## C`, not `# A`. | `/^# .*$/gm`. |
| 11 | `renderMarkdown: no library renders the body in a pre, escaped` | `renderMarkdown('---\nstatus: x\n---\n# T\n<b>x</b>', null, esc)` equals `<pre class="md-raw">&lt;b&gt;x&lt;/b&gt;</pre>`. | Drop `esc`. |
| 12 | `renderItemBody: a truncated item ends with the muted line` | `truncated: true` → ends with `<p class="muted">truncated at 512 KB</p>`; `false` → does not. | Invert the condition. |
| 13 | `renderMarkdown with the vendored library: raw HTML is text, unsafe and relative links lose href, http links open in a new tab` | With `loadVendor()`: `<img src=x onerror=alert(1)>` → `&lt;img` and no `<img`; `[a](javascript:alert(1))` → `<a>a</a>`; `[b](014-x.md)` → `<a>b</a>`; `[c](https://example.com)` → `<a href="https://example.com" rel="noopener noreferrer" target="_blank">c</a>`; `[d](#top)` → `<a>d</a>`. | Remove the `link_open` rule. |
| 14 | `renderMarkdown with the vendored library: images render as links with their alt text` | `![alt](https://example.com/i.png)` → `<a href="https://example.com/i.png" rel="noopener noreferrer" target="_blank">alt</a>`; `![alt](./i.png)` → `<a>alt</a>`; `![](https://example.com/i.png)` → the label is the source text; no `<img` in the output. | Keep the source as `href` for a relative image. |

**Automated Test**: Now panel, actions, dialog, route (criteria 1, 5, 7, 8)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 15 | `renderNow: the header shows the task id and its title` | `state.task = '023-x.md'`, `task = { id: '023', title: 'Board UI: markdown' }` → the head holds `<code>023</code>` and `Board UI: markdown`; `task = null` → `<code>023-x.md</code>`; a title with `<` is escaped. | Drop the title. |
| 16 | `renderNow: a null state renders the empty state and a state renders the strip, modifiers, and facts` | Pins the move: null state → `No workflow in flight` with the project path; the planned fixture → one `.step.current`, the loop chip, six facts. | Return `''` for a null state. |
| 17 | `renderNowActions: View plan is enabled only when the state names a plan that the tree holds` | No `plan` → `disabled` and `title="no plan in the workflow state"`; `plan` not in tree → `disabled` and `title="plan 023-x.md is not in .constellation/plans/"`; in tree → no `disabled`, `data-action="view-plan"`, `data-file="023-x.md"`. | Ignore the tree. |
| 18 | `treeHolds: the name rule and the tree membership for tasks and plans` | `../x.md`, `.x.md`, `a/b.md`, `x.txt` → false; a task file → true as `task`, false as `plan`; a plan on `task.plan` → true; an orphan plan → true; kind `epic` → false; null tree → false. | Drop the regex. |
| 19 | `parseRoute: #/plan/<file> opens the plan dialog and every other hash is the overview` | `#/plan/023-x.md` → `{ view: 'plan', file: '023-x.md' }`; `#/plan/../x.md`, `#/item/task/x.md`, `#/`, `''`, `#/plan/` → `{ view: 'overview' }`. | Accept any file text. |
| 20 | `renderPlanDialog: the header shows title, file, status chip, task id, and close; the body is the rendered plan` | Stub library; `plan = { file: '023-x.md', status: 'approved', title: 'Plan T', taskId: '023' }` → `id="dialog-title"` holds `Plan T`, `<code>023-x.md</code>`, `chip p-approved`, `task 023`, `data-action="close-dialog"`, `R(` body; status `weird` → `p-other`; `item = { error: 404 }` → `plan unavailable (404)`. | Drop the chip class. |

**Automated Test**: page runtime (criteria 4, 7, 15)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 21 | `page.js: a click on a child of Show all shows every row` | Boot with the prelude; feed 25 finished agents; dispatch a click whose `target.closest(sel)` returns an element only for the Show all selector; `#agents.innerHTML` holds 25 `<li>` and no `data-action="show-all"`. | Read `ev.target.getAttribute` again. |
| 22 | `page.js: a snapshot on #/plan/<file> fetches the plan and opens the dialog` | `location.hash = '#/plan/023-x.md'`; feed a snapshot whose tree holds the plan; the fetch stub saw `/api/item?kind=plan&file=023-x.md`; after the promise, `dialog.showModal` was called and `#dialog.innerHTML` holds the stub body. A snapshot with the plan absent from the tree → no fetch, no `showModal`. | Skip `syncRoute` in `render`. |
| 23 | `page.js: the task body is fetched once per task mtime, not per snapshot` | Three snapshots: same task, same `mtime`, same `mtime`, new `mtime` → the fetch stub counts 2 calls; `#desc.innerHTML` holds the stub body; a snapshot with no state → `#desc` hidden. | Fetch on every snapshot. |

**Automated Test**: task 029 items (criteria 16, 17)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 24 | `renderBacklog: a status outside the allow-list gets the class s-other only` | A feature with status `done in-progress` → `class="chip s-other"`, the text `done in-progress` escaped; status `done` → `s-done`. | Use `esc(status)` in the class. |
| 25 | `renderAgents: a non-string agent_type renders its row and the others` | Agents with `agent_type: 42`, `{}`, `['a']` plus two strings → five `<li>`, `42` as text, no throw. | Call `.replace` on the raw value. |

**Automated Test**: `/api/item` (criteria 9, 10)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 26 | `serve: /api/item returns 404 and no body for a bad kind, a bad name, and a name outside the tree` | `serve(() => loadSnapshot(dir), () => {}, (k, f) => readItem(dir, k, f))` over a temporary project with one task and one plan; `kind=epic`, `file=../x.md`, `file=zzz.md`, `file=` → 404 with `not found`; `POST` → 405. | Drop the `treeHolds` check. |
| 27 | `serve: /api/item serves a task body and a plan body with mtime and cache-control no-store` | 200, `content-type` JSON, `cache-control: no-store`, body `{ kind, file, mtime, truncated: false, text }` with `text` equal to the file. | Return the snapshot node instead of the text. |
| 28 | `serve: /api/item caps the body at 512 KB and flags truncated` | A 600 KB task in the tree → `text.length === BODY_CAP_BYTES`, `truncated: true`. | Read the whole file. |
| 29 | `serve: /api/item refuses a symlink that leaves .constellation and a FIFO` | A task symlink to a file outside the root is in the tree with `unreadable` → 404; a FIFO named like a task (skip without `mkfifo`) → 404 within the test timeout. | Replace `openContained` with `readFileSync`. |

**Automated Test**: CSS (criterion 3)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| 30 | `page.css: the description scrolls inside 50vh, prose is 72ch, and the dialog has the §4.2 size` | The `#desc` rule holds `max-height: 50vh` and `overflow: auto`; `.md` holds `max-width: 72ch`; `dialog` holds `width: min(960px, 92vw)` and `height: 85vh`. | Remove the `max-height`. |

Count: 30 new tests. `board.test.mjs` goes from 160 to 190. The 022
tests 12 (no color literal), 16 (no literal or `style=` in `page.js` and
the render sources), and `every export is a function that runs with no
module scope` cover the new code with no edit.

**MANUAL TEST**: the description, the dialog, and the route in a browser
(spec §11, once per phase)

- **Why manual**: the scroll bound at 50vh, the native dialog, Esc, the
  hash route on reload, the 2 s live update, and the phone layout need a
  browser. `node --test` has none, and the project adds no browser
  dependency.
- **Preconditions**: the branch at step 5 or later; Chrome; the fixture
  project built by
  `/private/tmp/claude-501/-Users-joaooliveira-study-constellation-harness/1dda0709-05d7-492d-93e1-c206b58a887f/scratchpad/board-fixture/build.sh`
  with the additions below. The orchestrator runs the script, starts the
  board, and drives Chrome with the `claude-in-chrome` tools
  (`navigate`, `computer` screenshots, `javascript_tool`,
  `read_console_messages`). Headless Chrome clamps a window to about
  500 px wide, so the 390 px check sets
  `document.documentElement.style.width = '390px'` as the proxy and reads
  `scrollWidth` of the root; the 1100 px breakpoint is below 500 px in
  either case.

Additions to `build.sh`, after the task file line:

```bash
S23=023-board-markdown-task-description-and-plan-dialog.md
sed -i '' 's/"task": "022-board-ui-source-split-and-layout.md"/"task": "'"$S23"'", "plan": "'"$S23"'"/' "$FIX/.constellation/state/current-workflow.json"
mkdir -p "$FIX/.constellation/plans"
cp /Users/joaooliveira/study/constellation-harness/.constellation/plans/$S23 "$FIX/.constellation/plans/$S23"
{
  printf -- '---\nstatus: in-progress\ntype: feature\nfeature: F001-a.md\n---\n# Board UI: markdown rendering, task description, plan dialog\n\n'
  printf 'Raw HTML: <b>bold</b> <img src=x onerror=alert(1)>\n\nLinks: [js](javascript:alert(1)) · [relative](014-x.md) · [remote](https://example.com) · ![pic](https://example.com/i.png)\n\n'
  printf '| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n> quote\n\n'
  for i in $(seq 1 40); do printf -- '- item %s\n' "$i"; done
} > "$FIX/.constellation/tasks/$S23"
```

- **Steps**:
  1. Open `http://127.0.0.1:4499` at 1280 px wide. Confirm: the Now
     header shows `task 023 Board UI: markdown rendering, task
     description, plan dialog`; under the facts row the body renders with
     a bold word shown as the text `<b>bold</b>`, no image, a table with
     borders, a code block on the surface-2 color, a quote with an accent
     bar, and the list. Hover `js` and `relative`: no link cursor, no
     `href`. Click `remote`: a new tab opens. Confirm the console shows no
     `Refused to` line.
  2. Confirm the description region ends at half the viewport and scrolls
     inside (`document.getElementById('desc').scrollHeight >
     clientHeight`; the page itself does not grow).
  3. Append one line `EDITED` to the fixture task file. Confirm the text
     appears within 2 s with no reload, and the scroll position of the
     description holds.
  4. Click View plan. Confirm: the dialog opens over the page with the
     plan title, `<code>023-…md</code>`, the chip `approved`, `task 023`,
     the rendered plan (headings, tables, code); the body scrolls; the
     URL ends with `#/plan/023-…md`.
  5. Press Esc. Confirm the dialog closes and the URL is `#/`. Click View
     plan again, click ✕. Same result.
  6. Set the URL to `#/plan/023-…md` and reload. Confirm the dialog opens
     when the page loads. Set the URL to `#/plan/zzz.md` and reload.
     Confirm the overview with no dialog and no console error.
  7. Edit `current-workflow.json`: remove `"plan"`. Confirm View plan is
     disabled with the title `no plan in the workflow state`. Restore it
     with `"plan": "zzz.md"`. Confirm the title
     `plan zzz.md is not in .constellation/plans/`. Restore the file.
  8. Phone proxy: run `document.documentElement.style.width = '390px'`.
     Confirm `document.documentElement.scrollWidth === 390`, the table
     scrolls inside the description, and the dialog fits (`92vw`).
     Restore the width.
  9. Toggle the theme. Confirm the prose, the code block, the dialog, and
     the backdrop follow the tokens in both themes.
  10. Append `"agent_type": 42` on a new `SubagentStart` line in
      `events.jsonl`. Confirm the Agents card still renders with the new
      row `42`. Click the text inside `Show all (58)`. Confirm 58 rows.
- **Expected**: every confirmation above holds. Any `Refused to` line in
  the console, any `href` on the `js` or `relative` anchors, or any
  horizontal scroll at the 390 px proxy fails the test.
- **Observability**: the console; `location.hash`;
  `document.getElementById('dialog').open`; the Network panel for
  `/api/item` (one request per body change, `cache-control: no-store`);
  the board's stderr.

## Integration Touchpoints

- **CSP** - Could break: a hash that does not match a served block; the
  vendor text ends the script element early - Validation: tests 2, 3, 4;
  the manual check watches for `Refused to` lines.
- **Plugin packaging** - Could break: `board-vendor/` does not ship; the
  license is absent - Validation: `git ls-files` after step 1 lists the
  three files; `claude plugin validate` in `selftest.sh` step 3; test 1.
- **`selftest.sh`** - Could break: `sha256sum` absent on macOS - Validation:
  step 12 falls back to `shasum -a 256`; CI runs Ubuntu with coreutils.
- **Snapshot wire format** - Could break: a consumer that pins the key set
  of a node - Validation: `title` is an addition; every `loadSnapshot`
  and `buildTree` test passes with no edit except test 8.
- **`serve` signature** - Could break: the two-argument calls in the 022
  tests - Validation: the third argument defaults to `() => null`; the
  route then answers 404 for every item.
- **Current tests (160)** - Could break: the four tests that read the
  first `<script>` block - Validation: D2 lists them; they take the last
  block and pass with no other edit.
- **Watch and poll** - Could break: nothing; the watch does not change -
  Validation: criterion 4 rides on the existing `mtime` stamp in the
  snapshot; manual test step 3.
- **Tasks 024 and 025** - Could break: both extend `parseRoute`,
  `treeHolds`, `renderMarkdown`, and the dialog - Validation: each
  function has one place and one test block; 024 adds kinds and the link
  rewrite; 025 adds the agent and step dialogs on the same `<dialog>`.
- **README and CHANGELOG** - Could break: "no dependencies" reads as "no
  third-party code" - Validation: the Technical Writer adds the vendored
  file sentence (Release notes).

## Risks

1. **A vendor upgrade brings `<script` or `</script` into the file** -
   Impact: H - Likelihood: L - Mitigation: test 4 pins both absences;
   `VERSION` pins the digest; an upgrade is a deliberate task.
2. **The served vendor text differs from the file bytes** (encoding) -
   Impact: H - Likelihood: L - Mitigation: the file is ASCII (D1); test 3
   ties the CSP hash to the `VERSION` sha256, so any drift is red.
3. **A fetch race shows an older body after a newer one** - Impact: M -
   Likelihood: M - Mitigation: `fetchSeq` in D6; only the newest reply
   writes the DOM; test 23 covers the fetch count, the manual step 3 the
   live update.
4. **`history.replaceState` on close leaves a wrong route after 024 adds
   backlog routes** - Impact: L - Likelihood: M - Mitigation:
   `routeBefore` stores the full hash, not a view name; 024 inherits it.
5. **`::backdrop` ignores the tokens in an older browser** - Impact: L -
   Likelihood: L - Mitigation: the UA backdrop shows instead; the dialog
   itself takes the tokens through normal inheritance.
6. **An H1 inside a fenced block before the real H1** - Impact: L -
   Likelihood: L - Mitigation: documented in D3 and D4; the header and
   the body use the same line, so the view stays consistent.
7. **The markdown render blocks the UI on a 512 KB body** - Impact: L -
   Likelihood: L - Mitigation: a render runs once per body change, not
   per snapshot; markdown-it renders 512 KB in well under a second; the
   cap bounds it.

## Logging

The board has no log file. Its observability is the snapshot, the page,
stderr, and the process exit.

- A missing vendor file: one stderr line at import,
  `board: board-vendor/markdown-it.min.js missing (ENOENT) — task and plan bodies render as plain text`.
  The process continues.
- A `/api/item` refusal: a 404 with `not found` and no stderr line. The
  reason is visible on the snapshot node (`warnings`) or is a bad request.
- The page: a failed body fetch shows `task body unavailable (<status>)`
  or `plan unavailable (<status>)` in muted text, in place of the body.
  The console stays clean; the fetch result is the signal.
- A CSP mismatch: the browser console prints `Refused to execute inline
  script`; the page stays empty, as in 022.
- No user IDs exist in this local, single-user tool.

## Release notes for the Technical Writer

Add to `## [Unreleased]` in
`/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`. Do not
bump `plugin.json` or `marketplace.json`; task 026 cuts 1.4.0.

Under `### Added`:

- **The Now panel shows the task description** (#023). The body of the
  in-flight task renders from markdown under the facts row, without its
  front matter and first H1. The header shows the task id and its title.
  The region scrolls inside half the viewport and follows the file within
  2 seconds of a change.
- **View plan opens the plan in a dialog** (#023). The route
  `#/plan/<file>` opens the native dialog with the plan title, its status
  chip, and the rendered plan. Esc closes it and restores the route. A
  reload on that route reopens it. The button is disabled, with the
  reason, when the state names no plan or the plan is not in the tree.
- **`GET /api/item?kind=<task|plan>&file=<name>`** (#023). Returns
  `{ kind, file, mtime, truncated, text }` for a file that the snapshot
  tree holds, read through the containment rules with a 512 KB cap. Every
  other request gets 404.
- **The board vendors `markdown-it` 14.3.0** (#023). One minified file
  under `scripts/board-vendor/` with its MIT license and a `VERSION` file
  that pins the source URL and the sha256. `scripts/selftest.sh` checks
  the digest. The page embeds it as a second inline script with its own
  CSP hash. Rendering runs with `html: false`; links keep `href` only for
  `http(s)` and open in a new tab with `rel="noopener noreferrer"`;
  images render as links with their alt text. Without the vendor file
  the board logs one line and shows bodies as plain text.
- Snapshot nodes carry `title`, the first H1 of the file (#023).

Under `### Changed`:

- The CSP `script-src` lists two hashes: the vendor block and the page
  script (#023).
- The board test count grows from 160 to 190 (#023).

Under `### Fixed`:

- **Board page markup guards from the task 022 review** (#029). A test
  asserts that the page sources and the vendor file cannot end their
  `<script>` or `<style>` element early. A click on a child of the
  `Show all` button shows all rows. A backlog status outside the known
  set gets the chip class `s-other` only. A non-string `agent_type` in
  `events.jsonl` renders as text instead of stopping the Agents card.

README, the board paragraph in
`/Users/joaooliveira/study/constellation-harness/README.md` (line 214):
after `(Node 20+, no dependencies)`, add one sentence: `The only
third-party code is a vendored markdown-it build under
scripts/board-vendor/, pinned by sha256.` Keep `it never writes to
.constellation/`; task 026 changes that sentence.

## Feasibility Result

- **VERDICT**: AGREED
- **FEASIBILITY**:
  - Vendored `markdown-it` with `VERSION`, license, sha256 in selftest:
    `trivial`. 14.3.0 is in the local npm cache with the registry
    integrity; the procedure in D1 is five commands.
  - Second inline script with its own CSP hash: `moderate`. Four 022
    tests read the first block; the vendor holds one `<!--`, analysed in
    D2 (parser-safe; criterion 14 vendor clause reads "no `</script` and
    no `<script`").
  - `renderMarkdown` with the §7 options and rules: `moderate`. One
    function, two renderer rules, testable with the real library in `vm`.
  - Node `title`: `trivial`.
  - `/api/item` for `task` and `plan`: `moderate`. Reuses `readPrefix`
    and `openContained`; `treeHolds` is the one gate; `serve` gains one
    argument.
  - Now panel description, View plan, dialog, route: `moderate`. The
    Now card gets a static structure so the body re-renders only on a
    change; the dialog is native.
  - `.md` styles and Dialog component: `trivial`.
  - Task 029 items: `trivial`.
  - Tolerant vendor read (PM note): `trivial`, D2.
- **SIMPLIFICATIONS**: none needed. The plan already takes the cheaper
  path on three points: no serve-time transform of the vendor text (the
  CSP hash equals the pinned sha256); no cache of the markdown-it
  instance; `history.replaceState` instead of a history stack.
- **PRODUCT_SUGGESTIONS**: none for the PM to triage. Two interpretation
  notes are recorded under criteria 9 and 14, taken under the PM's
  delegation of 19-10-2026.
- **RISKS**: see the Risks section; none above M impact with M
  likelihood.
- **OPEN_QUESTIONS**: none blocking.

## Open Questions

None blocking. Two notes for the PM, recorded as decisions:

- Criterion 14, vendor clause: the test asserts no `</script` and no
  `<script` (case-insensitive) in the vendor file, which is the condition
  that makes its one `<!--` harmless. The stricter "no `<!--`" rule
  applies to `page.js` and the render sources, which we write.
- Criterion 9, "a symlinked file": a symlink whose target leaves
  `.constellation/` or is not a regular file gets 404. A symlink to a
  regular file inside `.constellation/` reads, as the tree scan does.
