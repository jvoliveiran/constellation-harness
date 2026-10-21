// Tests for board-session.mjs. Run: node --test plugins/constellation/scripts/
// Every transcript here is synthetic. No test reads the real ~/.claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  usageOf, sumUsage, extractReport, appendToGroup, checkTranscriptPath, derivedPath, sessionsOf,
  workflowSessions, workflowAgents,
} from './board-session.mjs';

const SID = '11111111-2222-4333-8444-555555555555';
const OTHER_SID = '22222222-3333-4444-8555-666666666666';
const AID = 'a0e575badeb8675d0';
const OTHER_AID = 'b1f686cbefc9786e1';
const ROOT = '/fake/home/.claude/projects';
const ROOTS = { lexicalRoot: ROOT, realRoot: ROOT };
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
  assert.equal(checkTranscriptPath('main', MAIN, { sessionId: SID, lexicalRoot: ROOT, realRoot: null }), 'no session root');
  assert.equal(checkTranscriptPath('main', `/real/projects/-p/${SID}.jsonl`, { sessionId: SID, lexicalRoot: ROOT, realRoot: '/real/projects' }), null);
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
