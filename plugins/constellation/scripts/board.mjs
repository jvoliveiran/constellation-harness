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
const POLL_MS = 1500;
const LOOP_CAP = 3;
const BURST_LIMIT = 3;
const FEED_LIMIT = 30;
const TRANSITION_CAP = 50;
const STANDBY_MS = 5000;
const FRONT_MATTER_OPEN_WINDOW = 10;
const FRONT_MATTER_CLOSE_WINDOW = 40;
const TASK_STATUSES = ['inbox', 'refined', 'in-progress', 'parked', 'done', 'dropped'];
const KNOWN_FIELDS = {
  epic: ['status', 'date-created', 'last-edit'],
  feature: ['status', 'epic', 'order', 'date-created', 'last-edit'],
  task: ['status', 'type', 'source', 'feature', 'order', 'related', 'revisit', 'commit', 'date-created', 'last-edit'],
  plan: ['status', 'task', 'scope-approved-by', 'date-created', 'last-edit'],
};

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
  let helperStops = 0;
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (e.event === 'SubagentStart' || e.event === 'SubagentStop') {
      const key = e.agent_id ?? `${e.agent_type ?? 'agent'}@${e.ts}`;
      if (e.event === 'SubagentStop' && !agents.has(key) && !e.agent_type) {
        // Observed live: Claude Code emits a SubagentStop every ~30-60 s for internal
        // helper agents that never produced a SubagentStart and carry no agent_type.
        // Not specialists — count them and keep them off the page.
        helperStops += 1;
        continue;
      }
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
  return { agents: list, activity, helperStops };
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
// Work items: front-matter parser, tree builder, status differ, feed (pure)
// ---------------------------------------------------------------------------

function parseFieldValue(raw) {
  const value = raw.replace(/\s+#.*$/, '').trim();
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/** Lenient front-matter parser. Never throws. Returns { fields, warnings, malformed }. */
export function parseFrontMatter(text, kind) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const open = lines.slice(0, FRONT_MATTER_OPEN_WINDOW).indexOf('---');
  if (open < 0) return { fields: {}, warnings: ['no front-matter'], malformed: true };
  const warnings = open > 0 ? ['title before front-matter'] : [];
  const body = lines.slice(open + 1, open + 1 + FRONT_MATTER_CLOSE_WINDOW);
  const close = body.indexOf('---');
  if (close < 0) return { fields: {}, warnings: [...warnings, 'unclosed front-matter'], malformed: true };

  const fields = {};
  for (const line of body.slice(0, close)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    fields[key] = parseFieldValue(line.slice(colon + 1));
    if (!(KNOWN_FIELDS[kind] ?? []).includes(key)) warnings.push(`unknown field: ${key}`);
  }
  if (fields.status) fields.status = fields.status.toLowerCase();
  const malformed = !fields.status;
  if (malformed) warnings.push('status missing');
  return { fields, warnings, malformed };
}

/** Build the wire node for one work-item file. Carries no raw front-matter map. */
export function toNode(kind, file, text, mtime) {
  const { fields, warnings, malformed } = parseFrontMatter(text, kind);
  const base = file.replace(/\.md$/, '');
  const dash = base.indexOf('-');
  const prefix = dash < 0 ? base : base.slice(0, dash);
  const numbered = /^(E\d+|F\d+|\d+)$/.test(prefix);
  if (!numbered) warnings.push('no number in file name');
  const order = fields.order === undefined || fields.order === '' ? NaN : Number(fields.order);
  const links = {};
  for (const key of ['epic', 'feature', 'task']) if (fields[key]) links[key] = fields[key];
  return {
    kind,
    file,
    id: numbered ? prefix : null,
    name: numbered ? base.slice(dash + 1) : base,
    status: fields.status ?? null,
    type: fields.type ?? null,
    order: Number.isFinite(order) ? order : null,
    links,
    mtime,
    flags: malformed ? ['malformed'] : warnings.length ? ['lenient'] : [],
    warnings,
  };
}

const byOrderThenFile = (a, b) => {
  if (a.order !== b.order) {
    if (a.order == null) return 1;
    if (b.order == null) return -1;
    return a.order - b.order;
  }
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
};

/** Add a warning. A malformed node keeps only the malformed flag. */
function addWarning(node, warning) {
  node.warnings.push(warning);
  if (node.flags.length === 0) node.flags.push('lenient');
}

function attachByLink(children, parentByFile, linkKey) {
  const attached = new Map();
  const orphans = [];
  for (const child of children) {
    const target = child.links[linkKey];
    const parent = target ? parentByFile.get(target) : null;
    if (target && !parent) addWarning(child, `missing link: ${target}`);
    if (parent) attached.set(parent.file, [...(attached.get(parent.file) ?? []), child]);
    else orphans.push(child);
  }
  return { attached, orphans };
}

function attachPlans(plans, taskByFile) {
  const orphans = [];
  for (const plan of plans) {
    const linked = plan.links.task;
    const target = [taskByFile.get(linked), taskByFile.get(plan.file)].find((t) => t && !t.plan);
    if (linked && linked !== plan.file) addWarning(plan, 'task link mismatch');
    if (target) target.plan = { file: plan.file, status: plan.status };
    else {
      addWarning(plan, 'plan without task');
      orphans.push(plan);
    }
  }
  return orphans;
}

function toTaskNode(node, state) {
  const known = TASK_STATUSES.includes(node.status);
  const task = { ...node, group: known ? node.status : 'other', plan: null, inFlight: false, currentStep: null };
  if (node.status && !known) addWarning(task, `unknown status: ${node.status}`);
  if (state?.task === node.file) {
    task.inFlight = true;
    task.currentStep = state.currentStep ?? null;
  }
  return task;
}

const summaryOf = ({ kind, file, flags, warnings }) => ({ kind, file, flags, warnings });
const groupNode = (node, extra) => ({ file: node.file, id: node.id, name: node.name, status: node.status, flags: node.flags, warnings: node.warnings, ...extra });

/** Assemble the epics → features → tasks tree plus counts and the attention list. */
export function buildTree(nodes, state) {
  const copy = nodes.map((n) => ({ ...n, links: { ...n.links }, flags: [...n.flags], warnings: [...n.warnings] }));
  const ofKind = (kind) => copy.filter((n) => n.kind === kind).sort(byOrderThenFile);
  const epics = ofKind('epic');
  const features = ofKind('feature');
  const tasks = ofKind('task').map((n) => toTaskNode(n, state));
  const plans = ofKind('plan');

  const featureTree = attachByLink(features, new Map(epics.map((e) => [e.file, e])), 'epic');
  const taskTree = attachByLink(tasks, new Map(features.map((f) => [f.file, f])), 'feature');
  const orphanPlans = attachPlans(plans, new Map(tasks.map((t) => [t.file, t])));

  const withTasks = (f) => groupNode(f, { tasks: (taskTree.attached.get(f.file) ?? []).map((t) => t.file) });
  const counts = Object.fromEntries([...TASK_STATUSES, 'other'].map((g) => [g, tasks.filter((t) => t.group === g).length]));
  const everyNode = [...epics, ...features, ...tasks, ...plans];
  counts.malformed = everyNode.filter((n) => n.flags.includes('malformed')).length;

  return {
    epics: epics.map((e) => groupNode(e, { features: (featureTree.attached.get(e.file) ?? []).map(withTasks) })),
    orphanFeatures: featureTree.orphans.map(withTasks),
    standaloneTasks: taskTree.orphans.map((t) => t.file),
    orphanPlans: orphanPlans.map((p) => groupNode(p, {})),
    tasks,
    attention: everyNode.filter((n) => n.flags.length > 0).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map(summaryOf),
    counts,
  };
}

/** Status changes between two task lists. ts is the next node's file mtime. */
export function diffStatuses(prevTasks, nextTasks) {
  if (!prevTasks) return [];
  const prevByFile = new Map(prevTasks.map((t) => [t.file, t]));
  const out = [];
  for (const next of nextTasks) {
    if (!next.status || next.flags.includes('malformed')) continue;
    const prev = prevByFile.get(next.file);
    if (prev && !prev.status) continue;
    const from = prev ? prev.status : null;
    if (from !== next.status) out.push({ kind: 'transition', file: next.file, from, to: next.status, ts: next.mtime });
  }
  return out;
}

/** One summary entry replaces a burst (branch switch, pull). Per-file pairs stay in items. */
export function collapseBurst(transitions, limit = BURST_LIMIT) {
  if (transitions.length <= limit) return transitions;
  const newest = transitions.reduce((max, t) => (Date.parse(t.ts) > Date.parse(max) ? t.ts : max), transitions[0].ts);
  return [{ kind: 'summary', summary: true, count: transitions.length, ts: newest, items: transitions }];
}

const feedTime = (entry) => {
  const ms = Date.parse(entry.ts);
  return Number.isNaN(ms) ? -Infinity : ms;
};

/** Merge hook activity and status transitions, newest first. Compares parsed times. */
export function mergeFeed(activity, transitions, limit = FEED_LIMIT) {
  const events = activity.map((e) => ({ ...e, kind: 'event' }));
  return [...events, ...transitions]
    .sort((a, b) => (feedTime(a) === feedTime(b) ? 0 : feedTime(b) > feedTime(a) ? 1 : -1))
    .slice(0, limit);
}

export function emptySnapshot(projectDir) {
  return {
    projectDir, at: new Date().toISOString(), hasTracks: false, initialized: true,
    state: null, progress: null, tokenDelta: null, agents: [], activity: [], helperStops: 0,
    feed: [], tree: null, transitions: [], stale: false, errors: [],
  };
}

/** Run the loader. A throw keeps the previous snapshot and adds an error. */
export function safeRefresh(load, prev, projectDir) {
  try {
    return load();
  } catch (e) {
    const base = prev ?? emptySnapshot(projectDir);
    return { ...base, errors: [...base.errors, `refresh failed: ${e.message}`] };
  }
}

/**
 * Render the backlog tree as an HTML string. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import.
 */
export function renderBacklog(tree, esc) {
  var GLYPHS = { inbox: '📥', refined: '📋', 'in-progress': '🔨', parked: '🅿️', done: '✅', dropped: '🚫', other: '❓' };
  var PLAN_GLYPHS = { draft: '📝', approved: '👍' };
  var OPEN_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other'];
  var COLLAPSED_GROUPS = ['done', 'dropped'];
  var byFile = {};
  var hasNodes = !!tree && (tree.tasks.length + tree.epics.length + tree.orphanFeatures.length + tree.orphanPlans.length) > 0;
  if (!hasNodes) return '<div class="empty">No work items</div>';
  tree.tasks.forEach(function (t) { byFile[t.file] = t; });

  function badge(node) {
    return node.flags.length ? ' <span class="badge warn">' + esc(node.flags[0]) + '</span>' : '';
  }
  function warnLines(node) {
    return node.warnings.map(function (w) { return '<div class="warn-line">' + esc(w) + '</div>'; }).join('');
  }
  function taskRow(t) {
    var plan = t.plan ? ' <span title="plan ' + esc(t.plan.status) + '">' + (PLAN_GLYPHS[t.plan.status] || '📝') + '</span>' : '';
    var step = t.inFlight ? ' <span class="run">▶ ' + esc(t.currentStep || '') + '</span>' : '';
    return '<div class="task" data-file="' + esc(t.file) + '" title="' + esc(t.warnings.join('; ')) + '">'
      + (GLYPHS[t.group] || GLYPHS.other) + ' ' + esc(t.id || '') + ' ' + esc(t.name)
      + (t.type ? ' <code>' + esc(t.type) + '</code>' : '') + plan + step + badge(t) + '</div>' + warnLines(t);
  }
  function taskGroups(files, groupKey) {
    var items = files.map(function (f) { return byFile[f]; }).filter(Boolean);
    var html = OPEN_GROUPS.map(function (g) {
      return items.filter(function (t) { return t.group === g; }).map(taskRow).join('');
    }).join('');
    COLLAPSED_GROUPS.forEach(function (g) {
      var list = items.filter(function (t) { return t.group === g; });
      if (!list.length) return;
      html += '<details data-group="' + esc(groupKey + ':' + g) + '"><summary>' + list.length + ' ' + g + '</summary>' + list.map(taskRow).join('') + '</details>';
    });
    return html;
  }
  function header(node) {
    return '<div class="gh">' + esc(node.id || '') + ' ' + esc(node.name) + ' <code>' + esc(node.status || '') + '</code>' + badge(node) + '</div>' + warnLines(node);
  }
  function featureGroup(f) {
    return '<div class="grp">' + header(f) + taskGroups(f.tasks, f.file) + '</div>';
  }
  function plainGroup(title, body) {
    return '<div class="grp"><div class="gh">' + esc(title) + '</div>' + body + '</div>';
  }

  var html = '';
  if (tree.attention.length) {
    html += '<div class="attn"><div class="gh">Needs attention</div>' + tree.attention.map(function (a) {
      return '<div class="task">' + esc(a.kind) + ' <code>' + esc(a.file) + '</code> <span class="badge warn">' + esc(a.flags[0]) + '</span></div>'
        + a.warnings.map(function (w) { return '<div class="warn-line">' + esc(w) + '</div>'; }).join('');
    }).join('') + '</div>';
  }
  tree.epics.forEach(function (e) {
    html += '<div class="epic">' + header(e) + e.features.map(featureGroup).join('') + '</div>';
  });
  if (tree.orphanFeatures.length) html += plainGroup('(no epic)', tree.orphanFeatures.map(featureGroup).join(''));
  if (tree.standaloneTasks.length) html += plainGroup('(standalone tasks)', taskGroups(tree.standaloneTasks, 'standalone'));
  if (tree.orphanPlans.length) {
    html += plainGroup('(plans without task)', tree.orphanPlans.map(function (p) {
      return '<div class="task">' + (PLAN_GLYPHS[p.status] || '📝') + ' <code>' + esc(p.file) + '</code>' + badge(p) + '</div>' + warnLines(p);
    }).join(''));
  }
  return html;
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

function readWorkItem(kind, dir, name) {
  try {
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, 'utf8');
    return toNode(kind, name, text, fs.statSync(file).mtime.toISOString());
  } catch (e) {
    // ENOENT: a race or a dangling symlink — nothing to show.
    if (e.code === 'ENOENT') return null;
    const node = toNode(kind, name, '', new Date(0).toISOString());
    return { ...node, warnings: [`unreadable: ${e.code ?? 'error'}`] };
  }
}

/** Read every epic, feature, task, and plan file. A missing directory yields no nodes. */
function scanWorkItems(p) {
  const nodes = [];
  for (const [kind, key] of WORK_DIRS) {
    let names;
    try { names = fs.readdirSync(p[key]).sort(); } catch { continue; }
    for (const name of names.filter(isWorkFile)) {
      const node = readWorkItem(kind, p[key], name);
      if (node) nodes.push(node);
    }
  }
  return nodes;
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
  const { agents, activity, helperStops } = pairEvents(parseEventLines(readTail(p.events, EVENT_TAIL)));
  const tree = buildTree(scanWorkItems(p), state);
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
  const armAll = () => [p.root, p.stateDir, p.metricsDir, p.epicsDir, p.featuresDir, p.tasksDir, p.plansDir].forEach(arm);
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
  const dirStamp = (dir) => {
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
