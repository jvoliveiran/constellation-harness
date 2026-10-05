// Tests for the pure functions of board.mjs. Run: node --test plugins/constellation/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSteps, pairEvents, parseEventLines, tokenDelta, loadSnapshot } from './board.mjs';

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
