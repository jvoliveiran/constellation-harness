---
status: approved
task: 022-board-ui-source-split-and-layout.md
scope-approved-by: product-manager, software-architect
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board UI: source split, design system, layout, bounded Agents panel (task 022)

## Overview

**Problem**: `board.mjs` holds 1252 lines. The page HTML, CSS, and JS sit
in three template strings inside it. The Agents card grows with every
event and has no scroll bound. The page has one dark palette with ad hoc
colors and no light theme.

**Impact**: The user sees an Agents card that fits the viewport and
scrolls inside. The page follows the OS theme and keeps a manual choice.
The next phases of F001 (023 to 026) edit `board-ui/` files and
`board-render.mjs` instead of template strings.

**Scope**:

- In: `board-model.mjs`, `board-render.mjs`, `board-ui/page.html`,
  `board-ui/page.css`, `board-ui/page.js`; the page assembly and the CSP
  hashes in `board.mjs`; the tokens of spec §4.1; the Card, Chip, and
  Button styles of §4.2 in their current uses; the two-column layout of
  §4.3; the theme toggle; the bounded Agents panel of §6.1; one
  `node --check` line in `selftest.sh`; one CHANGELOG entry under
  `[Unreleased]`.
- Out (task scope notes): the agent row `description` (025); the Stepper
  restyle, the facts row, and the Now panel body (023); Table, Toolbar,
  Dialog, Toast, and the hash routes (023, 024, 026); the backlog table
  (024). The backlog keeps `renderBacklog` and its tree. Out as well: the
  vendor file and its sha256 check (023), any change to `board.md`, the
  README board paragraph, the probe, the watch, and the filesystem code.

**Blocks**: tasks 023 and 026 (they edit the files that this task creates).
**Blocked By**: nothing. Task 020 is on `main` at d91433e. The branch
`feat/022-board-ui-source-split-and-layout` exists.

**Track**: Planned Work, product-scoped. PM × Architect pairing converged
(both `AGREED`).

**Version**: no bump. The Technical Writer adds the entry under
`## [Unreleased]`. Task 026 cuts 1.4.0.

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them verbatim
and adds technical notes.

1. Given the board runs, when the user opens the page, then the HTML, CSS,
   and JS come from `board-ui/page.html`, `page.css`, and `page.js`, and
   the CSP header holds the hash of the served script and style text.
   - Note: D3. The served style text is `page.css` byte for byte. The
     served script text is the render prelude (D2) plus `page.js`. Test 3
     compares the served texts with the files on disk. The current CSP
     test keeps its shape: it hashes the text between the tags.
2. Given `board.mjs` after the split, then it exports the same functions
   as before from `board-model.mjs` and `board-render.mjs` through
   re-exports, and the 138 current tests pass with import path changes
   only.
   - Note: D1. Test 1 pins the 1.3.4 export list of `board.mjs`. The
     current tests change only their `import` block: pure functions come
     from the module that owns them.
3. Given 60 agent events in the log, when the page renders, then the
   Agents card is no taller than `calc(100vh - 96px)`, the card body
   scrolls, running agents stay pinned at the top, and the finished list
   shows the newest 20 rows plus a `Show all (n)` button. The Activity
   list stays capped at 30, inside the same scroll region.
   - Note: D4 for the height and the scroll, D6 for the rows. The row cap
     is a pure function, tested with 60 agents (tests 7 to 9). The height
     and the sticky group are CSS: test 15 pins the rules, the manual test
     confirms them in the browser. The Activity cap stays `FEED_LIMIT`
     (30) in `mergeFeed`; `page.js` draws `snap.feed` as given, under
     the agent rows, inside the one scroll region `#agents`.
4. Given a viewport of 1280 px, then Now and Agents sit side by side and
   the Agents card is sticky. Given 390 px, then the cards stack, the
   Agents card is not sticky, and the page has no horizontal scroll.
   - Note: D4. The breakpoint is 1100 px (spec §4.3). Manual test, with
     test 15 as the mechanical pin of the media query.
5. Given the OS theme is light, then the page renders the light tokens.
   Given the user clicks the theme toggle, then the page switches and
   keeps the choice after a reload.
   - Note: D5. The OS theme applies through CSS alone. The toggle sets
     `data-theme` and writes `localStorage` inside `try/catch`. Manual
     test.
6. Given the design tokens of spec §4.1, then every color on the page
   comes from a token, and the status chips use the colors of §4.2.
   - Note: D5 and D7. Tests 12 to 14 are mechanical: no color literal
     outside the token blocks of `page.css`, the ten token values of
     §4.1 for dark and light, the nine chip classes mapped to their
     tokens, and no color literal or `style=` attribute in `page.js` or
     in the source of the render functions.
7. Given the change, when the Lint Gate runs, then `scripts/selftest.sh`
   prints `selftest: ALL GREEN`.
   - Note: D8. Step 11 keeps the `*.test.mjs` glob. It gains a
     `node --check` for the two new modules and `page.js`.

## Design decisions

### D1 — Three modules, one entry, `export *` re-exports

```
plugins/constellation/scripts/
  board.mjs           CLI, HTTP server, filesystem, watch, page assembly (entry)
  board-model.mjs     pure snapshot functions, moved unchanged
  board-render.mjs    pure render functions, shipped to the page by toString()
  board-ui/page.html  page skeleton with two markers
  board-ui/page.css   tokens, components, layout
  board-ui/page.js    page runtime: SSE client, render loop, theme, Show all
```

`board-model.mjs` receives, unchanged, lines 19 to 400 of the current
file minus the entry-only constants: `resolveSteps`, `parseEventLines`,
`pairEvents`, `durationSeconds`, `tokenDelta`, `parseFieldValue`,
`parseFrontMatter`, `toNode`, `byOrderThenFile`, `addWarning`,
`attachByLink`, `attachPlans`, `toTaskNode`, `needsAttention`,
`summaryOf`, `groupNode`, `buildTree`, `diffStatuses`, `collapseBurst`,
`mergeFeed`, `emptySnapshot`, `safeRefresh`, and the constants that they
use: `LOOP_CAP`, `BURST_LIMIT`, `FEED_LIMIT`, `FRONT_MATTER_OPEN_WINDOW`,
`FRONT_MATTER_CLOSE_WINDOW`, `READ_CAP_BYTES`, `CAP_WARNING`,
`TASK_STATUSES`, `KNOWN_FIELDS`. `READ_CAP_BYTES` lives in the model
because `CAP_WARNING` derives from it; `board.mjs` imports it for
`readBuffer`.

`board-render.mjs` receives `renderBacklog` and `feedText` unchanged, plus
the new `renderAgents` (D6).

`board.mjs` keeps everything else: the port and timing constants,
`EVENT_TAIL`, `TRANSITION_CAP`, `JSON_CAP_BYTES`, `TAIL_CAP_BYTES`,
`SSE_CLIENT_CAP`, `classifyProbe`, `probeText`, the filesystem block,
`loadSnapshot`, `watch`, `signature`, `serve`, the page assembly (D3), the
probe, the owner walk, and `main`. Its header comment keeps the usage line
inside the first 12 lines: the test `board.mjs: the header names no phase
and its usage line matches --help` reads them.

Re-exports, at the top of `board.mjs` after the `node:` imports:

```js
import { READ_CAP_BYTES, resolveSteps, parseEventLines, pairEvents, tokenDelta, buildTree, diffStatuses, collapseBurst, mergeFeed, emptySnapshot, safeRefresh } from './board-model.mjs';
import * as render from './board-render.mjs';
export * from './board-model.mjs';
export * from './board-render.mjs';
```

Reasons:

- `export *` keeps every 1.3.4 name reachable from `board.mjs`, so the
  plugin monitor, `/constellation:board`, and any external importer keep
  one entry file. Test 1 pins the list, so a dropped name fails.
- A moved function with no edit keeps its 138 tests as the proof of the
  move.
- The model has no `node:` import. Test 2 asserts this: a model that
  starts to read the disk is a boundary break.

Rejected: a `board-fs.mjs` for the filesystem block. Spec §3 keeps it in
the entry file, and no phase of F001 needs it apart.

### D2 — The render prelude: every export of `board-render.mjs` ships by `toString()`

```js
/** The page receives every export of board-render.mjs as a top-level function declaration. */
const renderPrelude = Object.values(render).map((fn) => fn.toString()).join('\n');
```

Rules:

- Every export of `board-render.mjs` is a function whose body uses no
  module-scope symbol and no import. This is the current rule for
  `renderBacklog` and `feedText`. A constant that a render function needs
  sits inside the function body as a `var` (`AGENT_ROWS` in D6).
- `page.js` is one IIFE. It calls `renderBacklog`, `feedText`, and
  `renderAgents` as globals that the prelude declares. `page.js` holds the
  runtime only: `esc`, `hhmm`, `fmtDur`, `since`, `fmtTok`, the SSE
  client, the render loop, the tick, the theme toggle, and the Show all
  state.
- A function that renders a snapshot part and has a fixture lives in
  `board-render.mjs`. A function that touches `document`, `EventSource`,
  `localStorage`, or time lives in `page.js`. Task 023 moves `renderNow`
  out of `page.js` under the same rule.

Reasons:

- The page gets the render code from the same source that `node --test`
  runs. One copy, no drift.
- `Object.values(render)` makes "export it and it ships" the whole
  contract. Test 4 asserts that every export is a function that compiles
  and runs with no module scope.

### D3 — Page assembly: markers, function replacement, read at module load

`board-ui/page.html` is a full document. Its `<style>` and `<script>`
elements hold one marker each:

```html
<style>@@CSS@@</style>
...
<script>@@SCRIPT@@</script>
```

In `board.mjs`, where `PAGE_STYLE`, `PAGE_SCRIPT`, and `PAGE` sit today:

```js
const uiFile = (name) => fs.readFileSync(new URL(`./board-ui/${name}`, import.meta.url), 'utf8');
const PAGE_STYLE = uiFile('page.css');
const PAGE_SCRIPT = `${renderPrelude}\n${uiFile('page.js')}`;

/** Replace one marker with text that may hold `$`: a function replacement never expands `$&`. */
function fillMarker(html, marker, text) {
  const parts = html.split(marker);
  if (parts.length !== 2) throw new Error(`board: page.html must hold ${marker} exactly once`);
  return parts.join(text);
}
const PAGE = fillMarker(fillMarker(uiFile('page.html'), '@@CSS@@', PAGE_STYLE), '@@SCRIPT@@', PAGE_SCRIPT);
```

`cspHash` and `PAGE_CSP` stay as they are: `script-src` hashes
`PAGE_SCRIPT`, `style-src` hashes `PAGE_STYLE`. The hashes cover the
served text because the markers sit directly between the tags.

Rules:

- The read happens at module load, as the three constants do today. A
  missing or unreadable `board-ui` file throws at import: the test file,
  `--quiet`, `--probe`, and `main` all fail at once, which is the right
  place to fail. The cost on `--probe` is three small reads.
- The read is a plain `readFileSync`. The files belong to the plugin, not
  to the watched project, so `openContained` does not apply. The plugin
  directory may be a symlink in a dev install (task 011); `import.meta.url`
  resolves through it.
- `split`/`join` instead of `String.prototype.replace`: a string
  replacement expands `$&`, `$'`, and `$1`, and `page.js` holds `$`.
- `page.js` and the render functions must not hold `</script>`, and
  `page.css` must not hold `</style>`. Test 5 asserts that the served
  page holds one `<script>` and one `<style>` block and that the served
  script compiles under `new Function`.

Rejected: a lazy read on the first `GET /`. It moves the failure to the
first request and makes `serve` async for nothing.

### D4 — Layout and the bounded Agents card

Mobile first. `page.css` holds, in this order: tokens (D5), base,
components, the top bar, the main grid, the Now card, the Agents card,
the backlog tree, and the `@media (min-width: 1100px)` block last.

```css
main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; margin-top: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; min-width: 0; }
.card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 12px; }
#agents-card { display: flex; flex-direction: column; max-height: calc(100vh - 96px); }
#agents { overflow: auto; min-height: 0; }
#agents .running { position: sticky; top: 0; background: var(--surface); z-index: 1; }
code, .path { overflow-wrap: anywhere; }
@media (min-width: 1100px) {
  main { grid-template-columns: minmax(0, 1fr) 360px; align-items: start; }
  #agents-card { position: sticky; top: 16px; }
}
```

- `max-height` applies at every width: the scroll bound is the fix for
  problem 1 of the spec, on a phone as on a desktop. Only `position:
  sticky` is desktop-only, as spec §4.3 says.
- The card is a flex column so the body (`#agents`) takes the rest of the
  height and scrolls. `min-height: 0` lets a flex child shrink below its
  content.
- The `Running` group is sticky inside the scroll region, with the
  surface color so finished rows scroll under it.
- `minmax(0, 1fr)` on the Now column and `min-width: 0` on cards stop a
  long branch name or path from a horizontal page scroll at 390 px.
  `overflow-wrap: anywhere` on `code` wraps the project path.
- The page skeleton: `<header>` top bar with the title, the project path,
  the live and updated meta, and the theme button; `<main>` with the Now
  card and the Agents card (`id="agents-card"`, body `id="agents"`);
  then the Backlog card full width. The `#feed` id becomes `#agents`.
- Sizes 12, 13, 14, 16, 20 px, line height 1.45, `tabular-nums` on
  numbers, radius 10 px on cards, 8 px on controls, 999 px on chips, as
  spec §4.1. The step strip keeps its current markup and takes the tokens
  (the restyle is 023).

### D5 — Tokens, themes, chips, buttons

The token blocks of `page.css`, in this order at the top of the file:

```css
:root { color-scheme: dark; --bg: #0b0d12; --surface: #13161e; --surface-2: #1a1e28; --border: #262b38; --text: #e7e9ee; --muted: #8b91a1; --accent: #7c8cff; --ok: #4ecb8d; --warn: #f3b63f; --danger: #ff6b6b; }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) { color-scheme: light; --bg: #f6f7f9; --surface: #ffffff; --surface-2: #f0f2f5; --border: #e3e6ec; --text: #171a21; --muted: #646b7a; --accent: #4f5fe6; --ok: #1f9d61; --warn: #b7791f; --danger: #d64545; }
}
:root[data-theme="light"] { color-scheme: light; --bg: #f6f7f9; --surface: #ffffff; --surface-2: #f0f2f5; --border: #e3e6ec; --text: #171a21; --muted: #646b7a; --accent: #4f5fe6; --ok: #1f9d61; --warn: #b7791f; --danger: #d64545; }
```

- Dark is the default. The OS light theme applies with no JS. An explicit
  `data-theme` wins over the OS: `:not([data-theme="dark"])` keeps a
  manual dark choice on a light OS.
- The light tokens appear twice. A preprocessor would remove that, and
  the project has no build step. Ten lines twice is the cheaper cost.
  Test 13 pins both copies, so they cannot drift apart.
- Every other color on the page is `var(--token)`, `transparent`,
  `currentColor`, or `inherit`. The focus ring of the current step uses
  `color-mix(in srgb, var(--accent) 25%, transparent)` instead of the
  current `rgba(255,203,71,.18)`. `color-mix` has shipped in every
  evergreen browser since 2023.

Theme toggle, in `page.js`:

- At start: `try { var t = localStorage.getItem('board-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}`.
- On click of `#theme`: the effective theme is `data-theme` when set,
  else `matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'`.
  Set `data-theme` to the other one, store it in the same `try/catch`,
  and set the button text (`☾` on dark, `☀` on light) and its
  `aria-label`.
- The button is a `.btn.secondary` of 32 px height, as spec §4.2.

Chips:

```css
.chip, .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border); color: var(--muted); background: var(--surface-2); }
.chip.accent, .mods .chip { color: var(--accent); border-color: var(--accent); }
.chip.warn, .badge.warn { color: var(--danger); border-color: var(--danger); }
.chip.s-inbox, .chip.s-parked, .chip.s-other { color: var(--muted); }
.chip.s-refined { color: var(--accent); border-color: var(--accent); }
.chip.s-in-progress { color: var(--warn); border-color: var(--warn); }
.chip.s-done { color: var(--ok); border-color: var(--ok); }
.chip.s-dropped { color: var(--danger); border-color: var(--danger); }
.chip.p-draft { color: var(--muted); }
.chip.p-approved { color: var(--ok); border-color: var(--ok); }
```

- `page.js` uses `chip` for the track chip, the modifiers, and the meta
  warnings. `renderBacklog` keeps the class name `badge` on its flag
  spans: two current tests pin `<span class="badge warn">lenient</span>`,
  and criterion 2 forbids a test edit beyond the import block. `.badge`
  is an alias selector with a comment: `legacy class of the tree rows;
  task 024 removes it with the tree`.
- `renderBacklog` changes two characters of markup, in `header()`: the
  feature and epic status `<code>` becomes
  `<span class="chip s-<status>">`. No current test pins that `<code>`.
  Task rows keep their glyph, id, name, and `<code>type</code>`. This is
  the "tree only takes the token colors" of the scope notes.
- The `warn` modifier of the current `.badge.warn` meant "attention"; it
  maps to `--danger`, as spec §4.1 says for errors and attention. The
  loop and waiting modifiers in `.mods` take `--accent`; the `.run` spans
  and the running duration take `--warn`.

Buttons:

```css
.btn { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.btn.danger { background: var(--danger); border-color: var(--danger); color: var(--bg); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn:focus-visible, #theme:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

The uses in 022 are the theme toggle (secondary) and `Show all (n)`
(secondary). Primary and danger exist for 023 and 026 and cost three
lines; they are part of the §4.2 Button component that the PM scoped.

### D6 — `renderAgents(view, esc)`: running first, newest 20, Show all

```js
/**
 * Render the agent rows of the Agents card as an HTML string: the running group, the newest
 * finished rows, and a Show all button past the cap. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import: the time formatters come
 * in through view. view = { agents, showAll, hhmm, fmtDur }. agents is newest first, as the
 * snapshot sorts it. No agents gives ''.
 */
export function renderAgents(view, esc) {
  var AGENT_ROWS = 20;
  var agents = view.agents || [];
  var running = agents.filter(function (a) { return a.running; });
  var finished = agents.filter(function (a) { return !a.running; });
  var shown = view.showAll ? finished : finished.slice(0, AGENT_ROWS);
  function name(a) { return esc((a.agent_type || 'agent').replace(/^constellation:/, '')); }
  function row(a) {
    var dur = a.running
      ? '<span class="dur run" data-since="' + esc(a.start) + '" data-prefix="running ">running</span>'
      : '<span class="dur">' + esc(view.fmtDur(a.durationSec)) + '</span>';
    return '<li><span class="t">' + esc(view.hhmm(a.start)) + '</span><span' + (a.running ? ' class="run"' : '') + '>' + name(a) + '</span>' + dur + '</li>';
  }
  var html = '';
  if (running.length) html += '<div class="running"><div class="gh">Running</div><ul>' + running.map(row).join('') + '</ul></div>';
  if (shown.length) html += '<ul>' + shown.map(row).join('') + '</ul>';
  if (finished.length > shown.length) html += '<button type="button" class="btn secondary" data-action="show-all">Show all (' + finished.length + ')</button>';
  return html;
}
```

- `hhmm` and `fmtDur` are page helpers that the function cannot import,
  so `page.js` passes them in `view`. The tests pass stubs
  (`hhmm: (iso) => 'T' + iso`, `fmtDur: (s) => s + 's'`) and assert row
  counts, order, escaping, and the button text, not the formatted time.
  The running duration keeps `data-since` and `data-prefix`, so the
  current `tick()` of `page.js` updates it every second with no change.
- The Activity list stays in `page.js`, as today: `renderAgentsCard`
  sets `#agents` to the empty state when `agents` and `feed` are both
  empty, else to `renderAgents(...)` plus the Activity `<h2>` and its
  `<ul>` built with `feedText`. Both parts sit in `#agents`, the one
  scroll region of D4. `feedText` keeps its own tests.
- The snapshot sorts `agents` newest first (`pairEvents`), so
  `finished.slice(0, 20)` is the newest 20. `feed` arrives capped at 30
  by `mergeFeed`.
- `Show all (n)` shows the finished count, so with 2 running and 58
  finished it reads `Show all (58)`.
- `page.js` keeps `var showAllAgents = false;` and one delegated click
  listener on `#agents` for `[data-action="show-all"]` (CSP forbids
  inline handlers). The click sets the flag and calls `render()`. The
  flag lives until a reload; an SSE re-render keeps it.
- The `render()` function of `page.js` splits into `renderMeta`,
  `renderNow`, and `renderAgentsCard` so that each stays under 50 lines
  (code-metrics budget; the project has no ESLint, the budget still
  applies to new code).

Rejected: a cap applied in `loadSnapshot`. The snapshot keeps its
`EVENT_TAIL` so that `Show all` has rows to show, as spec §6.1 says.

### D7 — The mechanical token check

One helper in `board.test.mjs`:

```js
/** The declaration text of a stylesheet: comments, selectors, and at-rule preludes removed. */
const declarationsOnly = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[^{};]+\{/g, '{');
/** The stylesheet without its token blocks: every block whose selector starts with :root. */
const withoutTokens = (css) => css.replace(/:root[^{]*\{[^}]*\}/g, '');
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
```

- `declarationsOnly` deletes every run of text that ends in `{` and holds
  no `;`, `{`, or `}`: that is a selector or an at-rule prelude. What
  remains is declarations and braces, so `#agents` in a selector cannot
  look like a hex color, and `@media (max-width: 1100px)` cannot look
  like a declaration.
- Test 12 asserts `!COLOR_LITERAL.test(declarationsOnly(withoutTokens(css)))`
  and reports the first match in the message.
- Test 13 asserts, for each of the ten tokens, the dark value in the
  `:root {` block and the light value in both light blocks, by
  `--name: #value;` text search.
- Test 14 asserts, for each chip class of D5, that a rule with that class
  in its selector holds `var(--<token>)` in its body. The engineer builds
  the map `{ 's-inbox': 'muted', 's-refined': 'accent', 's-in-progress': 'warn', 's-parked': 'muted', 's-done': 'ok', 's-dropped': 'danger', 's-other': 'muted', 'p-draft': 'muted', 'p-approved': 'ok' }`.
- Test 16 asserts `!COLOR_LITERAL.test(pageJs)`, `!pageJs.includes('style=')`,
  and the same for the `toString()` of every export of
  `board-render.mjs`. The `&#39;` entity in `esc` has two hex digits and
  does not match `{3,8}`.

### D8 — `selftest.sh` step 11

The `node --check` line becomes a loop over `board.mjs`,
`board-model.mjs`, `board-render.mjs`, and `board-ui/page.js`. `page.js`
is a script, not a module, and `node --check` parses it as one. The glob
`*.test.mjs` stays. No new step.

## Implementation

All paths are under
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/`.

### Files

| File | Change | Lines (about) |
|---|---|---|
| `board-model.mjs` | New. Lines 19 to 400 of `board.mjs`, moved unchanged, with the constants of D1 and a header comment. | +380 |
| `board-render.mjs` | New. `renderBacklog` and `feedText` moved; `header()` status chip (D5); `renderAgents` (D6). | +140 |
| `board-ui/page.html` | New. The skeleton of D4 with the `@@CSS@@` and `@@SCRIPT@@` markers, the favicon, the theme button. | +30 |
| `board-ui/page.css` | New. Tokens, base, chips, buttons, cards, top bar, grid, Agents card, step strip, backlog tree, media query. | +150 |
| `board-ui/page.js` | New. The current `PAGE_SCRIPT` IIFE minus the render prelude, with `renderMeta`, `renderNow`, `renderAgentsCard`, the theme toggle, the Show all listener. | +130 |
| `board.mjs` | Remove lines 19 to 400 except the entry constants; remove `PAGE_STYLE`, `PAGE_SCRIPT`, `PAGE`; add the imports and re-exports (D1), `renderPrelude` (D2), `uiFile`, `fillMarker`, the three constants (D3). | about -560, +40 |
| `board.test.mjs` | Import block: pure functions from `board-model.mjs` and `board-render.mjs`; `loadSnapshot`, `serve`, `ownsProject`, `isTrustedComponent`, `TAIL_CAP_BYTES`, `SSE_CLIENT_CAP` from `board.mjs`. The new tests of the Validation section. | +220 |
| `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh` | Step 11: `node --check` loop (D8). | +3 |
| `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md` | Entry under `[Unreleased]`. Technical Writer at Gate 2. | — |

No change to `board.md`, `plugin.json`, `marketplace.json`, `hooks.json`,
or the README. The plugin ships its whole directory, so the new files
under `scripts/board-ui/` ship with no list to edit.

### Order, with checkpoint commits

Each step ends GREEN, then VERIFY per
`constellation:test-verified-development`, then one commit. The commit
body records the VERIFY evidence.

1. **Split the modules.** Create `board-model.mjs` and `board-render.mjs`
   by a move. Add the imports and `export *` to `board.mjs`. Change the
   test import block. Add tests 1 and 2.
   Commit: `refactor: split board.mjs into model, render, and entry modules (task 022)`.
2. **Move the page out.** Create `board-ui/page.html`, `page.css`,
   `page.js` with the current text, unchanged except the markers and the
   prelude removal. Add `uiFile`, `fillMarker`, `renderPrelude`, and the
   three constants. Add tests 3, 4, 5. Extend `selftest.sh` step 11.
   Commit: `refactor: board page reads board-ui/page.html, page.css, and page.js (task 022)`.
3. **Design system and layout.** Rewrite `page.css` per D4 and D5.
   Update `page.html` and `page.js` for the top bar, the theme toggle,
   the `chip` class, and the ids. Add tests 12 to 16.
   Commit: `feat: board design tokens, light theme, toggle, and two-column layout (task 022)`.
4. **Bounded Agents panel.** Add `renderAgents` and its page wiring.
   Add tests 6 to 11.
   Commit: `feat: board Agents card scrolls, pins running agents, caps finished rows at 20 (task 022)`.
5. **Manual browser check** (Validation). Fix what it finds, then commit
   under `fix:` when a fix was needed.

### Data flow

- Start: `board.mjs` import → `board-render.mjs` exports → `renderPrelude`
  → `uiFile` × 3 → `fillMarker` × 2 → `PAGE`, `PAGE_CSP`.
- Request: `GET /` → `PAGE` with `content-security-policy: PAGE_CSP`.
- Page: `EventSource('/events')` → `snap` → `render()` → `renderMeta`,
  `renderNow` (page.js), `renderBacklog(snap.tree, esc)`,
  `renderAgents({ agents: snap.agents, showAll, hhmm, fmtDur }, esc)` plus
  the Activity list from `snap.feed` and `feedText` → `innerHTML` →
  `tick()` updates `[data-since]` every second.
- Theme: CSS media query → `data-theme` from `localStorage` at start →
  click on `#theme` → attribute and storage.

## Validation

Follow `constellation:test-verified-development`. For the moved code
(steps 1 and 2), the VERIFY gate is the stash variant: stash the new
files, confirm the import failures. For the new render and CSS code, use
the mutation variant: apply the mutation, run the file, confirm the named
test fails for the intended reason, restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none. Fixtures are in-memory snapshots, temporary directories,
  and real local sockets, as today.

All 138 current tests pass on `main` at d91433e and on the branch at
885e54b.

**Automated Test**: the split and the page assembly

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 1 | `board.mjs: re-exports every 1.3.4 name` | `import * as board from './board.mjs'`; `Object.keys(board)` includes each of the 23 names of the current test import block, `emptySnapshot`, and `renderAgents`. | Remove one `export *` line (the model names vanish). | 2 |
| 2 | `board-model.mjs: imports nothing from node` | The file text holds no `from 'node:` and no `import.meta`. | Add `import fs from 'node:fs'`. | 2 |
| 3 | `serve: the page serves page.css and page.js byte for byte` | `GET /`; the `<style>` text equals `page.css` from disk; the `<script>` text ends with `page.js` from disk and starts with `renderBacklog.toString()`. The current CSP test stays and passes. | Serve a trimmed `page.css` (`.trim()`), or drop the prelude. | 1 |
| 4 | `board-render.mjs: every export is a function that runs with no module scope` | For each export: `typeof fn === 'function'`, and `new Function('return ' + fn.toString())()` is a function. `renderAgents` with a fixture gives the same output as the isolated copy (as the current `renderBacklog` test does). | Export a constant; or make `renderAgents` read a module constant `AGENT_ROWS`. | 1 |
| 5 | `serve: the page holds one script, one style, and the script compiles` | One `<script>` block, one `<style>` block; `new Function(script)` does not throw; the CSP holds exactly one `sha256-` in `script-src` and one in `style-src`. | Add a second `<script>` to `page.html`; or put `</script>` in a `page.js` string. | 1 |

**Automated Test**: `renderAgents`

Fixture: `agentsFixture(running, finished)` builds `agents` newest first
with `start` values one minute apart, `agent_type` `constellation:sdet`,
and `durationSec` on finished rows. `view` carries the stub formatters
of D6. `esc` is the test helper that exists.

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 6 | `renderAgents: no agents renders an empty string` | `renderAgents({ agents: [], showAll: false, hhmm, fmtDur }, esc)` equals `''`. | Return the `Running` block on empty input. | 3 |
| 7 | `renderAgents: 60 agents show the running group first, then the newest 20, then Show all (58)` | 2 running + 58 finished. The `.running` block holds 2 `<li>` and comes before the finished list. The finished list holds 20 `<li>`, and the first one carries the newest finished start. The button text is `Show all (58)`. | `slice(0, 21)`; or sort finished oldest first; or `finished.length - shown.length` in the button. | 3 |
| 8 | `renderAgents: showAll renders every finished row and no button` | `showAll: true`: 58 finished `<li>`, no `data-action="show-all"`. | Ignore `view.showAll`. | 3 |
| 9 | `renderAgents: exactly 20 finished rows show no button` | 0 running + 20 finished: 20 `<li>`, no button. 21 finished: 20 `<li>` and `Show all (21)`. | `>=` in the button condition. | 3 |
| 10 | `renderAgents: agent types and formatted times are escaped` | `agent_type: '<img src=x onerror=alert(1)>'` and a stub `hhmm` that returns `<svg>`: the output holds `&lt;img` and `&lt;svg`, and no `<img`, no `<svg`. | Drop `esc` on the name or on the time. | 3 |
| 11 | `renderAgents: a running row carries data-since and the run class` | The running `<li>` holds `data-since="<start>"`, `data-prefix="running "`, and `class="run"`; a finished row holds none of them and holds the stub duration. | Mark every row `running`. | 3 |

**Automated Test**: tokens and themes (criterion 6, D7)

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 12 | `page.css: every color outside the token blocks is a var()` | `declarationsOnly(withoutTokens(css))` holds no hex, `rgb(`, `rgba(`, `hsl(`, `hsla(`. | Add `color: #fff` to `.btn`. | 6 |
| 13 | `page.css: the token blocks hold the ten §4.1 values for dark and light` | For each token, `--name: <dark>` appears once in the `:root {` block and `--name: <light>` appears in both light blocks. | Change one light value in one copy. | 6 |
| 14 | `page.css: the status chips map to the §4.2 tokens` | For each of the nine chip classes, a rule whose selector holds `.chip.<class>` has `var(--<token>)` in its body. | Point `s-done` at `--warn`. | 6 |
| 15 | `page.css: the Agents card is bounded, scrolls, and is sticky only from 1100 px` | The `#agents-card` rule holds `max-height: calc(100vh - 96px)`; `#agents` holds `overflow: auto` and `min-height: 0`; `position: sticky` for `#agents-card` appears only inside `@media (min-width: 1100px)`. | Remove the `max-height`; or move the sticky rule out of the media query. | 3, 4 |
| 16 | `page.js and the render functions hold no color literal and no style attribute` | `COLOR_LITERAL` does not match `page.js` nor the `toString()` of any `board-render.mjs` export; neither holds `style=`. | Add `style="color:#fff"` to a row in `renderAgents`. | 6 |

Count: 16 new tests. `board.test.mjs` goes from 138 to 154 tests.

**MANUAL TEST**: the layout, the scroll, and the theme in a browser
(spec §11, once per phase)

- **Why manual**: viewport layout, sticky position, scroll bounds, OS
  theme, and `localStorage` need a browser. `node --test` has none, and
  the project adds no browser dependency.
- **Preconditions**: the branch at step 4 or later; Chrome; a fixture
  project in the scratchpad with 60 agents, built by the script below.
  The orchestrator runs the script, starts the board, and drives Chrome
  with the `claude-in-chrome` tools (`resize_window`, `navigate`,
  `computer` screenshots, `javascript_tool` for `localStorage`).

```bash
FIX="$SCRATCH/board-fixture"; TPL=/Users/joaooliveira/study/constellation-harness/plugins/constellation/templates
mkdir -p "$FIX/.constellation/state" "$FIX/.constellation/metrics" "$FIX/.constellation/tasks" "$FIX/.constellation/features"
echo '{}' > "$FIX/.constellation/config.json"; cp "$TPL/tracks.json" "$FIX/.constellation/"
cat > "$FIX/.constellation/state/current-workflow.json" <<'EOF'
{ "track": "planned", "branch": "feat/022-board-ui-source-split-and-layout", "task": "022-board-ui-source-split-and-layout.md", "currentStep": "parallel-gate-1", "completedSteps": ["architect", "devops-branch", "engineer", "lint-gate"], "reviewLoopCount": 1, "startedAt": "2026-10-19T09:00:00Z", "lastUpdatedAt": "2026-10-19T10:00:00Z" }
EOF
node -e '
const n = 60, lines = [];
for (let i = 0; i < n; i++) {
  const t = (m) => new Date(Date.UTC(2026, 9, 19, 9, m)).toISOString();
  const id = i.toString(16).padStart(8, "0");
  lines.push(JSON.stringify({ ts: t(i), event: "SubagentStart", agent_id: id, agent_type: i % 3 ? "constellation:sdet" : "constellation:code-reviewer" }));
  if (i < n - 2) lines.push(JSON.stringify({ ts: t(i + 1), event: "SubagentStop", agent_id: id, agent_type: "constellation:sdet" }));
  lines.push(JSON.stringify({ ts: t(i), event: "PostToolUse", tool_name: "Edit", file: ".constellation/tasks/0" + i + ".md" }));
}
require("fs").writeFileSync(process.argv[1] + "/.constellation/metrics/events.jsonl", lines.join("\n") + "\n");
' "$FIX"
printf -- '---\nstatus: refined\ntype: feature\nfeature: F001-a.md\n---\n# Task %s\n' 022 > "$FIX/.constellation/tasks/022-board-ui-source-split-and-layout.md"
printf -- '---\nstatus: active\n---\n# Feature a\n' > "$FIX/.constellation/features/F001-a.md"
node /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs "$FIX" --port 4499
```

- **Steps**:
  1. Open `http://127.0.0.1:4499` at 1280 px wide. Confirm: Now and
     Agents side by side; the Agents card ends above the page bottom; its
     body scrolls; the `Running` group with 2 rows stays visible while
     the finished rows scroll under it; 20 finished rows and
     `Show all (58)`; the Activity list under the rows, 30 entries.
  2. Scroll the page. Confirm that the Agents card stays in view
     (sticky) while the backlog scrolls.
  3. Click `Show all (58)`. Confirm 58 rows and no button. Edit
     `events.jsonl` (append one line). Confirm the re-render keeps the 58
     rows.
  4. Resize to 390 px. Confirm: the cards stack, Agents under Now; the
     Agents card does not stick; `document.documentElement.scrollWidth`
     equals `window.innerWidth` (no horizontal scroll); the Agents card
     still scrolls inside.
  5. Set the OS to light, or run `matchMedia` emulation in DevTools.
     Confirm the light tokens (`--bg` `#f6f7f9`) with no stored choice.
  6. Click the theme button. Confirm the switch to dark, then reload and
     confirm dark stays. Click again, reload, confirm light.
  7. Confirm no console error, and that the CSP blocks nothing (the
     console shows no `Refused to` line).
- **Expected**: every confirmation above holds. Any `Refused to` line in
  the console or any horizontal scroll bar fails the test.
- **Observability**: the console, the computed style of
  `document.documentElement` (`getComputedStyle(...).getPropertyValue('--bg')`),
  `localStorage.getItem('board-theme')`.

## Integration Touchpoints

- **Plugin monitor and `/constellation:board`** - Could break: the entry
  file name or its CLI - Validation: `board.mjs` keeps its name, its
  arguments, and `--help`; the CLI tests pass with no edit.
- **Plugin packaging** - Could break: `board-ui/` does not ship - Validation:
  the plugin source is the directory; `git ls-files` after step 2 lists
  the three files; a dev install resolves them through `import.meta.url`.
- **CSP** - Could break: a hash that does not match the served text -
  Validation: the current CSP test and test 3; the manual check watches
  for `Refused to` lines.
- **Current tests (138)** - Could break: a moved function changes
  behavior; a markup pin in `renderBacklog` - Validation: the move is a
  copy with no edit; the only `renderBacklog` edit is `header()`, which
  no test pins; the `badge` class stays.
- **Snapshot wire format** - Could break: nothing; the snapshot does not
  change - Validation: `loadSnapshot` tests pass with no edit.
- **Tasks 023 and 026** - Could break: both edit `page.js`, `page.css`,
  and `board-render.mjs` - Validation: 023 follows 022 on `main`; 026
  follows 022 as well and runs after 023 in the planned sequence.
- **`selftest.sh`** - Could break: `node --check` on `page.js` fails for
  a script-only construct - Validation: `page.js` is a plain IIFE; step
  11 runs in CI on Node 24.

## Risks

1. **A current test pins markup that the split changes** - Impact: M -
   Likelihood: L - Mitigation: `renderBacklog` and `feedText` move with
   no edit except the `header()` chip; step 1 runs the suite before any
   other change.
2. **The light tokens drift between their two copies** - Impact: L -
   Likelihood: M - Mitigation: test 13 pins both copies to the §4.1
   values.
3. **The token check misses a literal or flags a false one** - Impact: L -
   Likelihood: M - Mitigation: D7 removes selectors and at-rule preludes
   first; the message prints the match; the manual check views both
   themes.
4. **`page.js` grows into the next template string** - Impact: M -
   Likelihood: M - Mitigation: D2 rule: a function with a fixture lives in
   `board-render.mjs`; 023 moves `renderNow` out; the 50-line budget per
   function.
5. **The sticky `Running` group hides rows under it on a short viewport** -
   Impact: L - Likelihood: L - Mitigation: the group holds the running
   rows only, at most a few; the manual check at 390 px looks at it.
6. **`color-mix` is unsupported in an old browser** - Impact: L -
   Likelihood: L - Mitigation: the fallback is no ring; the current step
   still has its accent border.

## Logging

The board has no log file. Its observability is the snapshot, the page,
and the process exit.

- A missing `board-ui` file: the import throws
  `ENOENT ... board-ui/page.css` and the process exits non-zero, in
  `--quiet` as in the foreground. A missing marker throws
  `board: page.html must hold @@CSS@@ exactly once`.
- A CSP mismatch: the browser console prints `Refused to execute inline
  script` or `Refused to apply inline style`; the page stays empty.
- `localStorage` refusal: silent by design, inside `try/catch`; the page
  follows the OS theme.
- No user IDs exist in this local, single-user tool.

## Release notes for the Technical Writer

Add to `## [Unreleased]` in
`/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`. Do not
bump `plugin.json` or `marketplace.json`; task 026 cuts 1.4.0.

Under `### Added`:

- **The board has a design system with dark and light themes** (#022).
  Ten color tokens, the system font stack, cards, chips, and buttons.
  Dark is the default. The page follows the OS theme and a toggle in the
  top bar keeps a manual choice in `localStorage`.

Under `### Changed`:

- **The Agents card fits the viewport** (#022). It is at most
  `calc(100vh - 96px)` tall and scrolls inside. Running agents stay
  pinned at the top. The finished list shows the newest 20 rows and a
  `Show all (n)` button. The Activity list sits in the same scroll region.
- **Two-column layout from 1100 px** (#022). Now and Agents sit side by
  side with a sticky Agents card. Below that, the cards stack and the
  page has no horizontal scroll at phone width.
- **The board source is split** (#022). `board.mjs` stays the entry and
  re-exports `board-model.mjs` (snapshot functions) and
  `board-render.mjs` (render functions). The page HTML, CSS, and JS live
  in `scripts/board-ui/`. The CSP hashes still cover the served text.
- The board test count grows from 138 to 154.

## Open Questions

None blocking. One note for the PM, not a question: the `badge` class
stays on the tree rows in 022 because two current tests pin it; task 024
removes it with the tree.
