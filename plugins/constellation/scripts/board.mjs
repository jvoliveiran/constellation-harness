#!/usr/bin/env node
// Constellation Harness — board: live workflow panel and backlog tree on localhost.
//
// Read-only. Watches .constellation/ of one project: state/, metrics/, and the epics/,
// features/, tasks/, and plans/ directories. Resolves the active track against
// .constellation/tracks.json with the same rules as the statusline, and serves one HTML
// page that updates over Server-Sent Events.
//
//   node board.mjs [projectDir] [--port N] [--quiet] [--probe]
//
// Zero npm dependencies. Node 20 or later. Binds to 127.0.0.1 only.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_CAP_BYTES, resolveSteps, parseEventLines, pairEvents, tokenDelta, tokensFact, attributeAgents, toNode, buildTree, diffStatuses, collapseBurst, mergeFeed, emptySnapshot, safeRefresh } from './board-model.mjs';
import { createSessionReader } from './board-session.mjs';
import * as render from './board-render.mjs';

export * from './board-model.mjs';
export * from './board-session.mjs';
export * from './board-render.mjs';

const DEFAULT_PORT = 4411;
const MAX_PORT = 65535;
export const SSE_CLIENT_CAP = 32;
const EVENT_TAIL = 200;
const DEBOUNCE_MS = 150;
const POLL_MS = 1500;
const TRANSITION_CAP = 50;
const STANDBY_MS = 5000;
const SESSION_POLL_MS = 5000;
const JSON_CAP_BYTES = 1024 * 1024;
export const TAIL_CAP_BYTES = 256 * 1024;
const ROOT_OUTSIDE = '.constellation resolves outside the project';
const PROBE_TIMEOUT_MS = 1000;
const PROBE_MAX_BYTES = 8 * 1024 * 1024;
// A projectDir that may reach Claude's context: absolute, at most 256 characters, no control
// characters, quotes, backticks, or shell metacharacters. Spaces stay, macOS paths carry them.
const SAFE_DIR = /^\/[A-Za-z0-9._@+~\/ -]{0,255}$/;

/**
 * Judge the reply of a port probe. Only a projectDir that passes SAFE_DIR survives: every other
 * byte of the reply is dropped, because the reply is untrusted data.
 */
export function classifyProbe(body, here) {
  let dir;
  try { dir = JSON.parse(body)?.projectDir; } catch { return { kind: 'foreign' }; }
  if (typeof dir !== 'string' || !SAFE_DIR.test(dir)) return { kind: 'foreign' };
  return dir === here ? { kind: 'running' } : { kind: 'other', dir };
}

/** The text that /constellation:board prints for one probe result. */
export function probeText(result, port, boardFile) {
  const next = `Start the board for this project on another port:\nnode "${boardFile}" --port ${port < MAX_PORT ? port + 1 : port - 1}\n`;
  if (result.kind === 'running') return `Board running: http://127.0.0.1:${port}\n`;
  if (result.kind === 'other') {
    const holder = result.dir ? `Port ${port} serves the board of another project: ${result.dir}` : `Port ${port} serves the board of another project.`;
    return `${holder}\n${next}`;
  }
  if (result.kind === 'foreign') return `Another service holds port ${port}. It is not a Constellation board.\n${next}`;
  const portFlag = port === DEFAULT_PORT ? '' : ` --port ${port}`;
  return `Board not running.\nThe board starts when the orchestrator skill loads.\nnode "${boardFile}"${portFlag}\n`;
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
    epicsDir: path.join(root, 'epics'),
    featuresDir: path.join(root, 'features'),
    tasksDir: path.join(root, 'tasks'),
    plansDir: path.join(root, 'plans'),
  };
}

const WORK_DIRS = [['epic', 'epicsDir'], ['feature', 'featuresDir'], ['task', 'tasksDir'], ['plan', 'plansDir']];
const isWorkFile = (name) => name.endsWith('.md') && !name.startsWith('.');

const readBuffer = Buffer.alloc(READ_CAP_BYTES);
let jsonBuffer = null;
// Allocated on the first JSON read, then reused: probe runs and test imports never pay for 1 MB.
const getJsonBuffer = () => (jsonBuffer ??= Buffer.alloc(JSON_CAP_BYTES));
const rejected = (code) => Object.assign(new Error(code), { code });

/** The real path of an entry, file or directory, that lies at or under the real .constellation/ root. */
function containedReal(root, file) {
  const real = fs.realpathSync(file);
  if (real !== root && !real.startsWith(root + path.sep)) throw rejected('outside .constellation');
  return real;
}

/**
 * Resolve the real .constellation/ root of a project. The root is accepted when it lies inside the
 * real project directory or when its own name is .constellation (a shared root). A missing root
 * yields { root: null, error: null }.
 */
function resolveRoot(projectDir) {
  let project, root;
  try {
    project = fs.realpathSync(projectDir);
    root = fs.realpathSync(path.join(projectDir, '.constellation'));
  } catch (e) {
    return { root: null, error: e.code === 'ENOENT' ? null : `.constellation: unreadable: ${e.code ?? 'error'}` };
  }
  const inside = root.startsWith(project + path.sep);
  if (!inside && path.basename(root) !== '.constellation') return { root: null, error: ROOT_OUTSIDE };
  return { root, error: null };
}

/** True when the project holds a contained .constellation root and a regular config.json in it. */
function hasHarness(projectDir) {
  const { root } = resolveRoot(projectDir);
  if (!root) return false;
  try {
    return fs.statSync(containedReal(root, path.join(projectDir, '.constellation', 'config.json'))).isFile();
  } catch {
    return false;
  }
}

/**
 * Open one contained regular file for a bounded read. The real path must stay inside the real
 * .constellation/ root, and the open descriptor must be a regular file. O_NONBLOCK keeps the open
 * of a FIFO from blocking the event loop. O_NOFOLLOW makes a swap of the final component to a
 * symlink after the real-path check fail with ELOOP. Throws an Error whose code names the reason.
 * The caller owns fd and closes it.
 */
function openContained(root, file) {
  const real = containedReal(root, file);
  const fd = fs.openSync(real, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const st = fs.fstatSync(fd);
    if (st.isDirectory()) throw rejected('EISDIR');
    if (!st.isFile()) throw rejected('not a regular file');
    return { fd, st };
  } catch (e) {
    fs.closeSync(fd);
    throw e;
  }
}

/** Read at most buffer.length bytes from the start of one contained regular file. */
function readPrefix(root, file, buffer = readBuffer) {
  const { fd, st } = openContained(root, file);
  try {
    let n = 0;
    for (let r = 1; r > 0 && n < buffer.length; n += r) r = fs.readSync(fd, buffer, n, buffer.length - n, n);
    return { text: buffer.toString('utf8', 0, n), truncated: st.size > n, mtime: st.mtime.toISOString() };
  } finally {
    fs.closeSync(fd);
  }
}

export const BODY_CAP_BYTES = 512 * 1024;
let bodyBuffer = null;
// Allocated on the first /api/item request, then reused: the server is single-threaded and the read is synchronous.
const getBodyBuffer = () => (bodyBuffer ??= Buffer.alloc(BODY_CAP_BYTES));
const ITEM_DIRS = { epic: 'epicsDir', feature: 'featuresDir', task: 'tasksDir', plan: 'plansDir' };

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

function readWorkItem(kind, dir, name, root) {
  try {
    const { text, truncated, mtime } = readPrefix(root, path.join(dir, name));
    return toNode(kind, name, text, mtime, truncated);
  } catch (e) {
    // ENOENT: a race or a dangling symlink — nothing to show.
    if (e.code === 'ENOENT') return null;
    const node = toNode(kind, name, '', new Date(0).toISOString());
    return { ...node, warnings: [`unreadable: ${e.code ?? 'error'}`] };
  }
}

/**
 * Read every epic, feature, task, and plan file. A missing directory is silent. A directory that
 * resolves outside the root, or that cannot be listed, adds one error and yields no nodes.
 */
function scanWorkItems(p, root) {
  const nodes = [];
  const errors = [];
  if (!root) return { nodes, errors };
  for (const [kind, key] of WORK_DIRS) {
    let dir, names;
    try {
      dir = containedReal(root, p[key]);
      names = fs.readdirSync(dir).sort();
    } catch (e) {
      if (e.code !== 'ENOENT') errors.push(`${path.basename(p[key])}: unreadable: ${e.code ?? 'error'}`);
      continue;
    }
    for (const name of names.filter(isWorkFile)) {
      const node = readWorkItem(kind, dir, name, root);
      if (node) nodes.push(node);
    }
  }
  return { nodes, errors };
}

/** Read one JSON file under the root, at most JSON_CAP_BYTES. Returns { value, missing, error }. */
function readJson(root, file) {
  if (!root) return { value: null, missing: true, error: null };
  let read;
  try {
    read = readPrefix(root, file, getJsonBuffer());
  } catch (e) {
    const missing = e.code === 'ENOENT';
    return { value: null, missing, error: missing ? null : `unreadable: ${e.code ?? 'error'}` };
  }
  if (read.truncated) return { value: null, missing: false, error: `exceeds ${JSON_CAP_BYTES / 1024 / 1024} MB` };
  try {
    return { value: JSON.parse(read.text), missing: false, error: null };
  } catch (e) {
    return { value: null, missing: false, error: `parse: ${e.message}` };
  }
}

/**
 * Read the last maxLines lines of one contained regular file, from at most the last
 * TAIL_CAP_BYTES. A window that starts after offset 0 cuts its first line, so that line is dropped.
 * Returns { text, error }. A missing file is silent.
 */
function readTail(root, file, maxLines) {
  if (!root) return { text: '', error: null };
  let fd, st;
  try {
    ({ fd, st } = openContained(root, file));
  } catch (e) {
    return { text: '', error: e.code === 'ENOENT' ? null : `unreadable: ${e.code ?? 'error'}` };
  }
  try {
    const start = Math.max(0, st.size - TAIL_CAP_BYTES);
    const buffer = Buffer.alloc(Math.min(st.size, TAIL_CAP_BYTES));
    let n = 0;
    for (let r = 1; r > 0 && n < buffer.length; n += r) r = fs.readSync(fd, buffer, n, buffer.length - n, start + n);
    let text = buffer.toString('utf8', 0, n);
    if (start > 0) {
      const newline = text.indexOf('\n');
      text = newline < 0 ? '' : text.slice(newline + 1);
    }
    const lines = text.split('\n');
    return { text: lines.slice(Math.max(0, lines.length - maxLines - 1)).join('\n'), error: null };
  } finally {
    fs.closeSync(fd);
  }
}

/** The last EVENT_TAIL lines, plus every line since startedAt, so each agent of the workflow stays in view. */
function windowOf(events, startedAt) {
  const sinceMs = Date.parse(startedAt);
  const tailFrom = Math.max(0, events.length - EVENT_TAIL);
  return events.filter((e, i) => i >= tailFrom || Date.parse(e?.ts) >= sinceMs);
}

/** Add transcript, description, and model per agent. Never a path. */
function mergeSessionAgents(agents, info) {
  return agents.map((a) => {
    const found = info.get(a.agent_id);
    return {
      ...a,
      transcript: found?.transcript === true,
      description: a.description ?? found?.description ?? null,
      model: found?.model ?? null,
    };
  });
}

/**
 * Build the snapshot the page renders. A parse error on the state file keeps the
 * previous snapshot's state and sets stale: true. A missing state file is normal.
 */
export function loadSnapshot(projectDir, prev = null, session = null) {
  const p = paths(projectDir);
  const errors = [];
  const { root, error: rootError } = resolveRoot(projectDir);
  if (rootError) return { ...emptySnapshot(projectDir), errors: [rootError] };

  const tracksR = readJson(root, p.tracks);
  const configR = readJson(root, p.config);
  const stateR = readJson(root, p.state);
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
  const eventsR = readTail(root, p.events, Infinity);
  if (eventsR.error) errors.push(`events.jsonl: ${eventsR.error}`);
  const events = parseEventLines(eventsR.text);
  const { agents: pairedAgents, activity, helperStops } = pairEvents(windowOf(events, state?.startedAt));
  const read = state && session ? session.sync({ events, state }) : null;
  errors.push(...(read?.errors ?? []));
  const agents = read ? mergeSessionAgents(pairedAgents, read.agents) : pairedAgents;
  const scan = scanWorkItems(p, root);
  errors.push(...scan.errors);
  const tree = buildTree(scan.nodes, state);
  const transitions = [
    ...collapseBurst(diffStatuses(prev?.tree?.tasks ?? null, tree.tasks)),
    ...(prev?.transitions ?? []),
  ].slice(0, TRANSITION_CAP);

  return {
    projectDir,
    at: new Date().toISOString(),
    hasTracks: !!tracksR.value,
    initialized: !configR.missing,
    state,
    progress,
    tokenDelta: state ? tokenDelta(state.tokens) : null,
    tokens: tokensFact(read?.tokens ?? null, state ? tokenDelta(state.tokens) : null, state?.startedAt ?? null),
    attribution: read ? attributeAgents(agents, progress) : {},
    agents,
    activity,
    helperStops,
    feed: mergeFeed(activity, transitions),
    tree,
    transitions,
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

  const liveRoot = () => resolveRoot(projectDir).root;
  const arm = (root, dir) => {
    if (watchers.has(dir) || !fathomDir(root, dir)) return;
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
  const armAll = (root = liveRoot()) =>
    [p.root, p.stateDir, p.metricsDir, p.epicsDir, p.featuresDir, p.tasksDir, p.plansDir].forEach((dir) => arm(root, dir));
  armAll();

  let sig = signature(p, liveRoot());
  const poll = setInterval(() => {
    const root = liveRoot();
    armAll(root);
    const next = signature(p, root);
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

/** True when dir resolves to a directory at or under the root. Missing, outside, or not a directory gives false. */
function fathomDir(root, dir) {
  if (!root) return false;
  try { return fs.statSync(containedReal(root, dir)).isDirectory(); } catch { return false; }
}

function isDirectory(dir) {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

function signature(p, root) {
  const stamp = (f) => {
    try { const s = fs.statSync(f); return `${s.mtimeMs}:${s.size}`; } catch { return '-'; }
  };
  const dirStamp = (dir) => {
    if (!fathomDir(root, dir)) return '-';
    let names;
    try { names = fs.readdirSync(dir); } catch { return '-'; }
    return names.filter(isWorkFile).sort().map((n) => `${n}=${stamp(path.join(dir, n))}`).join(',');
  };
  const workDirs = WORK_DIRS.map(([, key]) => dirStamp(p[key]));
  return [p.state, p.events, p.tracks, p.config].map(stamp).concat(workDirs).join('|');
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const AGENT_ID_PATTERN = /^[a-f0-9]{8,32}$/;
const textOrNull = (v) => (typeof v === 'string' ? v : null);

function usageBody(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return { spent: usage.spent, input: usage.input, cache: usage.cache, output: usage.output };
}

/** The /api/agent reply, built from a fixed key list: never a spread of the reader result. */
function agentReplyBody(agent, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const report = textOrNull(r.report);
  return {
    id: agent.agent_id,
    agent_type: textOrNull(agent.agent_type),
    description: textOrNull(r.description) ?? textOrNull(agent.description),
    model: textOrNull(r.model),
    start: textOrNull(agent.start),
    end: textOrNull(agent.end),
    durationSec: typeof agent.durationSec === 'number' ? agent.durationSec : null,
    usage: usageBody(r.usage),
    report,
    truncated: r.truncated === true,
    error: textOrNull(r.error) ?? (report === null ? 'missing' : null),
  };
}

export function serve(getSnapshot, subscribe, readItemBody = () => null, readAgent = () => null) {
  const clients = new Set();
  const server = http.createServer((req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    // Defense in depth: a link in a rendered body never sends the board URL as a referrer.
    res.setHeader('referrer-policy', 'no-referrer');
    // A foreign Host header means a DNS-rebinding page is talking to this server.
    const port = server.address().port;
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': PAGE_CSP });
      res.end(PAGE);
      return;
    }
    if (url.pathname === '/api/snapshot') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(getSnapshot()));
      return;
    }
    if (url.pathname === '/api/item') {
      const kind = url.searchParams.get('kind');
      const file = url.searchParams.get('file');
      // The snapshot tree is the allow-list: a name it does not hold never reaches the filesystem.
      const item = render.treeHolds(getSnapshot().tree, kind, file) ? readItemBody(kind, file) : null;
      if (!item) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(item));
      return;
    }
    if (url.pathname === '/api/agent') {
      const id = url.searchParams.get('id') ?? '';
      // The snapshot is the allow-list: an unknown, running, or malformed id never reaches the reader.
      const agent = AGENT_ID_PATTERN.test(id) ? getSnapshot().agents.find((a) => a.agent_id === id && !a.running) : null;
      if (!agent) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(agentReplyBody(agent, readAgent(agent))));
      return;
    }
    if (url.pathname === '/events') {
      if (clients.size >= SSE_CLIENT_CAP) {
        res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '5' }).end('too many board clients');
        return;
      }
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

/** The page receives every export of board-render.mjs as a top-level `var name = function name(...)`. */
const renderPrelude = Object.entries(render).map(([name, fn]) => `var ${name} = ${fn.toString()};`).join('\n');

// The page files belong to the plugin, not to the watched project, so openContained does not apply.
// The read happens at module load: a missing file fails the import, in the test file and in main alike.
const uiFile = (name) => fs.readFileSync(new URL(`./board-ui/${name}`, import.meta.url), 'utf8');
const PAGE_STYLE = uiFile('page.css');
const PAGE_SCRIPT = `${renderPrelude}\n${uiFile('page.js')}`;

/** Replace one marker with text that may hold `$`: split and join never expand `$&`, as replace does. */
function fillMarker(html, marker, text) {
  const parts = html.split(marker);
  if (parts.length !== 2) throw new Error(`board: page.html must hold ${marker} exactly once`);
  return parts.join(text);
}

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

/** The CSP source for one inline text: the base64 SHA-256 of its exact UTF-8 bytes. */
const cspHash = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// The page loads two inline scripts (the vendored markdown-it, then the page script) and one inline
// style, and nothing else. The hashes cover the exact text that is served, so an edit of any text
// without a rebuild breaks the page at once. A missing vendor file leaves one script hash.
const SCRIPT_HASHES = [VENDOR, PAGE_SCRIPT].filter((t) => t != null).map(cspHash).join(' ');
const PAGE_CSP = [
  "default-src 'none'",
  `script-src ${SCRIPT_HASHES}`,
  `style-src ${cspHash(PAGE_STYLE)}`,
  "connect-src 'self'",
  'img-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * GET the snapshot of the board on a port and resolve with a classified result. The deadline is
 * absolute: the http timeout option is an idle timeout, which a slow drip never triggers.
 */
function probe(port, here) {
  const deadlineMs = Number(process.env.BOARD_PROBE_TIMEOUT_MS) || PROBE_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      resolve(result);
    };
    const req = http.get({ host: '127.0.0.1', port, path: '/api/snapshot', agent: false }, (res) => {
      if (res.statusCode !== 200) {
        finish({ kind: 'foreign' });
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > PROBE_MAX_BYTES) finish({ kind: 'foreign' });
        else chunks.push(chunk);
      });
      res.on('end', () => finish(classifyProbe(Buffer.concat(chunks).toString('utf8'), here)));
      res.on('error', () => finish({ kind: 'foreign' }));
    });
    const timer = setTimeout(() => finish({ kind: 'foreign' }), deadlineMs);
    req.on('error', (e) => finish({ kind: e.code === 'ECONNREFUSED' ? 'none' : 'foreign' }));
  });
}

const ROOT_UID = 0;
const MODE_GROUP_OTHER_WRITE = 0o022;
const MODE_OTHER_WRITE = 0o002;
const MODE_STICKY = 0o1000;

/**
 * True when no other UID can rename an entry inside this directory. A root-owned directory that
 * group or other can write to, without the sticky bit, fails. The sticky bit (as on /tmp) limits
 * rename to the entry owner.
 */
function isRenameSafeRootOwnedDir(st) {
  return !(st.mode & MODE_GROUP_OTHER_WRITE) || Boolean(st.mode & MODE_STICKY);
}

/**
 * Other-writable without the sticky bit: any UID can rename entries inside. Directories of the
 * user are tested for this only: on Linux a private user group makes mode 775 common, and a
 * rename there needs a member of that group.
 */
function isOtherWritableWithoutSticky(st) {
  return Boolean(st.mode & MODE_OTHER_WRITE) && !(st.mode & MODE_STICKY);
}

/** True when the lstat of one path component is a trusted directory. A link fails isDirectory(). */
export function isTrustedComponent(st, uid, isFinal) {
  if (!st.isDirectory()) return false;
  if (st.uid === uid) return isFinal || !isOtherWritableWithoutSticky(st);
  return !isFinal && st.uid === ROOT_UID && isRenameSafeRootOwnedDir(st);
}

/** Every prefix of an absolute normalized path, from the root down to the path itself. */
function pathPrefixes(dir) {
  const parts = dir.split(path.sep).filter(Boolean);
  return [path.sep, ...parts.map((_, i) => path.sep + parts.slice(0, i + 1).join(path.sep))];
}

/**
 * True when dir is a project of this user: an absolute normalized path whose every component is a
 * real directory (never a symlink), owned by the current UID or by root, with the final component
 * owned by the current UID, and a harness project by the same rule as the --quiet gate.
 * A symlink would pass a plain stat, because stat checks the target and the probe prints the link
 * path. The walk also closes the swap race by induction. It runs top-down. Once a prefix is
 * trusted, only the user or root can rename inside it. So every later lookup of the same text,
 * including the realpath calls in hasHarness(dir), sees only state that the user or root made.
 * A root-owned component that group or other can write to, without the sticky bit, fails
 * (see isRenameSafeRootOwnedDir). A non-final user-owned component that other can write to,
 * without the sticky bit, also fails. The final component is exempt: its content decides only the
 * hasHarness result, while the trusted prefixes already fix the printed text.
 * Accepted residuals: a user-owned component that is group-writable with a shared group (for
 * example macOS staff), macOS ACLs that grant rename rights outside the mode bits, filesystems
 * that report a false owner (FUSE allow_other, network mounts), and a project directory that
 * other UIDs can write, which lets them flip the hasHarness result. Root and the
 * processes of the user are trusted. Windows always gets the fixed line.
 * Cost: a real board that started through a symlinked path gets the fixed line. The next-port
 * command still prints. Windows has no getuid, so it never passes.
 */
export function ownsProject(dir) {
  try {
    if (typeof process.getuid !== 'function') return false;
    if (path.resolve(dir) !== dir) return false;
    const uid = process.getuid();
    const prefixes = pathPrefixes(dir);
    const trusted = prefixes.every((prefix, i) => (
      isTrustedComponent(fs.lstatSync(prefix), uid, i === prefixes.length - 1)
    ));
    return trusted && hasHarness(dir);
  } catch {
    return false;
  }
}

function runProbe({ projectDir, port }) {
  let here = projectDir;
  try { here = fs.realpathSync(projectDir); } catch { /* keep the resolved path */ }
  probe(port, here).catch(() => ({ kind: 'foreign' })).then((result) => {
    const checked = result.kind === 'other' && !ownsProject(result.dir) ? { kind: 'other' } : result;
    process.stdout.write(probeText(checked, port, fileURLToPath(import.meta.url)));
  });
}

function parseArgs(argv) {
  const out = { projectDir: process.cwd(), port: DEFAULT_PORT, help: false, quiet: false, probe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--probe') out.probe = true;
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
    console.log('usage: node board.mjs [projectDir] [--port N] [--quiet] [--probe]\n  Read-only live panel of the in-flight Constellation workflow.\n  --probe prints whether a board for this project runs on the port, then exits.');
    process.exit(0);
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > MAX_PORT) {
    console.error(`board: --port must be an integer from 1 to ${MAX_PORT}`);
    process.exit(1);
  }
  if (args.probe) {
    runProbe(args);
    return;
  }
  if (args.quiet) {
    // Started by the plugin monitor in every session: stay silent where the harness is absent.
    if (!hasHarness(args.projectDir)) process.exit(0);
  } else if (!isDirectory(path.join(args.projectDir, '.constellation'))) {
    console.error(`board: ${args.projectDir}/.constellation not found — pass an initialized project directory`);
    process.exit(1);
  }
  runServer(args);
}

function runServer({ projectDir, port, quiet }) {
  let snapshot = null;
  let stopWatch = null;
  const listeners = new Set();
  // Without --quiet, one line per distinct reason. The text holds a reason, never a path.
  const reader = createSessionReader({
    root: path.join(os.homedir(), '.claude', 'projects'),
    log: quiet ? null : (text) => console.error(`board: ${text}`),
  });
  const getSnapshot = () => snapshot ?? (snapshot = safeRefresh(() => loadSnapshot(projectDir, null, reader), null, projectDir));
  const refresh = () => {
    snapshot = safeRefresh(() => loadSnapshot(projectDir, snapshot, reader), snapshot, projectDir);
    for (const l of listeners) l(snapshot);
  };
  // A growing transcript does not touch .constellation/, so the 5 s tick checks the known files.
  const sessionPoll = setInterval(() => {
    if (!snapshot?.state) reader.reset();
    else if (reader.changed()) refresh();
  }, SESSION_POLL_MS);

  const readAgent = (agent) => (snapshot?.state ? reader.agentReply(agent) : { error: 'no workflow in flight' });
  const server = serve(getSnapshot, (l) => listeners.add(l), (kind, file) => readItem(projectDir, kind, file), readAgent);
  server.on('listening', () => {
    getSnapshot();
    stopWatch = watch(projectDir, refresh);
    if (!quiet) console.log(`🌌 Constellation board  http://127.0.0.1:${port}  (watching ${projectDir}/.constellation)`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && quiet) {
      // Another session holds the port. Stand by and retry when that session ends.
      const standbyMs = Number(process.env.BOARD_STANDBY_MS) || STANDBY_MS;
      setTimeout(() => server.listen(port, '127.0.0.1'), standbyMs);
      return;
    }
    console.error(e.code === 'EADDRINUSE' ? `board: port ${port} is in use — pass --port <other>` : `board: ${e.message}`);
    if (stopWatch) stopWatch();
    process.exit(1);
  });
  server.listen(port, '127.0.0.1');

  const shutdown = () => { clearInterval(sessionPoll); if (stopWatch) stopWatch(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
