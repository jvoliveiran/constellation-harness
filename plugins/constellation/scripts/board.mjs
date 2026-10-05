#!/usr/bin/env node
// Constellation Harness — board (phase 1): live workflow panel on localhost.
//
// Read-only. Watches .constellation/state/ and .constellation/metrics/ of one project,
// resolves the active track against .constellation/tracks.json with the same rules as the
// statusline, and serves one HTML page that updates over Server-Sent Events.
//
//   node board.mjs [projectDir] [--port 4411]
//
// Zero npm dependencies. Node 20 or later. Binds to 127.0.0.1 only.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 4411;
const EVENT_TAIL = 200;
const DEBOUNCE_MS = 150;
const POLL_MS = 2000;
const LOOP_CAP = 3;

// ---------------------------------------------------------------------------
// Pure functions (tested in board.test.mjs)
// ---------------------------------------------------------------------------

/**
 * Resolve the active track's steps against the track map. Ports the jq logic of
 * templates/statusline.sh so the banner, the statusline, and the board agree.
 */
export function resolveSteps(state, tracks, config) {
  const track = state?.track ?? '?';
  const cur = state?.currentStep ?? '';
  const cmv = config?.crossModelValidation ?? {};
  const planReviewOn = cmv.enabled === true && Array.isArray(cmv.steps) && cmv.steps.includes('plan-review');

  const base = (tracks?.tracks?.[track] ?? []).filter(
    (s) => s.optionalIf == null || (s.optionalIf === 'plan-review' && planReviewOn),
  );

  let steps = base;
  const extra = tracks?.extraSteps?.['post-pr'];
  if (cur === 'post-pr' && extra) {
    const prIdx = base.findIndex((s) => s.id === 'devops-pr');
    const i = prIdx >= 0 ? prIdx : base.length - 1;
    steps = [...base.slice(0, i + 1), { id: 'post-pr', ...extra }, ...base.slice(i + 1)];
  }

  const ids = steps.map((s) => s.id);
  const N = steps.length;
  const completed = Array.isArray(state?.completedSteps) ? state.completedSteps : [];
  const doneMax = completed.reduce((m, id) => Math.max(m, ids.indexOf(id)), -1);
  const curIdx = ids.indexOf(cur);
  const anchor = Math.max(doneMax, curIdx);

  const modifiers = [];
  if (state?.waitingOn === 'user') modifiers.push('⛔ awaiting your decision');
  if ((state?.reviewLoopCount ?? 0) > 0) modifiers.push(`🔁 loop ${state.reviewLoopCount}/${LOOP_CAP}`);

  if (N === 0) {
    return { track, steps: [], n: null, N: 0, unknownCurrent: cur || null, modifiers };
  }

  if (curIdx < 0 && cur !== '') {
    // Unknown current step (state written by another harness version): render it raw.
    return {
      track,
      steps: steps.map((s, i) => ({ ...s, state: i <= doneMax ? 'done' : 'pending' })),
      n: null,
      N,
      unknownCurrent: cur,
      modifiers,
    };
  }

  return {
    track,
    steps: steps.map((s, i) => ({
      ...s,
      state: i < anchor ? 'done' : i === anchor ? 'current' : 'pending',
    })),
    n: anchor >= 0 ? anchor + 1 : 0,
    N,
    unknownCurrent: null,
    modifiers,
  };
}

/** Parse JSONL text into objects, skipping lines that do not parse. */
export function parseEventLines(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // partial or corrupt line — skip
    }
  }
  return out;
}

/**
 * Pair SubagentStart/SubagentStop by agent_id. Returns agents and other activity,
 * both newest first. Duplicate (agent_id, event) lines collapse.
 */
export function pairEvents(events) {
  const agents = new Map();
  const activity = [];
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (e.event === 'SubagentStart' || e.event === 'SubagentStop') {
      const key = e.agent_id ?? `${e.agent_type ?? 'agent'}@${e.ts}`;
      const a = agents.get(key) ?? { agent_id: e.agent_id ?? null, agent_type: e.agent_type ?? null, start: null, end: null, running: false };
      if (e.event === 'SubagentStart') {
        if (a.start == null) a.start = e.ts ?? null;
        if (a.agent_type == null) a.agent_type = e.agent_type ?? null;
        if (a.end == null) a.running = true;
      } else {
        if (a.end == null) a.end = e.ts ?? null;
        a.running = false;
      }
      agents.set(key, a);
    } else {
      activity.push({ ts: e.ts ?? null, event: e.event ?? null, file: e.file ?? null, tool_name: e.tool_name ?? null, agent_type: e.agent_type ?? null });
    }
  }
  const list = [...agents.values()].map((a) => ({ ...a, durationSec: durationSeconds(a.start, a.end) }));
  list.sort((x, y) => (y.start ?? '').localeCompare(x.start ?? ''));
  activity.sort((x, y) => (y.ts ?? '').localeCompare(x.ts ?? ''));
  return { agents: list, activity };
}

function durationSeconds(start, end) {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

/** Token delta as the orchestrator defines it: accumulated + (sessionStart − lastKnownRemaining). */
export function tokenDelta(tokens) {
  if (!tokens || typeof tokens !== 'object') return null;
  const { sessionStart, lastKnownRemaining, accumulated = 0 } = tokens;
  if (typeof sessionStart !== 'number' || typeof lastKnownRemaining !== 'number') return null;
  return accumulated + (sessionStart - lastKnownRemaining);
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

function paths(projectDir) {
  const root = path.join(projectDir, '.constellation');
  return {
    root,
    stateDir: path.join(root, 'state'),
    metricsDir: path.join(root, 'metrics'),
    state: path.join(root, 'state', 'current-workflow.json'),
    tracks: path.join(root, 'tracks.json'),
    config: path.join(root, 'config.json'),
    events: path.join(root, 'metrics', 'events.jsonl'),
  };
}

function readJson(file) {
  // { value, missing, error }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { value: null, missing: e.code === 'ENOENT', error: e.code === 'ENOENT' ? null : String(e.message) };
  }
  try {
    return { value: JSON.parse(text), missing: false, error: null };
  } catch (e) {
    return { value: null, missing: false, error: `parse: ${e.message}` };
  }
}

function readTail(file, maxLines) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    return lines.slice(Math.max(0, lines.length - maxLines - 1)).join('\n');
  } catch {
    return '';
  }
}

/**
 * Build the snapshot the page renders. A parse error on the state file keeps the
 * previous snapshot's state and sets stale: true. A missing state file is normal.
 */
export function loadSnapshot(projectDir, prev = null) {
  const p = paths(projectDir);
  const errors = [];

  const tracksR = readJson(p.tracks);
  const configR = readJson(p.config);
  const stateR = readJson(p.state);
  if (tracksR.error) errors.push(`tracks.json: ${tracksR.error}`);
  if (configR.error) errors.push(`config.json: ${configR.error}`);

  let state = null;
  let stale = false;
  if (stateR.value) {
    state = stateR.value;
  } else if (!stateR.missing) {
    errors.push(`current-workflow.json: ${stateR.error}`);
    state = prev?.state ?? null;
    stale = true;
  }

  const tracks = tracksR.value ?? { tracks: {}, extraSteps: {} };
  const progress = state ? resolveSteps(state, tracks, configR.value) : null;
  const { agents, activity } = pairEvents(parseEventLines(readTail(p.events, EVENT_TAIL)));

  return {
    projectDir,
    at: new Date().toISOString(),
    hasTracks: !!tracksR.value,
    initialized: !configR.missing,
    state,
    progress,
    tokenDelta: state ? tokenDelta(state.tokens) : null,
    agents,
    activity,
    stale,
    errors,
  };
}

/** fs.watch on the known directories plus an mtime poll as the floor. */
function watch(projectDir, onChange) {
  const p = paths(projectDir);
  const watchers = new Map();
  let timer = null;

  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, DEBOUNCE_MS);
  };

  const arm = (dir) => {
    if (watchers.has(dir) || !fathomDir(dir)) return;
    try {
      const w = fs.watch(dir, { persistent: true }, () => {
        fire();
        armAll(); // a subdirectory may have appeared
      });
      w.on('error', () => {
        watchers.delete(dir);
        try { w.close(); } catch { /* ignore */ }
      });
      watchers.set(dir, w);
    } catch {
      // directory vanished between the check and the watch — the poll covers it
    }
  };
  const armAll = () => [p.root, p.stateDir, p.metricsDir].forEach(arm);
  armAll();

  let sig = signature(p);
  const poll = setInterval(() => {
    armAll();
    const next = signature(p);
    if (next !== sig) {
      sig = next;
      fire();
    }
  }, POLL_MS);

  return () => {
    clearInterval(poll);
    for (const w of watchers.values()) { try { w.close(); } catch { /* ignore */ } }
  };
}

function fathomDir(dir) {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

function signature(p) {
  const stamp = (f) => {
    try { const s = fs.statSync(f); return `${s.mtimeMs}:${s.size}`; } catch { return '-'; }
  };
  return [p.state, p.events, p.tracks, p.config].map(stamp).join('|');
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function serve(port, getSnapshot, subscribe) {
  const clients = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(PAGE);
      return;
    }
    if (url.pathname === '/api/snapshot') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(getSnapshot()));
      return;
    }
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(getSnapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  });

  subscribe((snap) => {
    const frame = `data: ${JSON.stringify(snap)}\n\n`;
    for (const c of clients) c.write(frame);
  });
  const keepalive = setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15000);
  server.on('close', () => clearInterval(keepalive));
  return server;
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Constellation board</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Ctext y=%2726%27 font-size=%2726%27%3E%F0%9F%8C%8C%3C/text%3E%3C/svg%3E">
<style>
  :root { color-scheme: dark; --bg:#0f1117; --panel:#171a23; --line:#262a36; --fg:#e6e6e6; --dim:#8b91a1; --ok:#5ad38a; --cur:#ffcb47; --warn:#ff6b6b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif; padding:0 16px 32px; }
  header { display:flex; flex-wrap:wrap; align-items:baseline; gap:12px; padding:18px 0 12px; border-bottom:1px solid var(--line); }
  h1 { font-size:18px; margin:0; }
  .meta { color:var(--dim); font-size:12px; display:flex; gap:12px; flex-wrap:wrap; }
  .badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:12px; border:1px solid var(--line); color:var(--dim); }
  .badge.warn { color:var(--warn); border-color:var(--warn); }
  main { display:grid; grid-template-columns: 2fr 1fr; gap:16px; margin-top:16px; }
  @media (max-width: 820px) { main { grid-template-columns: 1fr; } }
  section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin:0 0 12px; }
  .strip { display:flex; flex-wrap:wrap; gap:8px; }
  .step { flex:1 1 90px; min-width:90px; border:1px solid var(--line); border-radius:8px; padding:8px; text-align:center; opacity:.55; }
  .step .e { font-size:20px; }
  .step .l { font-size:12px; color:var(--dim); }
  .step.done { opacity:.9; border-color:var(--ok); }
  .step.done .l { color:var(--ok); }
  .step.current { opacity:1; border-color:var(--cur); box-shadow:0 0 0 2px rgba(255,203,71,.18); }
  .step.current .l { color:var(--cur); font-weight:600; }
  .mods { margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; }
  .mods .badge { color:var(--cur); border-color:var(--cur); }
  .facts { margin-top:14px; display:grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap:10px; }
  .fact .k { font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.05em; }
  .fact .v { font-size:15px; font-variant-numeric: tabular-nums; }
  .empty { color:var(--dim); padding:24px 0; text-align:center; }
  ul { list-style:none; margin:0; padding:0; }
  li { display:flex; gap:10px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px; align-items:baseline; }
  li:last-child { border-bottom:0; }
  .t { color:var(--dim); font-variant-numeric: tabular-nums; min-width:62px; }
  .run { color:var(--cur); }
  .dur { color:var(--dim); margin-left:auto; font-variant-numeric: tabular-nums; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; color:var(--dim); }
  .errs { color:var(--warn); font-size:12px; margin-top:10px; }
</style>
</head>
<body>
<header>
  <h1>🌌 Constellation board</h1>
  <div class="meta" id="meta"></div>
</header>
<main>
  <section><h2>Now</h2><div id="now"></div></section>
  <section><h2>Agents</h2><div id="feed"></div></section>
</main>
<script>
(function () {
  var snap = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
  var hhmm = function (iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? '—' : d.toTimeString().slice(0, 8); };
  var fmtDur = function (sec) { if (sec == null) return ''; if (sec < 60) return sec + 's'; if (sec < 3600) return Math.floor(sec/60) + 'm ' + (sec%60) + 's'; return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm'; };
  var since = function (iso) { if (!iso) return null; var ms = Date.now() - Date.parse(iso); return isNaN(ms) ? null : Math.max(0, Math.round(ms/1000)); };
  var fmtTok = function (n) { if (n == null) return '—'; return n >= 1e6 ? (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n/1e3) + 'k' : String(n); };

  function render() {
    if (!snap) return;
    var meta = '<span><code>' + esc(snap.projectDir) + '</code></span>';
    if (!snap.initialized) meta += '<span class="badge warn">not initialized — no .constellation/config.json</span>';
    if (!snap.hasTracks) meta += '<span class="badge warn">tracks.json missing</span>';
    if (snap.stale) meta += '<span class="badge warn">stale — state file unreadable, showing last good</span>';
    meta += '<span>updated ' + hhmm(snap.at) + '</span>';
    document.getElementById('meta').innerHTML = meta;

    var now = '';
    var s = snap.state, p = snap.progress;
    if (!s) {
      now = '<div class="empty">No workflow in flight<br><code>watching ' + esc(snap.projectDir) + '/.constellation/</code></div>';
    } else {
      var head = '<div class="meta" style="margin-bottom:12px">'
        + '<span class="badge">' + esc(p.track) + (p.n != null ? ' ' + p.n + '/' + p.N : '') + '</span>'
        + (s.branch ? '<span><code>' + esc(s.branch) + '</code></span>' : '')
        + (s.task ? '<span>task <code>' + esc(s.task) + '</code></span>' : '')
        + '</div>';
      var strip = '<div class="strip">';
      p.steps.forEach(function (st) {
        strip += '<div class="step ' + st.state + '"><div class="e">' + esc(st.emoji || '⚙️') + '</div><div class="l">' + esc(st.label || st.id) + '</div></div>';
      });
      if (p.unknownCurrent) strip += '<div class="step current"><div class="e">⚙️</div><div class="l">' + esc(p.unknownCurrent) + '</div></div>';
      if (!p.steps.length && !p.unknownCurrent) strip += '<div class="empty">track <code>' + esc(p.track) + '</code> has no steps in tracks.json</div>';
      strip += '</div>';
      var mods = p.modifiers.length ? '<div class="mods">' + p.modifiers.map(function (m) { return '<span class="badge">' + esc(m) + '</span>'; }).join('') + '</div>' : '';
      var facts = '<div class="facts">'
        + fact('elapsed', fmtDur(since(s.startedAt)) || '—')
        + fact('last save', hhmm(s.lastUpdatedAt))
        + fact('tokens spent', fmtTok(snap.tokenDelta))
        + fact('review loops', s.reviewLoopCount != null ? s.reviewLoopCount : '—')
        + fact('PR', s.prNumber != null ? '#' + s.prNumber : '—')
        + fact('model profile', s.modelProfile || '—')
        + '</div>';
      now = head + strip + mods + facts;
    }
    if (snap.errors && snap.errors.length) now += '<div class="errs">' + snap.errors.map(esc).join('<br>') + '</div>';
    document.getElementById('now').innerHTML = now;

    var feed = '';
    if (!snap.agents.length && !snap.activity.length) {
      feed = '<div class="empty">No events yet<br><code>.constellation/metrics/events.jsonl</code></div>';
    } else {
      feed += '<ul>';
      snap.agents.forEach(function (a) {
        var dur = a.running ? '<span class="dur run">running ' + fmtDur(since(a.start)) + '</span>' : '<span class="dur">' + fmtDur(a.durationSec) + '</span>';
        feed += '<li><span class="t">' + hhmm(a.start) + '</span><span' + (a.running ? ' class="run"' : '') + '>' + esc((a.agent_type || 'agent').replace(/^constellation:/, '')) + '</span>' + dur + '</li>';
      });
      feed += '</ul>';
      if (snap.activity.length) {
        feed += '<h2 style="margin-top:16px">Activity</h2><ul>';
        snap.activity.slice(0, 30).forEach(function (e) {
          var what = e.event === 'PostToolUse' ? (e.tool_name || 'edit') + ' <code>' + esc(e.file || '') + '</code>' : esc(e.event || '');
          feed += '<li><span class="t">' + hhmm(e.ts) + '</span><span>' + what + '</span></li>';
        });
        feed += '</ul>';
      }
    }
    document.getElementById('feed').innerHTML = feed;
  }
  function fact(k, v) { return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

  var es = new EventSource('/events');
  es.onmessage = function (ev) { try { snap = JSON.parse(ev.data); render(); } catch (e) { /* ignore */ } };
  es.onerror = function () { var m = document.getElementById('meta'); if (m && snap) m.innerHTML += '<span class="badge warn">disconnected — retrying</span>'; };
  setInterval(render, 1000);
})();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { projectDir: process.cwd(), port: DEFAULT_PORT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) out.port = Number(a.slice(7));
    else out.projectDir = path.resolve(a);
  }
  return out;
}

function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    console.error(`board: Node 20 or later required (found ${process.versions.node})`);
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node board.mjs [projectDir] [--port N]\n  Read-only live panel of the in-flight Constellation workflow.');
    process.exit(0);
  }
  if (!Number.isInteger(args.port) || args.port <= 0) {
    console.error('board: --port must be a positive integer');
    process.exit(1);
  }
  if (!fathomDir(path.join(args.projectDir, '.constellation'))) {
    console.error(`board: ${args.projectDir}/.constellation not found — pass an initialized project directory`);
    process.exit(1);
  }

  let snapshot = loadSnapshot(args.projectDir);
  const listeners = new Set();
  const refresh = () => {
    snapshot = loadSnapshot(args.projectDir, snapshot);
    for (const l of listeners) l(snapshot);
  };
  const stopWatch = watch(args.projectDir, refresh);

  const server = serve(args.port, () => snapshot, (l) => listeners.add(l));
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`board: port ${args.port} is in use — pass --port <other>`);
    } else {
      console.error(`board: ${e.message}`);
    }
    stopWatch();
    process.exit(1);
  });
  server.listen(args.port, '127.0.0.1', () => {
    console.log(`🌌 Constellation board  http://127.0.0.1:${args.port}  (watching ${args.projectDir}/.constellation)`);
  });

  const shutdown = () => { stopWatch(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
