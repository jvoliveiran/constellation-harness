// Tests for the pure functions of board.mjs. Run: node --test plugins/constellation/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveSteps, pairEvents, parseEventLines, tokenDelta, loadSnapshot,
  parseFrontMatter, toNode, buildTree, diffStatuses, collapseBurst, mergeFeed, safeRefresh, renderBacklog,
} from './board.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tracks = JSON.parse(fs.readFileSync(path.join(here, '..', 'templates', 'tracks.json'), 'utf8'));
const planReviewOn = { crossModelValidation: { enabled: true, steps: ['plan-review'] } };
const planReviewOff = { crossModelValidation: { enabled: false } };

const current = (p) => p.steps.find((s) => s.state === 'current')?.id ?? null;
const doneIds = (p) => p.steps.filter((s) => s.state === 'done').map((s) => s.id);

// Banner example: 🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · ·
test('planned 6/10 with plan-review enabled', () => {
  const p = resolveSteps(
    { track: 'planned', currentStep: 'parallel-gate-1', completedSteps: ['architect', 'plan-review', 'devops-branch', 'engineer', 'lint-gate'] },
    tracks, planReviewOn,
  );
  assert.equal(p.N, 10);
  assert.equal(p.n, 6);
  assert.equal(current(p), 'parallel-gate-1');
  assert.deepEqual(doneIds(p), ['architect', 'plan-review', 'devops-branch', 'engineer', 'lint-gate']);
  assert.deepEqual(p.modifiers, []);
});

// Banner example: same state inside a fix loop — pointer stays on the gate, modifier appears
test('fix loop keeps the pointer on the gate and adds the loop modifier', () => {
  const p = resolveSteps(
    { track: 'planned', currentStep: 'parallel-gate-1', completedSteps: ['architect', 'plan-review', 'devops-branch', 'engineer', 'lint-gate'], reviewLoopCount: 1 },
    tracks, planReviewOn,
  );
  assert.equal(p.n, 6);
  assert.equal(current(p), 'parallel-gate-1');
  assert.deepEqual(p.modifiers, ['🔁 loop 1/3']);
});

// Banner example: 🌌 tweak 4/7 │ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · ·
test('tweak 4/7', () => {
  const p = resolveSteps(
    { track: 'tweak', currentStep: 'parallel-gate-1', completedSteps: ['devops-branch', 'engineer', 'lint-gate'] },
    tracks, planReviewOff,
  );
  assert.equal(p.N, 7);
  assert.equal(p.n, 4);
  assert.equal(current(p), 'parallel-gate-1');
});

// Banner example: 🌌 planned 10/11 │ … 🚀✓ ▶💬 PR Feedback · │ ⛔ awaiting your decision
test('planned 10/11 with post-pr as an extra step and waitingOn user', () => {
  const p = resolveSteps(
    {
      track: 'planned', currentStep: 'post-pr', waitingOn: 'user',
      completedSteps: ['architect', 'plan-review', 'devops-branch', 'engineer', 'lint-gate', 'parallel-gate-1', 'parallel-gate-2', 'architect-verify', 'devops-pr'],
    },
    tracks, planReviewOn,
  );
  assert.equal(p.N, 11);
  assert.equal(p.n, 10);
  assert.equal(current(p), 'post-pr');
  assert.equal(p.steps[p.steps.length - 1].id, 'ship');
  assert.deepEqual(p.modifiers, ['⛔ awaiting your decision']);
});

test('plan-review is filtered out when cross-model validation is off', () => {
  const p = resolveSteps({ track: 'planned', currentStep: 'architect', completedSteps: [] }, tracks, planReviewOff);
  assert.equal(p.N, 9);
  assert.equal(p.n, 1);
  assert.ok(!p.steps.some((s) => s.id === 'plan-review'));
});

test('pointer never moves backward: completed beyond currentStep wins', () => {
  const p = resolveSteps(
    { track: 'tweak', currentStep: 'engineer', completedSteps: ['devops-branch', 'engineer', 'lint-gate'] },
    tracks, planReviewOff,
  );
  assert.equal(current(p), 'lint-gate');
  assert.equal(p.n, 3);
});

test('unknown current step renders raw and never throws', () => {
  const p = resolveSteps(
    { track: 'planned', currentStep: 'mystery-step', completedSteps: ['architect', 'devops-branch'] },
    tracks, planReviewOff,
  );
  assert.equal(p.unknownCurrent, 'mystery-step');
  assert.equal(p.n, null);
  assert.deepEqual(doneIds(p), ['architect', 'devops-branch']);
  assert.equal(current(p), null);
});

test('unknown track yields zero steps and the raw current step', () => {
  const p = resolveSteps({ track: 'nope', currentStep: 'x' }, tracks, null);
  assert.equal(p.N, 0);
  assert.equal(p.unknownCurrent, 'x');
});

test('pairEvents: start without stop is running; duplicates collapse', () => {
  const events = parseEventLines([
    '{"ts":"2026-10-03T10:00:00Z","event":"SubagentStart","agent_id":"a1","agent_type":"constellation:software-engineer"}',
    '{"ts":"2026-10-03T10:00:00Z","event":"SubagentStart","agent_id":"a1","agent_type":"constellation:software-engineer"}',
    '{"ts":"2026-10-03T10:00:05Z","event":"SubagentStart","agent_id":"a2","agent_type":"constellation:sdet"}',
    '{"ts":"2026-10-03T10:02:05Z","event":"SubagentStop","agent_id":"a2","agent_type":"constellation:sdet"}',
    '{"ts":"2026-10-03T10:03:00Z","event":"PostToolUse","tool_name":"Write","file":".constellation/state/current-workflow.json"}',
    'this line is garbage',
    '{"ts":"2026-10-03T10:04:00Z","event":"Stop"}',
  ].join('\n'));
  const { agents, activity } = pairEvents(events);
  assert.equal(agents.length, 2);
  const a1 = agents.find((a) => a.agent_id === 'a1');
  const a2 = agents.find((a) => a.agent_id === 'a2');
  assert.equal(a1.running, true);
  assert.equal(a1.durationSec, null);
  assert.equal(a2.running, false);
  assert.equal(a2.durationSec, 120);
  assert.equal(agents[0].agent_id, 'a2', 'newest first');
  assert.equal(activity.length, 2);
  assert.equal(activity[0].event, 'Stop', 'newest first');
  assert.equal(activity[1].file, '.constellation/state/current-workflow.json');
});

test('tokenDelta follows the orchestrator formula and tolerates missing fields', () => {
  assert.equal(tokenDelta({ sessionStart: 14900000, lastKnownRemaining: 14200000, accumulated: 100000 }), 800000);
  assert.equal(tokenDelta({ sessionStart: 10, lastKnownRemaining: 4 }), 6);
  assert.equal(tokenDelta(null), null);
  assert.equal(tokenDelta({ sessionStart: 'x' }), null);
});

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
  fs.mkdirSync(path.join(dir, '.constellation', 'state'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.constellation', 'metrics'), { recursive: true });
  fs.copyFileSync(path.join(here, '..', 'templates', 'tracks.json'), path.join(dir, '.constellation', 'tracks.json'));
  fs.writeFileSync(path.join(dir, '.constellation', 'config.json'), '{}');
  return dir;
}

test('loadSnapshot: no state file is a normal empty state', () => {
  const dir = tmpProject();
  const snap = loadSnapshot(dir);
  assert.equal(snap.state, null);
  assert.equal(snap.progress, null);
  assert.equal(snap.stale, false);
  assert.equal(snap.initialized, true);
  assert.deepEqual(snap.errors, []);
});

test('loadSnapshot: truncated state file keeps the previous snapshot and flags stale', () => {
  const dir = tmpProject();
  const stateFile = path.join(dir, '.constellation', 'state', 'current-workflow.json');
  fs.writeFileSync(stateFile, JSON.stringify({ track: 'tweak', currentStep: 'engineer', completedSteps: ['devops-branch'], tokens: { sessionStart: 100, lastKnownRemaining: 90, accumulated: 0 } }));
  const good = loadSnapshot(dir);
  assert.equal(good.progress.n, 2);
  assert.equal(good.tokenDelta, 10);

  fs.writeFileSync(stateFile, '{"track": "tweak", "currentStep": "lint-ga');
  const next = loadSnapshot(dir, good);
  assert.equal(next.stale, true);
  assert.equal(next.state.currentStep, 'engineer', 'previous state kept');
  assert.ok(next.errors.some((e) => e.startsWith('current-workflow.json:')));
});

test('loadSnapshot: tails events.jsonl and skips partial lines', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, '.constellation', 'metrics', 'events.jsonl'),
    '{"ts":"2026-10-03T10:00:00Z","event":"SubagentStart","agent_id":"a1","agent_type":"x"}\n{"ts":"2026-10-03T10:00:0');
  const snap = loadSnapshot(dir);
  assert.equal(snap.agents.length, 1);
  assert.equal(snap.agents[0].running, true);
});

// Observed live in guardei-ui on 05-10-2026: a SubagentStop with an id that matches no
// start and an empty agent_type, while the real specialist kept running.
test('pairEvents: unmatched SubagentStop without agent_type is a counted helper, not an agent', () => {
  const { agents, activity, helperStops } = pairEvents(parseEventLines([
    '{"ts":"2026-10-05T14:03:43Z","event":"SubagentStart","agent_id":"a936","agent_type":"constellation:software-architect"}',
    '{"ts":"2026-10-05T14:04:14Z","event":"SubagentStop","agent_id":"a3df","agent_type":""}',
    '{"ts":"2026-10-05T14:05:45Z","event":"SubagentStop","agent_id":"adf4","agent_type":""}',
  ].join('\n')));
  assert.equal(agents.length, 1);
  assert.equal(agents[0].agent_id, 'a936');
  assert.equal(agents[0].running, true);
  assert.equal(activity.length, 0);
  assert.equal(helperStops, 2);
});

test('pairEvents: unmatched SubagentStop WITH an agent_type still becomes an agent row', () => {
  const { agents } = pairEvents(parseEventLines(
    '{"ts":"2026-10-05T14:04:14Z","event":"SubagentStop","agent_id":"zz","agent_type":"constellation:sdet"}',
  ));
  assert.equal(agents.length, 1);
  assert.equal(agents[0].running, false);
  assert.equal(agents[0].start, null);
});

// ---------------------------------------------------------------------------
// Work items — parser, tree, transitions, feed, renderer
// ---------------------------------------------------------------------------

const doc = (lines) => ['---', ...lines, '---', '', '# Title'].join('\n');
const MTIME = '2026-10-06T10:00:00.000Z';
const mk = (kind, file, lines, mtime = MTIME) => toNode(kind, file, doc(lines), mtime);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

test('parseFrontMatter: well-formed task yields fields and no warnings', () => {
  const r = parseFrontMatter(doc(['status: refined', 'type: feature', 'order: 2']), 'task');
  assert.deepEqual(r.fields, { status: 'refined', type: 'feature', order: '2' });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.malformed, false);
});

test('parseFrontMatter: title line before --- is lenient with a reason', () => {
  const r = parseFrontMatter('# My task\n' + doc(['status: inbox']), 'task');
  assert.deepEqual(r.warnings, ['title before front-matter']);
  assert.equal(r.malformed, false);
  assert.equal(r.fields.status, 'inbox');
});

test('parseFrontMatter: unknown field is lenient with the field name', () => {
  const r = parseFrontMatter(doc(['status: draft', 'version: 2']), 'plan');
  assert.deepEqual(r.warnings, ['unknown field: version']);
  assert.equal(r.malformed, false);
});

test('parseFrontMatter: no front-matter is malformed', () => {
  const text = '# Title\n' + '\n'.repeat(12) + '---\nstatus: inbox\n---\n';
  const r = parseFrontMatter(text, 'task');
  assert.equal(r.malformed, true);
  assert.deepEqual(r.warnings, ['no front-matter']);
});

test('parseFrontMatter: unclosed front-matter is malformed', () => {
  const text = '---\nstatus: inbox\n' + 'order: 1\n'.repeat(50) + '---\n';
  const r = parseFrontMatter(text, 'task');
  assert.equal(r.malformed, true);
  assert.deepEqual(r.warnings, ['unclosed front-matter']);
});

test('parseFrontMatter: missing status is malformed', () => {
  const r = parseFrontMatter(doc(['type: fix']), 'task');
  assert.equal(r.malformed, true);
  assert.deepEqual(r.warnings, ['status missing']);
});

test('parseFrontMatter: inline comment is stripped from the value', () => {
  const r = parseFrontMatter(doc(['status: inbox   # queued']), 'task');
  assert.equal(r.fields.status, 'inbox');
  assert.deepEqual(r.warnings, []);
});

test('parseFrontMatter: CRLF file parses with no warnings', () => {
  const r = parseFrontMatter(doc(['status: inbox', 'type: fix']).replace(/\n/g, '\r\n'), 'task');
  assert.deepEqual(r.fields, { status: 'inbox', type: 'fix' });
  assert.deepEqual(r.warnings, []);
});

test('parseFrontMatter: BOM file has no title warning', () => {
  const r = parseFrontMatter('\uFEFF' + doc(['status: inbox']), 'task');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.fields.status, 'inbox');
});

test('parseFrontMatter: quoted and capitalized status normalizes', () => {
  assert.equal(parseFrontMatter(doc(['status: "Done"']), 'task').fields.status, 'done');
  assert.equal(parseFrontMatter(doc(["status: 'Parked'"]), 'task').fields.status, 'parked');
});

test('toNode: numbered prefixes yield ids, other names warn', () => {
  assert.equal(mk('epic', 'E01-x.md', ['status: active']).id, 'E01');
  assert.equal(mk('feature', 'F001-y.md', ['status: active']).id, 'F001');
  const numbered = mk('task', '014-z.md', ['status: inbox']);
  assert.equal(numbered.id, '014');
  assert.equal(numbered.name, 'z');
  const plain = mk('task', 'worktree-per-workflow.md', ['status: inbox']);
  assert.equal(plain.id, null);
  assert.equal(plain.name, 'worktree-per-workflow');
  assert.deepEqual(plain.warnings, ['no number in file name']);
  assert.deepEqual(plain.flags, ['lenient']);
});

test('toNode: wire node carries no raw fields map', () => {
  const n = mk('task', '001-a.md', ['status: inbox', 'feature: F001-x.md', 'order: 3']);
  assert.equal(n.fields, undefined);
  assert.deepEqual(n.links, { feature: 'F001-x.md' });
  assert.equal(n.order, 3);
  assert.equal(n.mtime, MTIME);
});

const v1Nodes = () => [
  mk('epic', 'E01-mvp.md', ['status: active']),
  mk('feature', 'F002-b.md', ['status: active', 'epic: E01-mvp.md', 'order: 2']),
  mk('feature', 'F001-a.md', ['status: active', 'epic: E01-mvp.md', 'order: 1']),
  mk('task', '001-one.md', ['status: done', 'type: feature', 'feature: F001-a.md']),
  mk('task', '002-two.md', ['status: refined', 'type: feature', 'feature: F001-a.md']),
  mk('task', '003-three.md', ['status: inbox', 'type: fix', 'feature: F002-b.md']),
  mk('task', '004-four.md', ['status: in-progress', 'type: fix', 'feature: F002-b.md']),
  mk('plan', '002-two.md', ['status: draft', 'task: 002-two.md']),
  mk('plan', '004-four.md', ['status: approved', 'task: 004-four.md']),
];

test('buildTree: v1 fixture attaches features, tasks, and plans', () => {
  const t = buildTree(v1Nodes(), null);
  assert.equal(t.epics.length, 1);
  assert.deepEqual(t.epics[0].features.map((f) => f.file), ['F001-a.md', 'F002-b.md']);
  assert.deepEqual(t.epics[0].features[0].tasks, ['001-one.md', '002-two.md']);
  assert.deepEqual(t.epics[0].features[1].tasks, ['003-three.md', '004-four.md']);
  assert.equal(t.tasks.length, 4);
  assert.equal(t.tasks.find((x) => x.file === '002-two.md').plan.status, 'draft');
  assert.equal(t.tasks.find((x) => x.file === '004-four.md').plan.status, 'approved');
  assert.equal(t.tasks.find((x) => x.file === '001-one.md').plan, null);
  assert.deepEqual([t.counts.done, t.counts.refined, t.counts.inbox, t.counts['in-progress'], t.counts.other], [1, 1, 1, 1, 0]);
  assert.deepEqual(t.attention, []);
});

test('buildTree: task without feature is standalone', () => {
  const t = buildTree([mk('feature', 'F001-a.md', ['status: active']), mk('task', '001-x.md', ['status: inbox'])], null);
  assert.deepEqual(t.standaloneTasks, ['001-x.md']);
  assert.deepEqual(t.orphanFeatures[0].tasks, []);
});

test('buildTree: missing link target is lenient and orphaned', () => {
  const t = buildTree([mk('task', '001-x.md', ['status: inbox', 'feature: F999-x.md'])], null);
  assert.deepEqual(t.standaloneTasks, ['001-x.md']);
  assert.deepEqual(t.tasks[0].warnings, ['missing link: F999-x.md']);
  assert.deepEqual(t.tasks[0].flags, ['lenient']);
});

test('buildTree: malformed task stays in the flat list, the counts, and attention', () => {
  const t = buildTree([mk('task', '001-x.md', ['type: fix'])], null);
  assert.equal(t.tasks.length, 1);
  assert.equal(t.counts.malformed, 1);
  assert.deepEqual(t.attention, [{ kind: 'task', file: '001-x.md', flags: ['malformed'], warnings: ['status missing'] }]);
  assert.deepEqual(t.tasks[0].flags, ['malformed']);
});

test('buildTree: unknown status lands in other with a warning', () => {
  const t = buildTree([mk('task', '001-x.md', ['status: in-progres'])], null);
  assert.equal(t.tasks[0].group, 'other');
  assert.deepEqual(t.tasks[0].warnings, ['unknown status: in-progres']);
  assert.equal(t.counts.other, 1);
});

test('buildTree: siblings sort by order then file name', () => {
  const t = buildTree([
    mk('task', '001-a.md', ['status: inbox']),
    mk('task', '003-c.md', ['status: inbox', 'order: 2']),
    mk('task', '002-b.md', ['status: inbox', 'order: 1']),
  ], null);
  assert.deepEqual(t.tasks.map((x) => x.file), ['002-b.md', '003-c.md', '001-a.md']);
});

test('buildTree: state.task marks the in-flight task with its step', () => {
  const nodes = [mk('task', '001-a.md', ['status: in-progress']), mk('task', '002-b.md', ['status: inbox'])];
  const t = buildTree(nodes, { task: '001-a.md', branch: '002-b.md', currentStep: 'engineer' });
  assert.equal(t.tasks[0].inFlight, true);
  assert.equal(t.tasks[0].currentStep, 'engineer');
  assert.equal(t.tasks[1].inFlight, false);
});

const mismatchNodes = () => [
  mk('task', '014-b.md', ['status: refined']),
  mk('plan', '099-a.md', ['status: draft', 'task: 014-b.md']),
];

test('buildTree: plan task link wins over the file name', () => {
  const nodes = [...mismatchNodes(), mk('task', '099-a.md', ['status: inbox'])];
  const t = buildTree(nodes, null);
  assert.equal(t.tasks.find((x) => x.file === '014-b.md').plan.file, '099-a.md');
  assert.equal(t.tasks.find((x) => x.file === '099-a.md').plan, null);
});

test('buildTree: differing task link adds task link mismatch', () => {
  const t = buildTree(mismatchNodes(), null);
  const entry = t.attention.find((a) => a.kind === 'plan');
  assert.deepEqual(entry.warnings, ['task link mismatch']);
  assert.deepEqual(entry.flags, ['lenient']);
});

test('buildTree: plan without task is orphaned and needs attention', () => {
  const t = buildTree([mk('plan', '050-x.md', ['status: draft', 'task: 050-x.md'])], null);
  assert.equal(t.orphanPlans[0].file, '050-x.md');
  assert.deepEqual(t.orphanPlans[0].warnings, ['plan without task']);
  assert.equal(t.attention[0].file, '050-x.md');
});

test('diffStatuses: status change yields one transition with the mtime', () => {
  const prev = [{ file: '001-a.md', status: 'refined', flags: [], mtime: 'old' }];
  const next = [{ file: '001-a.md', status: 'in-progress', flags: [], mtime: '2026-10-06T10:00:01.000Z' }];
  assert.deepEqual(diffStatuses(prev, next), [{ kind: 'transition', file: '001-a.md', from: 'refined', to: 'in-progress', ts: '2026-10-06T10:00:01.000Z' }]);
});

test('diffStatuses: unchanged tasks and null prev yield nothing', () => {
  const same = [{ file: '001-a.md', status: 'refined', flags: [], mtime: MTIME }];
  assert.deepEqual(diffStatuses(same, same), []);
  assert.deepEqual(diffStatuses(null, same), []);
});

test('diffStatuses: new task yields from null', () => {
  const next = [{ file: '002-b.md', status: 'inbox', flags: [], mtime: MTIME }];
  assert.deepEqual(diffStatuses([], next).map((t) => [t.from, t.to]), [[null, 'inbox']]);
});

test('diffStatuses: malformed next node is skipped', () => {
  const prev = [{ file: '001-a.md', status: 'refined', flags: [], mtime: MTIME }];
  const next = [{ file: '001-a.md', status: null, flags: ['malformed'], mtime: MTIME }];
  assert.deepEqual(diffStatuses(prev, next), []);
});

test('diffStatuses: prev node without status is skipped', () => {
  const prev = [{ file: '001-a.md', status: null, flags: ['malformed'], mtime: MTIME }];
  const next = [{ file: '001-a.md', status: 'refined', flags: [], mtime: MTIME }];
  assert.deepEqual(diffStatuses(prev, next), []);
});

const transition = (n) => ({ kind: 'transition', file: `00${n}-a.md`, from: 'inbox', to: 'refined', ts: `2026-10-06T10:00:0${n}.000Z` });

test('collapseBurst: four changes collapse to one summary', () => {
  const four = [1, 2, 3, 4].map(transition);
  const out = collapseBurst(four);
  assert.equal(out.length, 1);
  assert.equal(out[0].summary, true);
  assert.equal(out[0].kind, 'summary');
  assert.equal(out[0].count, 4);
  assert.equal(out[0].ts, '2026-10-06T10:00:04.000Z');
  assert.equal(out[0].items.length, 4);
});

test('collapseBurst: three changes stay as three', () => {
  const three = [1, 2, 3].map(transition);
  assert.deepEqual(collapseBurst(three), three);
});

test('mergeFeed: orders entries by time across both sources', () => {
  const feed = mergeFeed(
    [{ ts: '2026-10-06T10:00:05Z', event: 'Stop' }, { ts: 'garbage', event: 'Old' }],
    [{ kind: 'transition', file: 'a', from: null, to: 'inbox', ts: '2026-10-06T10:00:05.500Z' }, { kind: 'transition', file: 'b', from: null, to: 'inbox', ts: '2026-10-06T10:00:05.100Z' }],
  );
  assert.deepEqual(feed.map((e) => e.file ?? e.event), ['a', 'b', 'Stop', 'Old']);
  assert.equal(feed[2].kind, 'event');
});

test('mergeFeed: transitions appear when activity is empty', () => {
  const t = transition(1);
  assert.deepEqual(mergeFeed([], [t]), [t]);
});

test('mergeFeed: output is capped at the limit', () => {
  const activity = Array.from({ length: 40 }, (_, i) => ({ ts: new Date(Date.UTC(2026, 9, 6, 10, 0, i)).toISOString(), event: 'Stop' }));
  const feed = mergeFeed(activity, []);
  assert.equal(feed.length, 30);
  assert.equal(feed[0].ts, activity[39].ts);
});

test('safeRefresh: a throwing loader keeps the previous snapshot', () => {
  const prev = Object.freeze({ projectDir: '/p', state: { track: 'tweak' }, errors: Object.freeze(['old']) });
  const out = safeRefresh(() => { throw new Error('boom'); }, prev, '/p');
  assert.deepEqual(out.state, { track: 'tweak' });
  assert.deepEqual(out.errors, ['old', 'refresh failed: boom']);
  assert.deepEqual(prev.errors, ['old']);
  const fresh = safeRefresh(() => { throw new Error('boom'); }, null, '/p');
  assert.equal(fresh.projectDir, '/p');
  assert.deepEqual(fresh.errors, ['refresh failed: boom']);
  assert.equal(safeRefresh(() => ({ ok: 1 }), prev, '/p').ok, 1);
});

const rendererTree = () => buildTree([
  mk('feature', 'F001-a.md', ['status: active']),
  mk('task', '001-open.md', ['status: refined', 'feature: F001-a.md']),
  mk('task', '002-done.md', ['status: done', 'feature: F001-a.md']),
  mk('task', '003-done.md', ['status: done', 'feature: F001-a.md']),
  mk('task', '004-odd.md', ['status: in-progres']),
  mk('task', '005-broken.md', ['type: fix']),
  mk('plan', '001-open.md', ['status: draft', 'task: 001-open.md']),
], { task: '001-open.md', currentStep: 'engineer' });

test('renderBacklog: every task file appears, including malformed and other', () => {
  const html = renderBacklog(rendererTree(), esc);
  for (const f of ['001-open.md', '002-done.md', '003-done.md', '004-odd.md', '005-broken.md']) assert.ok(html.includes(`data-file="${f}"`), f);
  assert.ok(html.includes('▶ engineer'));
  assert.ok(html.includes('📝'));
  assert.equal(renderBacklog(null, esc), '<div class="empty">No work items</div>');
});

test('renderBacklog: file names are escaped', () => {
  const tree = buildTree([mk('task', '<img src=x onerror=alert(1)>.md', ['status: inbox'])], null);
  const html = renderBacklog(tree, esc);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
});

test('renderBacklog: Needs attention lists malformed and lenient items with warnings', () => {
  const html = renderBacklog(rendererTree(), esc);
  const block = html.slice(html.indexOf('Needs attention'));
  assert.ok(html.includes('Needs attention'));
  assert.ok(block.includes('005-broken.md') && block.includes('status missing'));
  assert.ok(block.includes('004-odd.md') && block.includes('unknown status: in-progres'));
  assert.ok(html.includes('<div class="warn-line">unknown status: in-progres</div>'));
  assert.ok(!html.includes('<details><summary>Needs'));
});

test('renderBacklog: done and dropped collapse in details with counts', () => {
  const html = renderBacklog(rendererTree(), esc);
  assert.ok(html.includes('<details data-group="F001-a.md:done"><summary>2 done</summary>'));
  const attn = html.slice(html.indexOf('class="attn"'), html.indexOf('class="grp"'));
  assert.ok(!attn.includes('<details'));
  assert.ok(!html.slice(0, html.indexOf('<details')).includes('002-done.md'));
});

test('renderBacklog: source runs with no module scope', () => {
  const isolated = new Function('return ' + renderBacklog.toString())();
  const tree = rendererTree();
  assert.equal(isolated(tree, esc), renderBacklog(tree, esc));
});
