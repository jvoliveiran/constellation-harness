// Constellation Harness — board session reader: tokens spent and agent reports from the Claude Code
// transcripts of the workflow sessions.
//
// Read-only. It opens only the paths that the project event log names (or that derive from them),
// and only after the gate of checkTranscriptPath and gateReal. It lists no directory and writes
// nothing. A main transcript yields six numbers per assistant line and nothing else. An agent
// transcript yields the same six numbers plus the text of its last assistant message.
// Imports node:fs and node:path only. board.mjs re-exports every name.

import fs from 'node:fs';
import path from 'node:path';

export const SESSION_CAP_BYTES = 32 * 1024 * 1024;
export const REPORT_CAP_BYTES = 256 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const META_CAP_BYTES = 16 * 1024;
const MAX_PATH_LENGTH = 1024;
const DESCRIPTION_CAP = 200;
const MODEL_CAP = 64;
const WORKFLOW_STATE_FILE = '.constellation/state/current-workflow.json';
const ASSISTANT_MARKER = '"type":"assistant"';
const HANDBACK_TOOL = 'SubagentHandback';
const NEWLINE = 0x0a;

const AGENT_ID = /^[a-f0-9]{8,32}$/;
const MAIN_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;
const AGENT_NAME = /^agent-([a-f0-9]{8,32})\.jsonl$/;
const META_NAME = /^agent-([a-f0-9]{8,32})\.meta\.json$/;
const NAME_RULES = { main: MAIN_NAME, agent: AGENT_NAME, meta: META_NAME };
const EXTENSIONS = { agent: '.jsonl', meta: '.meta.json' };

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

/**
 * The six values of one assistant line, or null. This is the only thing the board keeps from a
 * main transcript line: no message text, no tool input.
 */
export function usageOf(obj) {
  const message = obj?.message;
  if (obj?.type !== 'assistant' || typeof message?.id !== 'string') return null;
  const usage = message.usage;
  if (usage === null || typeof usage !== 'object') return null;
  return {
    id: message.id,
    ts: typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN,
    input: count(usage.input_tokens),
    cacheCreate: count(usage.cache_creation_input_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    output: count(usage.output_tokens),
  };
}

/**
 * Sum usage entries in file order. One API turn writes several lines with one message.id and a
 * growing output_tokens, so the last line of an id wins. sinceMs null keeps every entry.
 */
export function sumUsage(entries, sinceMs = null) {
  const byId = new Map();
  for (const entry of entries) byId.set(entry.id, entry);
  const total = { spent: 0, input: 0, cache: 0, output: 0 };
  for (const e of byId.values()) {
    if (typeof sinceMs === 'number' && !(e.ts >= sinceMs)) continue;
    total.input += e.input;
    total.cache += e.cacheCreate + e.cacheRead;
    total.output += e.output;
  }
  total.spent = total.input + total.cache + total.output;
  return total;
}

function keepBlock(block) {
  if (block?.type === 'text' && typeof block.text === 'string') return [{ type: 'text', text: block.text }];
  const message = block?.input?.message;
  if (block?.type === 'tool_use' && block.name === HANDBACK_TOOL && typeof message === 'string') {
    return [{ type: 'tool_use', name: HANDBACK_TOOL, input: { message } }];
  }
  return [];
}

/**
 * Fold one transcript object into the group of the last assistant message.id. A new id starts a
 * new group. Only text blocks and SubagentHandback messages survive: no other tool input is kept.
 */
export function appendToGroup(group, obj) {
  const id = obj?.message?.id;
  if (obj?.type !== 'assistant' || typeof id !== 'string') return group;
  const content = obj.message.content;
  const kept = Array.isArray(content) ? content.flatMap(keepBlock) : [];
  return group?.id === id ? { id, blocks: [...group.blocks, ...kept] } : { id, blocks: kept };
}

function capUtf8(text, capBytes) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= capBytes) return { report: text, truncated: false };
  const prefix = bytes.subarray(0, capBytes).toString('utf8');
  return { report: prefix.endsWith('�') ? prefix.slice(0, -1) : prefix, truncated: true };
}

/**
 * The final report of an agent: the last SubagentHandback message, else the text blocks of the
 * last assistant message joined by a blank line. A report keeps at most capBytes of UTF-8.
 */
export function extractReport(group, capBytes = REPORT_CAP_BYTES) {
  const blocks = group?.blocks ?? [];
  const handbacks = blocks.filter((b) => b.type === 'tool_use' && b.input.message !== '');
  const text = handbacks.length > 0
    ? handbacks[handbacks.length - 1].input.message
    : blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
  if (text.trim() === '') return { report: null, truncated: false, error: 'no report' };
  return { ...capUtf8(text, capBytes), error: null };
}

const insideRoot = (p, root) => typeof root === 'string' && p.startsWith(root + path.sep);

/** The only agent (or meta) path that a session allows: next to the session folder of the main file. */
export function derivedPath(kind, mainPath, sessionId, agentId) {
  return path.join(path.dirname(mainPath), sessionId, 'subagents', `agent-${agentId}${EXTENSIONS[kind]}`);
}

function checkAgentPath(kind, p, ctx) {
  if (typeof ctx.mainPath !== 'string') return 'foreign session';
  const expected = derivedPath(kind, ctx.mainPath, ctx.sessionId, ctx.agentId);
  if (p === expected) return null;
  if (path.dirname(p) !== path.dirname(expected)) return 'foreign session';
  return 'agent id mismatch';
}

/**
 * The lexical rules of the transcript gate, in order. kind is main, agent, or meta. ctx holds
 * sessionId, agentId, mainPath, lexicalRoot, and realRoot. Returns null when the path passes, or
 * a reason from a fixed list. No input text reaches a reason.
 */
export function checkTranscriptPath(kind, p, ctx) {
  const plain = typeof p === 'string' && path.isAbsolute(p) && p.length <= MAX_PATH_LENGTH
    && !p.includes('\0') && path.normalize(p) === p;
  if (!plain) return 'bad path';
  const match = NAME_RULES[kind].exec(path.basename(p));
  if (!match) return 'name';
  const mismatch = kind === 'main' ? (match[1] === ctx.sessionId ? null : 'foreign session') : checkAgentPath(kind, p, ctx);
  if (mismatch) return mismatch;
  if (typeof ctx.realRoot !== 'string') return 'no session root';
  return insideRoot(p, ctx.lexicalRoot) || insideRoot(p, ctx.realRoot) ? null : 'outside root';
}

/**
 * The sessions that the event window names: session_id -> { path, reason }. A session keeps the
 * first transcript_path that passes the lexical rules. Without one it keeps the first reason.
 */
export function sessionsOf(events, roots) {
  const sessions = new Map();
  for (const e of events) {
    if (typeof e?.session_id !== 'string' || typeof e.transcript_path !== 'string') continue;
    if (sessions.get(e.session_id)?.path) continue;
    const ctx = { sessionId: e.session_id, ...roots };
    const reason = checkTranscriptPath('main', e.transcript_path, ctx);
    const known = sessions.get(e.session_id);
    sessions.set(e.session_id, reason ? { path: null, reason: known?.reason ?? reason } : { path: e.transcript_path, reason: null });
  }
  return sessions;
}

const isSubagentEvent = (e) => e.event === 'SubagentStart' || e.event === 'SubagentStop';

/**
 * The sessions of the workflow: a session with, since startedAt, an agent line that has an
 * agent_type, or a write of the workflow state file. A Stop line alone does not qualify.
 */
export function workflowSessions(events, startedMs) {
  const ids = new Set();
  for (const e of events) {
    if (typeof e?.session_id !== 'string' || !(Date.parse(e.ts) >= startedMs)) continue;
    const agentLine = isSubagentEvent(e) && typeof e.agent_type === 'string' && e.agent_type !== '';
    if (agentLine || (e.event === 'PostToolUse' && e.file === WORKFLOW_STATE_FILE)) ids.add(e.session_id);
  }
  return ids;
}

const stringUpTo = (value, cap) => (typeof value === 'string' && value.length <= cap ? value : null);

/** The agents of the workflow: agent_id -> the facts that the event lines hold. No transcript text. */
export function workflowAgents(events, sessionIds, startedMs) {
  const agents = new Map();
  for (const e of events) {
    if (!isSubagentEvent(e) || !sessionIds.has(e.session_id) || !AGENT_ID.test(e.agent_id ?? '')) continue;
    const a = agents.get(e.agent_id) ?? { sessionId: e.session_id, start: null, end: null, stopPath: null, description: null };
    if (e.event === 'SubagentStart') {
      a.start ??= e.ts ?? null;
      a.description ??= stringUpTo(e.description, DESCRIPTION_CAP);
    } else {
      a.end ??= e.ts ?? null;
      a.stopPath ??= stringUpTo(e.agent_transcript_path, MAX_PATH_LENGTH);
    }
    agents.set(e.agent_id, a);
  }
  return new Map([...agents].filter(([, a]) => Date.parse(a.start ?? a.end) >= startedMs));
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

const safeCode = (e) => (/^[A-Z0-9_]{1,24}$/.test(e?.code ?? '') ? e.code : 'error');
const failure = (e) => (e.code === 'ENOENT' ? { missing: true } : { code: safeCode(e) });
const NO_SYNC = () => ({ tokens: null, agents: new Map(), errors: [] });
const O_FLAGS = () => fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);
const newFile = () => ({ ino: null, size: 0, offset: 0, rest: Buffer.alloc(0), cutPending: false, usage: new Map(), group: null, model: null });

let chunkBuffer = null;
const getChunk = () => (chunkBuffer ??= Buffer.alloc(CHUNK_BYTES));

function mergeAgent(old, next) {
  const merged = { ...old };
  for (const [key, value] of Object.entries(next)) if (value != null) merged[key] = value;
  return merged;
}

function readMetaFile(fd, st) {
  const buffer = Buffer.alloc(Math.min(st.size, META_CAP_BYTES));
  let n = 0;
  for (let r = 1; r > 0 && n < buffer.length; n += r) r = fs.readSync(fd, buffer, n, buffer.length - n, n);
  const meta = JSON.parse(buffer.toString('utf8', 0, n));
  const description = typeof meta?.description === 'string' ? meta.description.trim().slice(0, DESCRIPTION_CAP) : '';
  return { description: description || null, model: stringUpTo(meta?.model, MODEL_CAP) };
}

/**
 * The reader of the workflow transcripts. root is ~/.claude/projects (a temp directory in tests).
 * log is called with one text per distinct refusal or read failure, or never when it is null.
 */
export function createSessionReader({ root, capBytes = SESSION_CAP_BYTES, log = null }) {
  const files = new Map();
  const metas = new Map();
  const logged = new Set();
  const statuses = new Map();
  let sticky = null;
  let bytesRead = 0;

  const reset = () => { files.clear(); metas.clear(); logged.clear(); statuses.clear(); sticky = null; };

  function resolveRoots() {
    try {
      return { lexicalRoot: root, realRoot: fs.realpathSync(root) };
    } catch {
      return { lexicalRoot: root, realRoot: null };
    }
  }

  function relativeTo(roots, p) {
    return path.relative(insideRoot(p, roots.lexicalRoot) ? roots.lexicalRoot : roots.realRoot, p);
  }

  /** Open one path through the filesystem rules and call use(fd, st). Returns { value } or a failure. */
  function withGatedFd(p, roots, use) {
    let fd;
    try {
      if (fs.realpathSync(p) !== path.join(roots.realRoot, relativeTo(roots, p))) return { reason: 'symlink' };
      fd = fs.openSync(p, O_FLAGS());
    } catch (e) {
      return e.code === 'ELOOP' ? { reason: 'symlink' } : failure(e);
    }
    try {
      const st = fs.fstatSync(fd);
      return st.isFile() ? { value: use(fd, st) } : { reason: 'not a regular file' };
    } catch (e) {
      return failure(e);
    } finally {
      fs.closeSync(fd);
    }
  }

  function consume(file, bytes, kind) {
    let data = Buffer.concat([file.rest, bytes]);
    if (file.cutPending) {
      const cut = data.indexOf(NEWLINE);
      if (cut < 0) { file.rest = Buffer.alloc(0); return; }
      data = data.subarray(cut + 1);
      file.cutPending = false;
    }
    const end = data.lastIndexOf(NEWLINE);
    file.rest = Buffer.from(data.subarray(end + 1));
    if (file.rest.length > capBytes) { file.rest = Buffer.alloc(0); file.cutPending = true; }
    for (let from = 0; end >= 0 && from < end; ) {
      const next = data.indexOf(NEWLINE, from);
      handleLine(file, data.subarray(from, next), kind);
      from = next + 1;
    }
  }

  function handleLine(file, line, kind) {
    if (!line.includes(ASSISTANT_MARKER)) return;
    let obj;
    try { obj = JSON.parse(line.toString('utf8')); } catch { return; }
    const usage = usageOf(obj);
    if (!usage) return;
    file.usage.set(usage.id, usage);
    if (kind !== 'agent') return;
    file.group = appendToGroup(file.group, obj);
    file.model = stringUpTo(obj.message.model, MODEL_CAP) ?? file.model;
  }

  function readAppended(p, fd, st, kind) {
    let file = files.get(p);
    if (file && (file.ino !== st.ino || st.size < file.offset)) file = null;
    if (!file) {
      file = { ...newFile(), ino: st.ino };
      file.offset = Math.max(0, st.size - capBytes);
      file.cutPending = file.offset > 0;
    }
    files.set(p, file);
    const chunk = getChunk();
    for (let n = 1; n > 0 && file.offset < st.size; file.offset += n) {
      n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, st.size - file.offset), file.offset);
      bytesRead += n;
      if (n > 0) consume(file, chunk.subarray(0, n), kind);
    }
    file.size = st.size;
    return file;
  }

  const readFile = (p, roots, kind) => withGatedFd(p, roots, (fd, st) => readAppended(p, fd, st, kind));

  function resolveSessions(events, startedMs, roots) {
    const named = sessionsOf(events, roots);
    for (const id of workflowSessions(events, startedMs)) {
      const entry = named.get(id);
      if (!entry) continue;
      const known = sticky.sessions.get(id);
      if (entry.path || !known?.path) sticky.sessions.set(id, entry);
    }
    return sticky.sessions;
  }

  function resolveAgents(events, startedMs) {
    for (const [id, a] of workflowAgents(events, new Set(sticky.sessions.keys()), startedMs)) {
      sticky.agents.set(id, mergeAgent(sticky.agents.get(id) ?? {}, a));
    }
  }

  /** The gate verdict for one agent: { path } to read, { reason } to refuse, or { missing } with no main path. */
  function gateAgent(id, a, roots) {
    const main = sticky.sessions.get(a.sessionId);
    if (!main?.path && !main?.reason) return { missing: true };
    if (!main.path) return { reason: main.reason };
    const ctx = { sessionId: a.sessionId, agentId: id, mainPath: main.path, ...roots };
    const expected = derivedPath('agent', main.path, a.sessionId, id);
    const reason = checkTranscriptPath('agent', a.stopPath ?? expected, ctx);
    return reason ? { reason } : { path: expected, metaPath: derivedPath('meta', main.path, a.sessionId, id), ctx };
  }

  function readMeta(id, gate, roots) {
    if (metas.has(id)) return metas.get(id);
    if (checkTranscriptPath('meta', gate.metaPath, gate.ctx)) return null;
    const read = withGatedFd(gate.metaPath, roots, (fd, st) => {
      try { return readMetaFile(fd, st); } catch { return null; }
    });
    if (read.value) metas.set(id, read.value);
    return read.value ?? null;
  }

  function note(notices, text) {
    notices.add(text);
    if (log && !logged.has(text)) { logged.add(text); log(text); }
  }

  function noteFailure(result, notices) {
    if (result.reason) note(notices, `transcript: refused: ${result.reason}`);
    else if (result.code) note(notices, `transcript: unreadable: ${result.code}`);
  }

  function readAgents(roots, notices) {
    const agents = new Map();
    statuses.clear();
    for (const [id, a] of sticky.agents) {
      const gate = gateAgent(id, a, roots);
      if (!gate.path) {
        statuses.set(id, gate);
        agents.set(id, { transcript: false, description: a.description, model: null });
        noteFailure(gate, notices);
        continue;
      }
      const meta = readMeta(id, gate, roots);
      const read = readFile(gate.path, roots, 'agent');
      statuses.set(id, { ...read, path: gate.path });
      noteFailure(read, notices);
      agents.set(id, { transcript: !!read.value, description: a.description ?? meta?.description ?? null, model: meta?.model ?? read.value?.model ?? null });
    }
    return agents;
  }

  function readMains(roots, notices, startedMs) {
    let sum = null;
    for (const [, main] of sticky.sessions) {
      if (!main.path) { noteFailure(main, notices); continue; }
      const read = readFile(main.path, roots, 'main');
      noteFailure(read, notices);
      if (!read.value) continue;
      const part = sumUsage(read.value.usage.values(), startedMs);
      sum = sum === null ? part : addSums(sum, part);
    }
    return sum;
  }

  function sync({ events, state }) {
    const startedMs = Date.parse(state?.startedAt);
    if (!state || Number.isNaN(startedMs)) { reset(); return NO_SYNC(); }
    if (sticky?.startedAt !== state.startedAt) { reset(); sticky = { startedAt: state.startedAt, sessions: new Map(), agents: new Map() }; }
    const roots = resolveRoots();
    resolveSessions(events, startedMs, roots);
    resolveAgents(events, startedMs);
    const notices = new Set();
    const agents = readAgents(roots, notices);
    const mains = readMains(roots, notices, startedMs);
    let tokens = mains;
    for (const status of tokens ? statuses.values() : []) {
      if (status.value) tokens = addSums(tokens, sumUsage(status.value.usage.values(), startedMs));
    }
    return { tokens, agents, errors: [...notices] };
  }

  function changed() {
    for (const [p, file] of files) {
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.size !== file.size || st.ino !== file.ino) return true;
    }
    return false;
  }

  function agentReply(agent) {
    const base = { id: agent.agent_id, agent_type: agent.agent_type ?? null, description: agent.description ?? null, model: null, start: agent.start ?? null, end: agent.end ?? null, durationSec: agent.durationSec ?? null, usage: null, report: null, truncated: false, error: null };
    const status = statuses.get(agent.agent_id);
    if (!sticky || !status || status.missing) return { ...base, error: 'missing' };
    if (status.reason) return { ...base, error: `refused: ${status.reason}` };
    const read = readFile(status.path, resolveRoots(), 'agent');
    if (read.reason) return { ...base, error: `refused: ${read.reason}` };
    if (read.code) return { ...base, error: `unreadable: ${read.code}` };
    if (read.missing) return { ...base, error: 'missing' };
    const meta = metas.get(agent.agent_id);
    const info = sticky.agents.get(agent.agent_id);
    return {
      ...base,
      description: base.description ?? info?.description ?? meta?.description ?? null,
      model: meta?.model ?? read.value.model,
      usage: sumUsage(read.value.usage.values(), null),
      ...extractReport(read.value.group),
    };
  }

  return { sync, changed, agentReply, reset, get bytesRead() { return bytesRead; } };
}

function addSums(a, b) {
  return { spent: a.spent + b.spent, input: a.input + b.input, cache: a.cache + b.cache, output: a.output + b.output };
}
