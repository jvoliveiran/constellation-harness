// Constellation Harness — board model: the pure snapshot functions of the board.
//
// No filesystem, no network, no clock reads beyond new Date() in emptySnapshot. board.mjs
// re-exports every name, so one entry file stays the public surface. This file imports
// nothing from node: a model that reads the disk is a boundary break.

const LOOP_CAP = 3;
const BURST_LIMIT = 3;
const FEED_LIMIT = 30;
const DESCRIPTION_CAP = 200;
const FRONT_MATTER_OPEN_WINDOW = 10;
const FRONT_MATTER_CLOSE_WINDOW = 40;
export const READ_CAP_BYTES = 64 * 1024;
export const CAP_WARNING = `front-matter exceeds ${READ_CAP_BYTES / 1024} KB`;
const TASK_STATUSES = ['inbox', 'refined', 'in-progress', 'parked', 'done', 'dropped'];
const KNOWN_FIELDS = {
  epic: ['status', 'date-created', 'last-edit'],
  feature: ['status', 'epic', 'order', 'date-created', 'last-edit'],
  task: ['status', 'type', 'source', 'feature', 'order', 'related', 'revisit', 'commit', 'date-created', 'last-edit'],
  plan: ['status', 'task', 'scope-approved-by', 'date-created', 'last-edit'],
};

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
        if (a.description === undefined && typeof e.description === 'string' && e.description.length <= DESCRIPTION_CAP) a.description = e.description;
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

/**
 * The tokens fact. The transcript sum comes first, then the state-file delta, then nothing.
 * sessionSum is { spent, input, cache, output } from the session reader, or null.
 */
export function tokensFact(sessionSum, delta, startedAt) {
  if (sessionSum) return { source: 'transcripts', ...sessionSum, since: startedAt };
  if (typeof delta === 'number') return { source: 'state', spent: delta };
  return { source: 'none', spent: null };
}

// Candidate steps per agent type. The first step of a run is the first present step, in track order.
const ENGINEER_TYPES = ['software-engineer', 'frontend-engineer', 'ui-ux-designer'];
const GATE_STEPS = ['parallel-gate-1', 'review-gate'];
const CANDIDATE_STEPS = new Map([
  ['software-architect', ['architect', 'architect-feasibility', 'architect-verify']],
  ['product-manager', ['product-manager', 'architect']],
  ...ENGINEER_TYPES.map((type) => [type, ['engineer']]),
  ...['code-reviewer', 'security-analyst', 'dx-analyst'].map((type) => [type, GATE_STEPS]),
  ['cross-model-reviewer', ['plan-review', ...GATE_STEPS]],
  ['sdet', ['parallel-gate-2', 'sdet']],
  ['technical-writer', ['parallel-gate-2', 'sdet']],
  ['devops-engineer', ['devops-branch', 'devops-pr']],
]);
const ATTRIBUTION_ID = /^[a-f0-9]{8,32}$/;

function attributableRuns(agents, stepIds, startedMs) {
  const runs = agents
    .filter((a) => typeof a.agent_id === 'string' && ATTRIBUTION_ID.test(a.agent_id) && Date.parse(a.start) >= startedMs)
    .map((a) => ({ id: a.agent_id, startMs: Date.parse(a.start), type: String(a.agent_type ?? '').replace(/^constellation:/, '') }));
  return runs
    .map((run) => ({ ...run, present: (CANDIDATE_STEPS.get(run.type) ?? []).filter((id) => stepIds.includes(id)).sort((x, y) => stepIds.indexOf(x) - stepIds.indexOf(y)) }))
    .filter((run) => run.present.length > 0)
    .sort((x, y) => x.startMs - y.startMs);
}

/**
 * Attach each agent run to the step it ran in. A run with one candidate step attaches to it. A run
 * with several attaches to a later step only when a run of a step that lies strictly between the two
 * started before it. This keeps pairing rounds on the first step. Only runs that start at or after
 * startedAt count: a run of an earlier workflow attaches to no step. An unparseable startedAt attaches
 * nothing. Returns { stepId: [agent_id, ...] }, start ascending.
 */
export function attributeAgents(agents, progress, startedAt) {
  const stepIds = (progress?.steps ?? []).map((s) => s.id);
  const runs = attributableRuns(Array.isArray(agents) ? agents : [], stepIds, Date.parse(startedAt));
  const stepOf = new Map();
  const single = runs.filter((run) => run.present.length === 1);
  for (const run of single) stepOf.set(run.id, run.present[0]);
  const betweenStarted = (run, lower, upper) => single.some((other) => {
    const at = stepIds.indexOf(stepOf.get(other.id));
    return at > stepIds.indexOf(lower) && at < stepIds.indexOf(upper) && other.startMs < run.startMs;
  });
  for (const run of runs.filter((r) => r.present.length > 1)) {
    let target = run.present[0];
    for (let k = run.present.length - 1; k >= 1; k -= 1) {
      if (betweenStarted(run, run.present[k - 1], run.present[k])) { target = run.present[k]; break; }
    }
    stepOf.set(run.id, target);
  }
  const out = {};
  for (const run of runs) (out[stepOf.get(run.id)] ??= []).push(run.id);
  return out;
}

// ---------------------------------------------------------------------------
// Work items: front-matter parser, tree builder, status differ, feed (pure)
// ---------------------------------------------------------------------------

function parseFieldValue(raw) {
  const value = raw.replace(/\s+#.*$/, '').trim();
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/**
 * Lenient front-matter parser. Never throws. Returns { fields, warnings, malformed }.
 * truncated: the text is a byte-capped prefix, so its last line can be cut and a missing
 * fence may lie beyond the cap. The cap warning replaces a verdict that the prefix cannot prove.
 */
export function parseFrontMatter(text, kind, truncated = false) {
  const all = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const lines = truncated ? all.slice(0, -1) : all;
  const open = lines.slice(0, FRONT_MATTER_OPEN_WINDOW).indexOf('---');
  if (open < 0) {
    const cut = truncated && lines.length < FRONT_MATTER_OPEN_WINDOW;
    return { fields: {}, warnings: [cut ? CAP_WARNING : 'no front-matter'], malformed: true };
  }
  const warnings = open > 0 ? ['title before front-matter'] : [];
  const body = lines.slice(open + 1, open + 1 + FRONT_MATTER_CLOSE_WINDOW);
  const close = body.indexOf('---');
  if (close < 0) {
    const cut = truncated && lines.length < open + 1 + FRONT_MATTER_CLOSE_WINDOW;
    return { fields: {}, warnings: [...warnings, cut ? CAP_WARNING : 'unclosed front-matter'], malformed: true };
  }

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

/** The first `# ` line after the front matter, trimmed, or null. The same line that renderMarkdown drops. */
export function extractTitle(text) {
  const body = String(text ?? '').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
  const match = /^# (.*)$/m.exec(body);
  return match ? match[1].trim() : null;
}

/** Build the wire node for one work-item file. Carries no raw front-matter map. */
export function toNode(kind, file, text, mtime, truncated = false) {
  const { fields, warnings, malformed } = parseFrontMatter(text, kind, truncated);
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
    title: extractTitle(text),
    mtime,
    created: fields['date-created'] || null,
    edited: fields['last-edit'] || null,
    // Raw names: the page checks each one against the tree before it builds a link.
    related: (fields.related || '').split(',').map((name) => name.trim()).filter(Boolean),
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
    // The same-name task is the fallback only when the link is empty or names no task.
    const target = (linked ? taskByFile.get(linked) : undefined) ?? taskByFile.get(plan.file);
    if (linked && linked !== plan.file) addWarning(plan, 'task link mismatch');
    if (target && !target.plan) target.plan = { file: plan.file, status: plan.status, title: plan.title };
    else {
      addWarning(plan, target ? `duplicate plan for task: ${target.file}` : 'plan without task');
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

// Unknown fields alone are lenient noise: the row keeps its badge, Needs attention stays for real problems.
const needsAttention = (n) => n.flags.includes('malformed') || n.warnings.some((w) => !w.startsWith('unknown field: '));
const summaryOf = ({ kind, file, flags, warnings }) => ({ kind, file, flags, warnings });
const groupNode = (node, extra) => ({
  file: node.file, id: node.id, name: node.name, title: node.title, status: node.status,
  mtime: node.mtime, created: node.created, edited: node.edited, flags: node.flags, warnings: node.warnings, ...extra,
});

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
    attention: everyNode.filter(needsAttention).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map(summaryOf),
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
    state: null, progress: null, tokenDelta: null, tokens: { source: 'none', spent: null }, attribution: {}, agents: [], activity: [], helperStops: 0,
    feed: [], tree: null, transitions: [], stale: false, errors: [],
  };
}

/** Run the loader. A throw keeps the previous snapshot and adds an error. */
export function safeRefresh(load, prev, projectDir) {
  try {
    return load();
  } catch (e) {
    const base = prev ?? emptySnapshot(projectDir);
    const message = `refresh failed: ${e.message}`;
    return { ...base, errors: base.errors.includes(message) ? base.errors : [...base.errors, message] };
  }
}
