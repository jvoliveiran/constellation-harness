// Tests for board-session.mjs. Run: node --test plugins/constellation/scripts/
// Every transcript here is synthetic. No test reads the real ~/.claude.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSnapshot } from './board.mjs';
import {
  SESSION_CAP_BYTES, createSessionReader,
  projectSlugOf, usageOf, sumUsage, extractReport, appendToGroup, checkTranscriptPath, derivedPath, sessionsOf,
  workflowSessions, workflowAgents,
} from './board-session.mjs';

const SID = '11111111-2222-4333-8444-555555555555';
const OTHER_SID = '22222222-3333-4444-8555-666666666666';
const AID = 'a0e575badeb8675d0';
const OTHER_AID = 'b1f686cbefc9786e1';
const ROOT = '/fake/home/.claude/projects';
const ROOTS = { lexicalRoot: ROOT, realRoot: ROOT, projectSlug: '-proj' };
const MAIN = `${ROOT}/-proj/${SID}.jsonl`;

const entry = (id, output, extra = {}) => ({ id, ts: Date.parse('2026-10-21T10:00:00.000Z'), input: 10, cacheCreate: 20, cacheRead: 30, output, ...extra });

test('sumUsage: lines that repeat one message.id count once, and the last line wins', () => {
  const total = sumUsage([entry('m1', 16), entry('m1', 16), entry('m1', 299)], null);
  assert.equal(total.output, 299);
  assert.equal(total.input, 10);
  assert.equal(total.cache, 50);
  assert.equal(total.spent, 10 + 50 + 299);
});

test('sumUsage: entries before startedAt and entries without a parseable timestamp drop out', () => {
  const cut = Date.parse('2026-10-21T09:00:00Z');
  const entries = [
    entry('before', 1, { ts: cut - 1000 }),
    entry('at', 2, { ts: cut }),
    entry('nan', 4, { ts: NaN }),
  ];
  assert.equal(sumUsage(entries, cut).output, 2);
  assert.equal(sumUsage(entries, null).output, 1 + 2 + 4);
});

const line = (id, blocks) => ({ type: 'assistant', message: { id, content: blocks } });
const fold = (lines) => lines.reduce(appendToGroup, null);
const thinking = { type: 'thinking', thinking: 'THINK-SECRET' };
const handback = (message) => ({ type: 'tool_use', name: 'SubagentHandback', input: { message } });

test('extractReport: the last SubagentHandback message is the report', () => {
  const group = fold([
    line('m1', [thinking]),
    line('m1', [{ type: 'text', text: 'prose' }]),
    line('m1', [handback('# Final\n\nreport')]),
  ]);
  assert.deepEqual(extractReport(group), { report: '# Final\n\nreport', truncated: false, error: null });
});

test('extractReport: without a handback, the text blocks of the last message join', () => {
  const group = fold([
    line('m1', [{ type: 'text', text: 'EARLIER' }]),
    line('m2', [{ type: 'text', text: 'one' }]),
    line('m2', [{ type: 'tool_use', name: 'Bash', input: { command: 'TOOL-SECRET' } }]),
    line('m2', [{ type: 'text', text: 'two' }]),
  ]);
  const result = extractReport(group);
  assert.equal(result.report, 'one\n\ntwo');
  assert.equal(JSON.stringify(group).includes('TOOL-SECRET'), false);
  assert.deepEqual(extractReport(fold([])), { report: null, truncated: false, error: 'no report' });
  assert.equal(extractReport(fold([line('m1', [thinking])])).error, 'no report');
});

test('extractReport: a report over 256 KB keeps its first 256 KB and sets truncated', () => {
  const big = extractReport(fold([line('m1', [handback('é'.repeat(300 * 1024))])]));
  assert.equal(big.truncated, true);
  assert.ok(Buffer.byteLength(big.report) <= 256 * 1024);
  assert.ok(Buffer.byteLength(big.report) > 256 * 1024 - 4);
  assert.equal(big.report.includes('�'), false);
  const small = extractReport(fold([line('m1', [handback('0123456789')])]));
  assert.equal(small.truncated, false);
  assert.equal(small.report, '0123456789');
});

test('usageOf: keeps only the id, the time, and the four numbers', () => {
  const obj = {
    type: 'assistant', timestamp: '2026-10-21T10:00:00.123Z',
    message: { id: 'm1', content: [{ type: 'text', text: 'PROMPT-SECRET' }], usage: { input_tokens: 5, cache_creation_input_tokens: 'x', cache_read_input_tokens: -3, output_tokens: 7, extra: 'SECRET' } },
  };
  const usage = usageOf(obj);
  assert.deepEqual(Object.keys(usage), ['id', 'ts', 'input', 'cacheCreate', 'cacheRead', 'output']);
  assert.deepEqual(usage, { id: 'm1', ts: Date.parse('2026-10-21T10:00:00.123Z'), input: 5, cacheCreate: 0, cacheRead: 0, output: 7 });
  assert.equal(JSON.stringify(usage).includes('SECRET'), false);
  assert.equal(usageOf({ type: 'user', message: { id: 'm', usage: {} } }), null);
  assert.equal(usageOf({ type: 'assistant', message: { usage: {} } }), null);
  assert.equal(Number.isNaN(usageOf({ type: 'assistant', message: { id: 'm', usage: {} } }).ts), true);
});

test('checkTranscriptPath: names, absolute paths, normalization, and the root prefix', () => {
  const mainCtx = { sessionId: SID, ...ROOTS };
  const agentCtx = { sessionId: SID, agentId: AID, mainPath: MAIN, ...ROOTS };
  const agentPath = derivedPath('agent', MAIN, SID, AID);
  const metaPath = derivedPath('meta', MAIN, SID, AID);
  assert.equal(checkTranscriptPath('main', MAIN, mainCtx), null);
  assert.equal(checkTranscriptPath('agent', agentPath, agentCtx), null);
  assert.equal(checkTranscriptPath('meta', metaPath, agentCtx), null);
  assert.equal(checkTranscriptPath('main', `${ROOT}/-proj/x.jsonl`, mainCtx), 'name');
  assert.equal(checkTranscriptPath('agent', `${path.dirname(agentPath)}/agent-XYZ.jsonl`, agentCtx), 'name');
  assert.equal(checkTranscriptPath('meta', agentPath, agentCtx), 'name');
  assert.equal(checkTranscriptPath('main', `${ROOT}/-proj/../x/${SID}.jsonl`, mainCtx), 'bad path');
  assert.equal(checkTranscriptPath('main', `-proj/${SID}.jsonl`, mainCtx), 'bad path');
  assert.equal(checkTranscriptPath('main', `${ROOT}/-proj/\0${SID}.jsonl`, mainCtx), 'bad path');
  assert.equal(checkTranscriptPath('main', `${ROOT}/${'d'.repeat(1025)}/${SID}.jsonl`, mainCtx), 'bad path');
  assert.equal(checkTranscriptPath('main', 42, mainCtx), 'bad path');
  assert.equal(checkTranscriptPath('main', `/elsewhere/-proj/${SID}.jsonl`, mainCtx), 'outside root');
  assert.equal(checkTranscriptPath('main', MAIN, { sessionId: SID, lexicalRoot: ROOT, realRoot: null, projectSlug: '-proj' }), 'no session root');
  assert.equal(checkTranscriptPath('main', `/real/projects/-p/${SID}.jsonl`, { sessionId: SID, lexicalRoot: ROOT, realRoot: '/real/projects', projectSlug: '-p' }), null);
});

test('checkTranscriptPath: an agent path must be the derived path of its line', () => {
  const ctx = { sessionId: SID, agentId: AID, mainPath: MAIN, ...ROOTS };
  const foreignFolder = derivedPath('agent', `${ROOT}/-proj/${OTHER_SID}.jsonl`, OTHER_SID, AID);
  const otherId = derivedPath('agent', MAIN, SID, OTHER_AID);
  assert.equal(checkTranscriptPath('agent', foreignFolder, ctx), 'foreign session');
  assert.equal(checkTranscriptPath('agent', otherId, ctx), 'agent id mismatch');
  assert.equal(checkTranscriptPath('main', `${ROOT}/-proj/${OTHER_SID}.jsonl`, { sessionId: SID, ...ROOTS }), 'foreign session');
  assert.equal(checkTranscriptPath('agent', derivedPath('agent', MAIN, SID, AID), { ...ctx, mainPath: null }), 'foreign session');
});

const at = (hhmm) => `2026-10-21T${hhmm}:00Z`;
const SINCE = Date.parse(at('09:00'));

test('sessionsOf and the workflow sessions: only sessions with an agent or a state write since startedAt count', () => {
  const sessionLine = (sid, event, ts, extra = {}) => ({ ts, event, session_id: sid, transcript_path: `${ROOT}/-proj/${sid}.jsonl`, ...extra });
  const SID_C = '33333333-4444-4555-8666-777777777777';
  const SID_D = '44444444-5555-4666-8777-888888888888';
  const events = [
    sessionLine(SID, 'SubagentStart', at('09:05'), { agent_id: AID, agent_type: 'constellation:sdet' }),
    sessionLine(OTHER_SID, 'Stop', at('09:10')),
    sessionLine(SID_C, 'SubagentStart', at('08:00'), { agent_id: OTHER_AID, agent_type: 'constellation:sdet' }),
    sessionLine(SID_D, 'PostToolUse', at('09:30'), { file: '.constellation/state/current-workflow.json' }),
    { ts: at('09:31'), event: 'Stop', session_id: SID_D, transcript_path: '/elsewhere/x.jsonl' },
  ];
  const named = sessionsOf(events, ROOTS);
  assert.deepEqual([...named.keys()].sort(), [SID, OTHER_SID, SID_C, SID_D].sort());
  assert.equal(named.get(SID_D).path, `${ROOT}/-proj/${SID_D}.jsonl`);
  assert.deepEqual([...workflowSessions(events, SINCE)].sort(), [SID, SID_D].sort());
});

test('sessionsOf: a path outside the root names a reason and no path', () => {
  const named = sessionsOf([{ session_id: SID, transcript_path: `/elsewhere/-p/${SID}.jsonl` }], ROOTS);
  assert.deepEqual(named.get(SID), { path: null, reason: 'outside root' });
});

test('workflowAgents: keeps agents of workflow sessions that start at or after startedAt', () => {
  const events = [
    { ts: at('08:00'), event: 'SubagentStart', session_id: SID, agent_id: OTHER_AID, agent_type: 'x' },
    { ts: at('09:05'), event: 'SubagentStart', session_id: SID, agent_id: AID, agent_type: 'x', description: 'Plan it' },
    { ts: at('09:06'), event: 'SubagentStop', session_id: SID, agent_id: AID, agent_type: 'x', agent_transcript_path: '/p/agent-a.jsonl' },
    { ts: at('09:07'), event: 'SubagentStart', session_id: OTHER_SID, agent_id: 'c2a797dcf0da897f2', agent_type: 'x' },
    { ts: at('09:08'), event: 'SubagentStart', session_id: SID, agent_id: '../bad', agent_type: 'x' },
  ];
  const agents = workflowAgents(events, new Set([SID]), SINCE);
  assert.deepEqual([...agents.keys()], [AID]);
  assert.deepEqual(agents.get(AID), { sessionId: SID, start: at('09:05'), end: at('09:06'), stopPath: '/p/agent-a.jsonl', description: 'Plan it' });
});

// ---------------------------------------------------------------------------
// The reader. Each test builds a temp root: <tmp>/projects/-p/<uuid>.jsonl plus a subagents folder.
// ---------------------------------------------------------------------------

const STARTED = '2026-10-21T09:00:00Z';
const STATE = { track: 'planned', currentStep: 'engineer', completedSteps: [], startedAt: STARTED };
const tmpDirs = [];
after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

const usage = (input, create, read, output) => ({ input_tokens: input, cache_creation_input_tokens: create, cache_read_input_tokens: read, output_tokens: output });
const asst = (id, ts, use, content = [{ type: 'text', text: 'reply' }], extra = {}) => (
  { type: 'assistant', timestamp: ts, message: { id, model: 'model-x', usage: use, content, ...extra } }
);
const jsonl = (objs) => objs.map((o) => JSON.stringify(o)).join('\n') + '\n';

function world() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'board-session-')));
  tmpDirs.push(tmp);
  const root = path.join(tmp, 'projects');
  const slug = path.join(root, '-p');
  fs.mkdirSync(path.join(slug, SID, 'subagents'), { recursive: true });
  const main = path.join(slug, `${SID}.jsonl`);
  const agentFile = (id, sid = SID) => path.join(slug, sid, 'subagents', `agent-${id}.jsonl`);
  const metaFile = (id) => path.join(slug, SID, 'subagents', `agent-${id}.meta.json`);
  const stateEv = (mainPath = main, sid = SID) => ({ ts: at('09:01'), event: 'PostToolUse', session_id: sid, transcript_path: mainPath, file: '.constellation/state/current-workflow.json' });
  const startEv = (id, hhmm = '09:05', type = 'constellation:software-engineer') => ({ ts: at(hhmm), event: 'SubagentStart', session_id: SID, transcript_path: main, agent_id: id, agent_type: type });
  const stopEv = (id, hhmm = '09:06', stopPath = agentFile(id), type = 'constellation:software-engineer') => ({ ts: at(hhmm), event: 'SubagentStop', session_id: SID, transcript_path: main, agent_id: id, agent_type: type, agent_transcript_path: stopPath });
  return { tmp, root, slug, main, agentFile, metaFile, stateEv, startEv, stopEv };
}

function projectDirOf(state = STATE) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'board-project-')));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.constellation', 'state'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.constellation', 'metrics'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.constellation', 'config.json'), '{}');
  if (state) fs.writeFileSync(path.join(dir, '.constellation', 'state', 'current-workflow.json'), JSON.stringify(state));
  return dir;
}

const spies = (fn) => {
  const calls = [];
  const originals = { stderr: process.stderr.write, error: console.error, out: process.stdout.write, log: console.log };
  process.stderr.write = (...a) => { calls.push(a); return true; };
  process.stdout.write = (...a) => { calls.push(a); return true; };
  console.error = (...a) => { calls.push(a); };
  console.log = (...a) => { calls.push(a); };
  try { fn(); } finally {
    process.stderr.write = originals.stderr; process.stdout.write = originals.out;
    console.error = originals.error; console.log = originals.log;
  }
  return calls;
};

// A line of exactly `size` bytes with a newline, padded inside a field of the object.
const sized = (obj, size) => {
  const base = JSON.stringify({ ...obj, pad: '' });
  return `${JSON.stringify({ ...obj, pad: 'x'.repeat(size - 1 - base.length) })}\n`;
};

test('reader: a file over the cap reads its last cap once, drops the cut line, then reads only appended bytes', () => {
  assert.equal(SESSION_CAP_BYTES, 33554432);
  const w = world();
  const line = (i, size) => sized({ type: 'assistant', timestamp: '2026-10-21T10:00:00.000Z', message: { id: `m${i}`, usage: usage(0, 0, 0, i) } }, size);
  const sizes = [210, 270, 270, 270, 260];
  fs.writeFileSync(w.main, sizes.map((size, i) => line(i + 1, size)).join(''));
  assert.equal(fs.statSync(w.main).size, 1280);
  const reader = createSessionReader({ projectSlug: '-p', root: w.root, capBytes: 1024 });
  const first = reader.sync({ events: [w.stateEv()], state: STATE });
  assert.equal(reader.bytesRead, 1024);
  assert.equal(first.tokens.output, 3 + 4 + 5);
  reader.sync({ events: [w.stateEv()], state: STATE });
  assert.equal(reader.bytesRead, 1024);
  fs.appendFileSync(w.main, line(6, 260));
  const next = reader.sync({ events: [w.stateEv()], state: STATE });
  assert.equal(reader.bytesRead, 1284);
  assert.equal(next.tokens.output, 12 + 6);
});

test('reader: a path outside the root and a bad name read nothing and add one refused line without the path', () => {
  const w = world();
  const outside = path.join(w.tmp, 'outside');
  fs.mkdirSync(outside);
  const outsidePath = path.join(outside, `${OTHER_SID}.jsonl`);
  fs.writeFileSync(outsidePath, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(1, 1, 1, 1))]));
  const badName = path.join(w.slug, 'x.jsonl');
  fs.writeFileSync(badName, jsonl([asst('m2', '2026-10-21T10:00:00Z', usage(1, 1, 1, 1))]));
  const events = [w.stateEv(outsidePath, OTHER_SID), w.stateEv(badName, '33333333-4444-4555-8666-777777777777')];
  const reader = createSessionReader({ projectSlug: '-p', root: w.root });
  const result = reader.sync({ events, state: STATE });
  assert.equal(reader.bytesRead, 0);
  assert.deepEqual(result.errors.sort(), ['transcript: refused: name', 'transcript: refused: outside root']);
  assert.equal(result.errors.some((e) => e.includes(w.tmp)), false);
  assert.equal(result.tokens, null);
});

test('reader: a symlink at the file or at a folder below the root is refused', () => {
  const w = world();
  const real = path.join(w.tmp, 'real');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'target.jsonl'), jsonl([asst('m9', '2026-10-21T10:00:00Z', usage(1, 1, 1, 1))]));
  const linkedSid = '55555555-6666-4777-8888-999999999999';
  const linkedMain = path.join(w.slug, `${linkedSid}.jsonl`);
  fs.symlinkSync(path.join(real, 'target.jsonl'), linkedMain);
  const fileLink = createSessionReader({ projectSlug: '-p', root: w.root });
  const a = fileLink.sync({ events: [w.stateEv(linkedMain, linkedSid)], state: STATE });
  assert.deepEqual(a.errors, ['transcript: refused: symlink']);
  assert.equal(fileLink.bytesRead, 0);

  fs.writeFileSync(w.main, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1))]));
  fs.rmSync(path.join(w.slug, SID, 'subagents'), { recursive: true });
  fs.mkdirSync(path.join(w.tmp, 'elsewhere'));
  fs.symlinkSync(path.join(w.tmp, 'elsewhere'), path.join(w.slug, SID, 'subagents'));
  fs.writeFileSync(path.join(w.tmp, 'elsewhere', `agent-${AID}.jsonl`), jsonl([asst('m5', '2026-10-21T10:00:00Z', usage(100, 0, 0, 100))]));
  const folderLink = createSessionReader({ projectSlug: '-p', root: w.root });
  const b = folderLink.sync({ events: [w.stateEv(), w.startEv(AID)], state: STATE });
  assert.deepEqual(b.errors, ['transcript: refused: symlink']);
  assert.equal(b.agents.get(AID).transcript, false);
  assert.equal(b.tokens.spent, 2);
});

test('reader: a linked root still reads', () => {
  const w = world();
  fs.writeFileSync(w.main, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1))]));
  const link = path.join(w.tmp, 'link');
  fs.symlinkSync(w.root, link);
  const viaLink = path.join(link, '-p', `${SID}.jsonl`);
  const result = createSessionReader({ projectSlug: '-p', root: link }).sync({ events: [w.stateEv(viaLink)], state: STATE });
  assert.deepEqual(result.errors, []);
  assert.equal(result.tokens.spent, 2);
});

test('reader: an agent path in another session folder or with another agent id reads nothing', () => {
  const w = world();
  fs.writeFileSync(w.main, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1))]));
  const foreignDir = path.join(w.slug, OTHER_SID, 'subagents');
  fs.mkdirSync(foreignDir, { recursive: true });
  const loot = jsonl([asst('m7', '2026-10-21T10:00:00Z', usage(500, 0, 0, 500))]);
  const foreign = path.join(foreignDir, `agent-${AID}.jsonl`);
  const otherId = w.agentFile(OTHER_AID);
  fs.writeFileSync(foreign, loot);
  fs.writeFileSync(otherId, loot);
  const events = [w.stateEv(), w.startEv(AID), w.stopEv(AID, '09:06', foreign), w.startEv('c2a797dcf0da897f2'), w.stopEv('c2a797dcf0da897f2', '09:07', otherId)];
  const reader = createSessionReader({ projectSlug: '-p', root: w.root });
  const result = reader.sync({ events, state: STATE });
  assert.deepEqual(result.errors.sort(), ['transcript: refused: agent id mismatch', 'transcript: refused: foreign session']);
  assert.equal(result.agents.get(AID).transcript, false);
  assert.equal(result.agents.get('c2a797dcf0da897f2').transcript, false);
  assert.equal(result.tokens.spent, 2);
  assert.equal(reader.bytesRead, fs.statSync(w.main).size);
});

test('reader: the session sum covers the main transcript and three agent transcripts since startedAt', () => {
  const w = world();
  const T = '2026-10-21T10:00:00.250Z';
  fs.writeFileSync(w.main, jsonl([
    asst('old', '2026-10-21T08:59:59.000Z', usage(1000, 1000, 1000, 1000)),
    asst('m1', T, usage(1, 2, 3, 4)), asst('m1', T, usage(1, 2, 3, 40)),
    asst('m2', T, usage(5, 0, 0, 5)),
  ]));
  const ids = ['a000000000000000a', 'a000000000000000b', 'a000000000000000c'];
  ids.forEach((id, i) => {
    fs.writeFileSync(w.agentFile(id), jsonl([asst(`x${i}`, T, usage(10, 20, 30, 40 + i))]));
  });
  fs.writeFileSync(w.metaFile(ids[0]), JSON.stringify({ agentType: 'x', description: '  Build it  ', model: 'opus' }));
  const foreignSid = '66666666-7777-4888-8999-aaaaaaaaaaaa';
  const foreignMain = path.join(w.slug, `${foreignSid}.jsonl`);
  fs.writeFileSync(foreignMain, jsonl([asst('f1', T, usage(9999, 9999, 9999, 9999))]));
  const events = [w.stateEv(), ...ids.flatMap((id) => [w.startEv(id), w.stopEv(id)]),
    { ts: at('09:20'), event: 'Stop', session_id: foreignSid, transcript_path: foreignMain }];
  const reader = createSessionReader({ projectSlug: '-p', root: w.root });
  const result = reader.sync({ events, state: STATE });
  const main = { input: 1 + 5, cache: 5, output: 40 + 5 };
  const agents = { input: 30, cache: 150, output: 40 + 41 + 42 };
  assert.deepEqual(result.tokens, {
    spent: main.input + main.cache + main.output + agents.input + agents.cache + agents.output,
    input: main.input + agents.input, cache: main.cache + agents.cache, output: main.output + agents.output,
  });
  assert.deepEqual(result.agents.get(ids[0]), { transcript: true, description: 'Build it', model: 'opus' });
  assert.equal(result.agents.get(ids[1]).model, 'model-x');
  assert.deepEqual(result.errors, []);
});

test('reader: no main transcript text and no path reaches the snapshot', () => {
  const w = world();
  const project = projectDirOf();
  fs.writeFileSync(w.main, jsonl([
    { type: 'user', timestamp: '2026-10-21T10:00:00Z', message: { role: 'user', content: 'PROMPT-SECRET' } },
    asst('m1', '2026-10-21T10:00:01Z', usage(1, 1, 1, 1), [{ type: 'text', text: 'TEXT-SECRET' }, { type: 'tool_use', name: 'Bash', input: { command: 'TOOL-SECRET' } }]),
  ]));
  fs.writeFileSync(path.join(project, '.constellation', 'metrics', 'events.jsonl'), jsonl([w.stateEv()]));
  const snap = loadSnapshot(project, null, createSessionReader({ projectSlug: '-p', root: w.root }));
  assert.equal(snap.tokens.source, 'transcripts');
  assert.equal(snap.tokens.spent, 4);
  const text = JSON.stringify(snap);
  for (const secret of ['PROMPT-SECRET', 'TEXT-SECRET', 'TOOL-SECRET', w.root, w.main]) assert.equal(text.includes(secret), false, secret);
});

test('reader: a grown transcript gives the new sum at the next sync; a partial last line waits for its newline', () => {
  const w = world();
  const first = JSON.stringify(asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1)));
  const second = JSON.stringify(asst('m2', '2026-10-21T10:00:01Z', usage(0, 0, 0, 10)));
  fs.writeFileSync(w.main, `${first}\n`);
  const reader = createSessionReader({ projectSlug: '-p', root: w.root });
  const sync = () => reader.sync({ events: [w.stateEv()], state: STATE });
  assert.equal(sync().tokens.spent, 2);
  assert.equal(reader.changed(), false);
  fs.appendFileSync(w.main, second.slice(0, 30));
  assert.equal(reader.changed(), true);
  assert.equal(sync().tokens.spent, 2);
  assert.equal(reader.changed(), false);
  fs.appendFileSync(w.main, `${second.slice(30)}\n`);
  assert.equal(reader.changed(), true);
  assert.equal(sync().tokens.spent, 12);
  assert.equal(reader.changed(), false);
});

test('reader: no workflow in flight reads nothing and polls nothing', () => {
  const w = world();
  fs.writeFileSync(w.main, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1))]));
  const project = projectDirOf(null);
  fs.writeFileSync(path.join(project, '.constellation', 'metrics', 'events.jsonl'), jsonl([w.stateEv()]));
  const reader = createSessionReader({ projectSlug: '-p', root: w.root });
  const snap = loadSnapshot(project, null, reader);
  assert.equal(reader.bytesRead, 0);
  assert.deepEqual(snap.tokens, { source: 'none', spent: null });
  reader.sync({ events: [w.stateEv()], state: STATE });
  assert.ok(reader.bytesRead > 0);
  assert.equal(reader.changed(), false);
  reader.reset();
  const original = fs.statSync;
  let statCalls = 0;
  fs.statSync = (...args) => { statCalls += 1; return original(...args); };
  try {
    assert.equal(reader.changed(), false);
  } finally { fs.statSync = original; }
  assert.equal(statCalls, 0);
});

test('reader: quiet prints nothing; the logger gets one line per reason and no path', () => {
  const w = world();
  const events = [w.stateEv(path.join(w.tmp, `${OTHER_SID}.jsonl`), OTHER_SID), w.stateEv(path.join(w.slug, 'x.jsonl'), '33333333-4444-4555-8666-777777777777')];
  const silent = createSessionReader({ projectSlug: '-p', root: w.root, log: null });
  const noise = spies(() => { silent.sync({ events, state: STATE }); silent.sync({ events, state: STATE }); });
  assert.deepEqual(noise, []);
  const lines = [];
  const loud = createSessionReader({ projectSlug: '-p', root: w.root, log: (text) => lines.push(text) });
  loud.sync({ events, state: STATE });
  loud.sync({ events, state: STATE });
  assert.deepEqual(lines.sort(), ['transcript: refused: name', 'transcript: refused: outside root']);
  assert.equal(lines.some((l) => l.includes(w.tmp)), false);
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'board-session.mjs'), 'utf8');
  assert.equal(/readdir/i.test(source), false);
});

test('loadSnapshot: a reader adds tokens, attribution, and per-agent facts, and the window keeps every agent since startedAt', () => {
  const w = world();
  const project = projectDirOf();
  fs.writeFileSync(w.main, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1))]));
  const ids = Array.from({ length: 110 }, (_, i) => `a${i.toString(16).padStart(16, '0')}`);
  fs.writeFileSync(w.agentFile(ids[0]), jsonl([asst('x', '2026-10-21T10:00:00Z', usage(0, 0, 0, 5))]));
  const events = [w.stateEv(), ...ids.flatMap((id) => [w.startEv(id, '09:05'), w.stopEv(id, '09:06')])];
  fs.writeFileSync(path.join(project, '.constellation', 'metrics', 'events.jsonl'), jsonl(events));
  const snap = loadSnapshot(project, null, createSessionReader({ projectSlug: '-p', root: w.root }));
  assert.equal(snap.agents.length, 110);
  const first = snap.agents.find((a) => a.agent_id === ids[0]);
  assert.equal(first.transcript, true);
  assert.equal(snap.agents.find((a) => a.agent_id === ids[1]).transcript, false);
  assert.equal(snap.tokens.spent, 2 + 5);
  assert.equal(JSON.stringify(snap).includes(w.root), false);
  assert.equal(Object.hasOwn(first, 'path'), false);
});

test('projectSlugOf: every character that is not a letter or a digit becomes a hyphen', () => {
  assert.equal(projectSlugOf('/Users/joaooliveira/study/constellation-harness'), '-Users-joaooliveira-study-constellation-harness');
  assert.equal(projectSlugOf('/a/b.c_d e/f@g'), '-a-b-c-d-e-f-g');
});

test('checkTranscriptPath and reader: a session folder of another project is refused', () => {
  const mainCtx = { sessionId: SID, ...ROOTS };
  assert.equal(checkTranscriptPath('main', `${ROOT}/-other/${SID}.jsonl`, mainCtx), 'other project');
  assert.equal(checkTranscriptPath('main', `${ROOT}/-proj/deeper/${SID}.jsonl`, mainCtx), 'other project');
  assert.equal(checkTranscriptPath('main', `${ROOT}/-proj/${SID}.jsonl`, mainCtx), null);
  const w = world();
  const other = path.join(w.root, '-other');
  fs.mkdirSync(other);
  const foreignMain = path.join(other, `${SID}.jsonl`);
  fs.writeFileSync(foreignMain, jsonl([asst('m1', '2026-10-21T10:00:00Z', usage(9, 9, 9, 9), [{ type: 'text', text: 'OTHER-PROJECT-SECRET' }])]));
  const reader = createSessionReader({ projectSlug: '-p', root: w.root });
  const result = reader.sync({ events: [w.stateEv(foreignMain)], state: STATE });
  assert.deepEqual(result.errors, ['transcript: refused: other project']);
  assert.equal(reader.bytesRead, 0);
  assert.equal(result.tokens, null);
  assert.equal(JSON.stringify(result).includes('OTHER-PROJECT'), false);
  assert.equal(result.errors.some((e) => e.includes(w.tmp)), false);
});

test('reader: a window that starts on a line start keeps that line', () => {
  const w = world();
  const line = (i) => sized({ type: 'assistant', timestamp: '2026-10-21T10:00:00.000Z', message: { id: `m${i}`, usage: usage(0, 0, 0, i) } }, 256);
  fs.writeFileSync(w.main, [1, 2, 3, 4, 5].map(line).join(''));
  const reader = createSessionReader({ projectSlug: '-p', root: w.root, capBytes: 1024 });
  const result = reader.sync({ events: [w.stateEv()], state: STATE });
  assert.equal(reader.bytesRead, 1024);
  assert.equal(result.tokens.output, 2 + 3 + 4 + 5);
});

test('reader: a line longer than one read chunk joins and counts once', () => {
  const w = world();
  const long = asst('m1', '2026-10-21T10:00:00Z', usage(1, 0, 0, 1), [{ type: 'text', text: 'x'.repeat(2.5 * 1024 * 1024) }]);
  fs.writeFileSync(w.main, jsonl([long, asst('m2', '2026-10-21T10:00:01Z', usage(0, 0, 0, 10))]));
  const result = createSessionReader({ projectSlug: '-p', root: w.root }).sync({ events: [w.stateEv()], state: STATE });
  assert.equal(result.tokens.spent, 2 + 10);
});
