// Constellation Harness — board render: the pure render functions of the page.
//
// Every export is a function whose body uses no module-scope symbol and no import. An export may
// call another export, because the page defines every export at top level. Nothing else is in
// scope. board.mjs ships each export to the page through toString(), so the page runs the same
// code that board.test.mjs tests. A constant that a function needs sits inside its body.

/**
 * The chip class for a value: prefix + value when allowed holds it, else prefix + 'other'. The
 * page receives this function through toString(), so the body uses no module-scope symbol and no
 * import. indexOf on an array keeps Object prototype keys such as `constructor` out of the class.
 */
export function chipClass(prefix, allowed, value) {
  return allowed.indexOf(value) >= 0 ? prefix + value : prefix + 'other';
}

/**
 * Render rows as a table: a `div.tbl-wrap` that holds a `table.tbl`. kind picks the columns: task
 * (ID, Title, Type, Status, Feature, Epic, Plan, Updated), feature (ID, Title, Status, Epic, Tasks,
 * Updated), or epic (ID, Title, Status, Features, Tasks, Updated). Every `tr` carries data-href
 * with the detail route; the Title cell is a link, so the keyboard reaches the row. A flagged row
 * shows a dot and the warnings in its title; the in-flight row has the class `inflight`. Every
 * text goes through esc. The page receives this function through toString(), so the body uses no
 * module-scope symbol and no import; chipClass is its top-level neighbor on the page.
 */
export function renderTable(rows, kind, esc) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  var COLUMNS = {
    task: [['id', 'ID'], ['title', 'Title'], ['type', 'Type'], ['status', 'Status'], ['feature', 'Feature'], ['epic', 'Epic'], ['plan', 'Plan'], ['updated', 'Updated']],
    feature: [['id', 'ID'], ['title', 'Title'], ['status', 'Status'], ['epic', 'Epic'], ['tasks', 'Tasks'], ['updated', 'Updated']],
    epic: [['id', 'ID'], ['title', 'Title'], ['status', 'Status'], ['features', 'Features'], ['tasks', 'Tasks'], ['updated', 'Updated']],
  };
  var columns = kind === 'feature' ? COLUMNS.feature : kind === 'epic' ? COLUMNS.epic : COLUMNS.task;
  var DASH = '—';
  function parentLink(parent, parentKind) {
    return parent ? '<a href="#/item/' + parentKind + '/' + esc(parent.file) + '">' + esc((parent.id ? parent.id + ' ' : '') + parent.title) + '</a>' : DASH;
  }
  function groupChips(counts) {
    var chips = TASK_GROUPS.filter(function (g) { return counts && counts[g] > 0; }).map(function (g) {
      return '<span class="chip ' + chipClass('s-', TASK_GROUPS, g) + '">' + esc(g + ' ' + counts[g]) + '</span>';
    });
    return chips.length ? chips.join(' ') : DASH;
  }
  function cell(key, row) {
    if (key === 'id') return (row.flags.length ? '<span class="dot" aria-label="needs attention"></span>' : '') + esc(row.id || DASH);
    if (key === 'title') return '<a href="#/item/' + esc(row.kind) + '/' + esc(row.file) + '">' + esc(row.title) + '</a>';
    if (key === 'type') return esc(row.type || DASH);
    if (key === 'status') {
      return '<span class="chip ' + chipClass('s-', TASK_GROUPS, row.group) + '">' + esc(row.status || DASH) + '</span>'
        + (row.inFlight ? ' <span class="run">▶ ' + esc(row.currentStep || '') + '</span>' : '');
    }
    if (key === 'feature') return parentLink(row.feature, 'feature');
    if (key === 'epic') return parentLink(row.epic, 'epic');
    if (key === 'plan') return row.plan ? '<span class="chip ' + chipClass('p-', ['draft', 'approved'], row.plan.status) + '">' + esc(row.plan.status || DASH) + '</span>' : DASH;
    if (key === 'features') return esc(row.featureCount);
    if (key === 'tasks') return kind === 'epic' ? esc(row.taskCount) : groupChips(row.taskCounts);
    return esc(row.edited || DASH);
  }
  function tableRow(row) {
    var open = '<tr' + (row.inFlight ? ' class="inflight"' : '') + ' data-href="#/item/' + esc(row.kind) + '/' + esc(row.file) + '"'
      + (row.flags.length ? ' title="' + esc(row.warnings.join('; ')) + '"' : '') + '>';
    return open + columns.map(function (c) { return '<td class="col-' + c[0] + '">' + cell(c[0], row) + '</td>'; }).join('') + '</tr>';
  }
  var head = '<tr>' + columns.map(function (c) { return '<th class="col-' + c[0] + '">' + c[1] + '</th>'; }).join('') + '</tr>';
  return '<div class="tbl-wrap"><table class="tbl"><thead>' + head + '</thead><tbody>' + rows.map(tableRow).join('') + '</tbody></table></div>';
}

/**
 * Render the toolbar chips as an HTML string: the Kind control, the row count (`<shown> of <total>`
 * for the current kind), for tasks the seven Status chips with their tree.counts and the six Type
 * chips, the Attention toggle, and Reset. view = { route, tree }. The count needs a tree. The page
 * receives this function through toString(); backlogRows, filterRows, and chipClass are its
 * top-level neighbors on the page.
 */
export function renderToolbar(view, esc) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  var TYPES = ['feature', 'fix', 'refactor', 'debt', 'spike', 'discovery'];
  var KINDS = [['task', 'Tasks'], ['feature', 'Features'], ['epic', 'Epics']];
  var route = view.route, tree = view.tree;
  var counts = tree ? tree.counts : {};
  function pressed(on) { return ' aria-pressed="' + (on ? 'true' : 'false') + '"'; }
  function toggle(action, value, classes, text, on) {
    return '<button type="button" class="' + classes + '" data-action="' + action + '" data-value="' + esc(value) + '"' + pressed(on) + '>' + esc(text) + '</button>';
  }
  var html = KINDS.map(function (k) { return toggle('kind', k[0], 'seg', k[1], route.kind === k[0]); }).join('');
  if (tree) {
    var rows = backlogRows(tree, route.kind);
    html += '<span class="muted count" aria-live="polite">' + filterRows(rows, route, tree.attention).length + ' of ' + rows.length + '</span>';
  }
  if (route.kind === 'task') {
    html += TASK_GROUPS.map(function (g) {
      return toggle('status', g, 'chip ' + chipClass('s-', TASK_GROUPS, g) + ' toggle', g + ' ' + (counts[g] || 0), route.status.indexOf(g) >= 0);
    }).join('');
    html += TYPES.map(function (t) { return toggle('type', t, 'chip toggle', t, route.type === null || route.type.indexOf(t) >= 0); }).join('');
  }
  html += toggle('attention', 'attention', 'chip warn toggle', 'Attention', route.attention);
  return html + '<button type="button" class="link" data-action="reset">Reset</button>';
}

/**
 * Render the attention banner: `1 item needs attention` or `2 items need attention` with a Show
 * button, from tree.attention. An empty list, or no tree, gives ''. The page receives this function
 * through toString(), so the body uses no module-scope symbol and no import.
 */
export function renderAttention(tree, esc) {
  var count = tree && tree.attention ? tree.attention.length : 0;
  if (!count) return '';
  return '<div class="attn">' + count + (count === 1 ? ' item needs attention' : ' items need attention')
    + ' <button type="button" class="btn secondary" data-action="show-attention">Show</button></div>';
}

/**
 * Render the backlog list as an HTML string: the table of the current kind after the filters and
 * the sort, or the empty state, then one line for the plans that have no task. view = { tree,
 * route }; route is the parseBacklogRoute result. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import; backlogRows, filterRows,
 * sortRows, and renderTable are its top-level neighbors on the page.
 */
export function renderBacklog(view, esc) {
  var tree = view.tree;
  var hasNodes = !!tree && (tree.tasks.length + tree.epics.length + tree.orphanFeatures.length + tree.orphanPlans.length) > 0;
  if (!hasNodes) return '<div class="empty">No work items</div>';
  var rows = sortRows(filterRows(backlogRows(tree, view.route.kind), view.route, tree.attention));
  var html = rows.length
    ? renderTable(rows, view.route.kind, esc)
    : '<div class="empty">No items match <button type="button" class="link" data-action="reset">Reset</button></div>';
  var plans = tree.orphanPlans;
  if (plans.length) {
    html += '<p class="muted orphans">' + plans.length + (plans.length === 1 ? ' plan' : ' plans') + ' without task: '
      + plans.map(function (p) { return '<code>' + esc(p.file) + '</code>'; }).join(', ') + '</p>';
  }
  return html;
}

/**
 * Render one Activity feed entry as an HTML string. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import.
 */
export function feedText(e, esc) {
  if (e.kind === 'transition') return '<code>' + esc(e.file) + '</code> ' + esc(e.from == null ? 'new' : e.from) + ' → ' + esc(e.to);
  if (e.kind === 'summary') return esc(e.count + ' task statuses changed at once (branch switch or pull?)');
  return e.event === 'PostToolUse' ? esc(e.tool_name || 'edit') + ' <code>' + esc(e.file || '') + '</code>' : esc(e.event || '');
}

/**
 * Render the agent rows of the Agents card as an HTML string: the running group, the newest
 * finished rows, and a Show all button past the cap. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import: the time formatters come
 * in through view. view = { agents, showAll, hhmm, fmtDur }. agents is newest first, as the
 * snapshot sorts it. A finished row with a valid agent_id is a button that opens its report; a
 * running row is not. A description shows in muted text. No agents gives ''.
 */
export function renderAgents(view, esc) {
  var AGENT_ROWS = 20;
  var agents = view.agents || [];
  var running = agents.filter(function (a) { return a.running; });
  var finished = agents.filter(function (a) { return !a.running; });
  var shown = view.showAll ? finished : finished.slice(0, AGENT_ROWS);
  function name(a) { return esc(String(a.agent_type || 'agent').replace(/^constellation:/, '')); }
  function row(a) {
    var dur = a.running
      ? '<span class="dur run" data-since="' + esc(a.start) + '" data-prefix="running ">running</span>'
      : '<span class="dur">' + esc(view.fmtDur(a.durationSec)) + '</span>';
    var cells = '<span class="t">' + esc(view.hhmm(a.start)) + '</span><span' + (a.running ? ' class="run"' : '') + '>' + name(a) + '</span>' + dur
      + (typeof a.description === 'string' && a.description ? '<span class="muted desc">' + esc(a.description) + '</span>' : '');
    var opens = !a.running && typeof a.agent_id === 'string' && /^[a-f0-9]{8,32}$/.test(a.agent_id);
    return opens
      ? '<li><button type="button" class="arow" data-action="open-agent" data-value="' + esc(a.agent_id) + '">' + cells + '</button></li>'
      : '<li>' + cells + '</li>';
  }
  var html = '';
  if (running.length) html += '<div class="running"><div class="gh">Running</div><ul>' + running.map(row).join('') + '</ul></div>';
  if (shown.length) html += '<ul>' + shown.map(row).join('') + '</ul>';
  if (finished.length > shown.length) html += '<button type="button" class="btn secondary" data-action="show-all">Show all (' + finished.length + ')</button>';
  return html;
}

/**
 * Render a work-item body as HTML: strip the front matter, drop the first H1 (the header shows
 * it), then render with markdown-it under the spec §7 options and renderer rules. markdownit is
 * the library factory (window.markdownit); null renders the text in a <pre>. tree is the snapshot
 * tree: a link to a work item that it holds opens inside the board (internalHref). The page
 * receives this function through toString(), so the body uses no module-scope symbol and no
 * import; internalHref is its top-level neighbor on the page. keepHead true keeps the front
 * matter and the first H1: an agent report is not a work item.
 */
export function renderMarkdown(text, markdownit, esc, tree, keepHead) {
  var whole = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  var body = keepHead ? whole : whole.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').replace(/^# .*(\r?\n|$)/m, '');
  if (!markdownit) return '<pre class="md-raw">' + esc(body) + '</pre>';
  var md = markdownit({ html: false, linkify: false, typographer: false, breaks: false });
  var isRemote = function (href) { return /^https?:\/\//i.test(href || ''); };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    var token = tokens[idx];
    var href = token.attrGet('href');
    var internal = internalHref(href, tree);
    if (internal) token.attrSet('href', internal);
    else if (isRemote(href)) { token.attrSet('rel', 'noopener noreferrer'); token.attrSet('target', '_blank'); }
    else if (token.attrIndex('href') >= 0) token.attrs.splice(token.attrIndex('href'), 1);
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    var token = tokens[idx];
    var src = token.attrGet('src') || '';
    var label = self.renderInlineAsText(token.children, options, env) || src;
    return isRemote(src)
      ? '<a href="' + esc(src) + '" rel="noopener noreferrer" target="_blank">' + esc(label) + '</a>'
      : '<a>' + esc(label) + '</a>';
  };
  return md.render(body);
}

/**
 * The body of one /api/item response: the rendered markdown, then the muted truncation line when
 * the read hit the cap. The page defines renderMarkdown at top level, next to this function.
 */
export function renderItemBody(item, markdownit, esc, tree) {
  return renderMarkdown(item.text, markdownit, esc, tree) + (item.truncated ? '<p class="muted">truncated at 512 KB</p>' : '');
}

/**
 * True when file matches the name rule of spec §4.4 and the snapshot tree holds it as the given
 * kind: task, plan, epic, or feature. A null tree holds nothing.
 */
export function treeHolds(tree, kind, file) {
  if (!tree || typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(file)) return false;
  var match = function (n) { return n.file === file; };
  if (kind === 'task') return tree.tasks.some(match);
  if (kind === 'epic') return tree.epics.some(match);
  if (kind === 'feature') return tree.orphanFeatures.some(match) || tree.epics.some(function (e) { return e.features.some(match); });
  if (kind === 'plan') return tree.tasks.some(function (t) { return !!t.plan && t.plan.file === file; }) || tree.orphanPlans.some(function (p) { return p.file === file; });
  return false;
}

/**
 * The hash that opens a body link inside the board, or null. A name that the tree holds as a task,
 * feature, or epic gives `#/item/<kind>/<name>`; a plan gives `#/plan/<name>`. A directory part
 * (tasks, features, epics, plans) fixes the kind; a bare name tries task, feature, epic, then plan.
 * A scheme, a missing tree, a name outside the name rule, or a dot segment after the leading ones
 * gives null. The fragment and the query drop out. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import; treeHolds is its top-level
 * neighbor on the page.
 */
export function internalHref(href, tree) {
  var DIRECTORIES = { tasks: 'task', features: 'feature', epics: 'epic', plans: 'plan' };
  if (!tree || !href || String(href).indexOf(':') >= 0) return null;
  var parts = String(href).split('#')[0].split('?')[0].split('/');
  while (parts.length > 1 && (parts[0] === '.' || parts[0] === '..')) parts.shift();
  var name = parts[parts.length - 1];
  var directory = parts.length > 1 ? parts[parts.length - 2] : '';
  if (parts.slice(0, -1).some(function (part) { return part === '.' || part === '..'; })) return null;
  var mapped = Object.prototype.hasOwnProperty.call(DIRECTORIES, directory) ? DIRECTORIES[directory] : null;
  var kinds = mapped ? [mapped] : ['task', 'feature', 'epic', 'plan'];
  var kind = kinds.filter(function (k) { return treeHolds(tree, k, name); })[0];
  if (!kind) return null;
  return kind === 'plan' ? '#/plan/' + name : '#/item/' + kind + '/' + name;
}

/**
 * Find a work item in the tree: { node, feature, epic } or null. For a task, feature and epic are
 * its parents through the tree structure; for a feature, epic; for an epic both are null. The
 * kinds are task, feature, and epic; treeHolds decides, so a name outside the rule gives null. The
 * page receives this function through toString(); treeHolds is its top-level neighbor.
 */
export function findItem(tree, kind, file) {
  if (kind !== 'task' && kind !== 'feature' && kind !== 'epic') return null;
  if (!treeHolds(tree, kind, file)) return null;
  var match = function (n) { return n.file === file; };
  if (kind === 'task') {
    var found = { node: tree.tasks.filter(match)[0], feature: null, epic: null };
    tree.epics.forEach(function (e) {
      e.features.forEach(function (f) { if (f.tasks.indexOf(file) >= 0) { found.feature = f; found.epic = e; } });
    });
    tree.orphanFeatures.forEach(function (f) { if (f.tasks.indexOf(file) >= 0) found.feature = f; });
    return found;
  }
  if (kind === 'epic') return { node: tree.epics.filter(match)[0], feature: null, epic: null };
  var owner = tree.epics.filter(function (e) { return e.features.some(match); })[0] || null;
  var features = owner ? owner.features : tree.orphanFeatures;
  return { node: features.filter(match)[0], feature: null, epic: owner };
}

/**
 * Parse a location hash into a route. `#/plan/<file>` gives the plan view, `#/item/<kind>/<file>`
 * with kind epic, feature, or task gives the detail view, and every other hash gives the overview.
 * The file passes the name rule of spec §4.4 here; tree membership is the page's check (treeHolds).
 */
export function parseRoute(hash) {
  var text = String(hash || '');
  var plan = /^#\/plan\/([A-Za-z0-9][A-Za-z0-9._-]*\.md)$/.exec(text);
  if (plan) return { view: 'plan', file: plan[1] };
  var agent = /^#\/agent\/([a-f0-9]{8,32})$/.exec(text);
  if (agent) return { view: 'agent', id: agent[1] };
  var step = /^#\/step\/([a-z0-9][a-z0-9-]{0,39})$/.exec(text);
  if (step) return { view: 'step', id: step[1] };
  var item = /^#\/item\/(epic|feature|task)\/([A-Za-z0-9][A-Za-z0-9._-]*\.md)$/.exec(text);
  return item ? { view: 'item', kind: item[1], file: item[2] } : { view: 'overview' };
}

/**
 * Parse the list state out of a hash: `#/backlog?kind=…&status=a,b&type=…&q=…&attn=1`. Each key is
 * optional and a missing key keeps its default, as does every other hash. A value outside the
 * fixed lists drops out; an empty `status=` keeps no status. The lists come back in their fixed
 * order. Parsing uses split, not URLSearchParams: the page defines this function in a bare scope.
 * Returns { kind, status, type, q, attention }; type null means no type filter.
 */
export function parseBacklogRoute(hash) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  var TYPES = ['feature', 'fix', 'refactor', 'debt', 'spike', 'discovery'];
  var KINDS = ['task', 'feature', 'epic'];
  var route = { kind: 'task', status: ['inbox', 'refined', 'in-progress', 'parked', 'other'], type: null, q: '', attention: false };
  var text = String(hash || '');
  if (text.indexOf('#/backlog?') !== 0) return route;
  function pick(order, raw) {
    var wanted = raw.split(',');
    return order.filter(function (value) { return wanted.indexOf(value) >= 0; });
  }
  text.slice('#/backlog?'.length).split('&').forEach(function (pair) {
    var eq = pair.indexOf('=');
    var key = eq < 0 ? pair : pair.slice(0, eq);
    var raw = eq < 0 ? '' : pair.slice(eq + 1);
    if (key === 'kind' && KINDS.indexOf(raw) >= 0) route.kind = raw;
    else if (key === 'status') route.status = pick(TASK_GROUPS, raw);
    else if (key === 'type') route.type = pick(TYPES, raw);
    else if (key === 'q') {
      try { route.q = decodeURIComponent(raw); } catch (e) { route.q = ''; }
    } else if (key === 'attn') route.attention = raw === '1';
  });
  return route;
}

/**
 * The inverse of parseBacklogRoute. The default route gives `#/`. Any other route gives
 * `#/backlog?` and only the keys that differ from the default, in the order kind, status, type,
 * q, attn.
 */
export function formatBacklogRoute(route) {
  var base = parseBacklogRoute('');
  var parts = [];
  if (route.kind !== base.kind) parts.push('kind=' + route.kind);
  if (route.status.join(',') !== base.status.join(',')) parts.push('status=' + route.status.join(','));
  if (route.type !== null) parts.push('type=' + route.type.join(','));
  if (route.q !== '') parts.push('q=' + encodeURIComponent(route.q));
  if (route.attention) parts.push('attn=1');
  return parts.length ? '#/backlog?' + parts.join('&') : '#/';
}

/**
 * The next list state after one toolbar click. action is status, type, kind, attention, or
 * show-attention; value is the chip or the kind. Status and type keep their fixed order. A type
 * list that holds every type becomes null, the no-filter state. show-attention turns the toggle
 * on. It returns a new route and leaves the argument as it is.
 */
export function toggleBacklogRoute(route, action, value) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  var TYPES = ['feature', 'fix', 'refactor', 'debt', 'spike', 'discovery'];
  var KINDS = ['task', 'feature', 'epic'];
  function flip(list, order) {
    var held = list.indexOf(value) >= 0;
    return order.filter(function (item) { return item === value ? !held : list.indexOf(item) >= 0; });
  }
  var next = { kind: route.kind, status: route.status, type: route.type, q: route.q, attention: route.attention };
  if (action === 'status') next.status = flip(route.status, TASK_GROUPS);
  else if (action === 'type') {
    var types = flip(route.type === null ? TYPES : route.type, TYPES);
    next.type = types.length === TYPES.length ? null : types;
  } else if (action === 'kind' && KINDS.indexOf(value) >= 0) next.kind = value;
  else if (action === 'attention') next.attention = !route.attention;
  else if (action === 'show-attention') next.attention = true;
  return next;
}

/**
 * Flatten the tree into the rows of one kind: 'task', 'feature', or 'epic'. One row shape serves
 * every kind; the keys that a kind does not use are null. The feature and the epic of a task come
 * from the tree structure, so a task with a broken link has neither. The title is the H1, else the
 * file name with every dash as a space. A null tree gives no row.
 */
export function backlogRows(tree, kind) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  if (!tree) return [];
  function title(node) { return node.title || String(node.name).replace(/-/g, ' '); }
  function ref(node) { return { file: node.file, id: node.id, title: title(node) }; }
  var taskByFile = new Map();
  tree.tasks.forEach(function (t) { taskByFile.set(t.file, t); });
  var parents = new Map();
  tree.epics.forEach(function (e) {
    e.features.forEach(function (f) { f.tasks.forEach(function (file) { parents.set(file, { feature: ref(f), epic: ref(e) }); }); });
  });
  tree.orphanFeatures.forEach(function (f) { f.tasks.forEach(function (file) { parents.set(file, { feature: ref(f), epic: null }); }); });
  function countGroups(files) {
    var counts = {};
    files.forEach(function (file) {
      var task = taskByFile.get(file);
      if (task) counts[task.group] = (counts[task.group] || 0) + 1;
    });
    return counts;
  }
  function row(node, extra) {
    var base = {
      kind: kind, file: node.file, id: node.id, title: title(node), type: null, status: node.status,
      group: TASK_GROUPS.indexOf(node.status) >= 0 ? node.status : 'other',
      edited: node.edited || null, flags: node.flags, warnings: node.warnings, plan: null, inFlight: false, currentStep: null,
      feature: null, epic: null, taskCounts: null, featureCount: null, taskCount: null,
    };
    return Object.assign(base, extra);
  }
  if (kind === 'task') {
    return tree.tasks.map(function (t) {
      var parent = parents.get(t.file) || { feature: null, epic: null };
      return row(t, {
        type: t.type, group: t.group, plan: t.plan ? { file: t.plan.file, status: t.plan.status } : null,
        inFlight: t.inFlight, currentStep: t.currentStep, feature: parent.feature, epic: parent.epic,
      });
    });
  }
  if (kind === 'feature') {
    var features = [];
    tree.epics.forEach(function (e) { e.features.forEach(function (f) { features.push({ node: f, epic: ref(e) }); }); });
    tree.orphanFeatures.forEach(function (f) { features.push({ node: f, epic: null }); });
    return features.map(function (entry) {
      return row(entry.node, { epic: entry.epic, taskCounts: countGroups(entry.node.tasks), taskCount: entry.node.tasks.length });
    });
  }
  return tree.epics.map(function (e) {
    var files = [];
    e.features.forEach(function (f) { files = files.concat(f.tasks); });
    return row(e, { taskCounts: countGroups(files), featureCount: e.features.length, taskCount: files.length });
  });
}

/**
 * Keep the rows that pass the list state: the search over id, title, file, type, status, feature
 * title, and epic title (case-insensitive, no regex); for tasks the status and type chips; and,
 * with the Attention toggle, only the rows whose kind/file the attention list holds. The Attention
 * toggle replaces the status chips, so an attention row shows whatever its status. attention is
 * tree.attention.
 */
export function filterRows(rows, route, attention) {
  var needle = String(route.q || '').trim().toLowerCase();
  var flagged = new Set((attention || []).map(function (a) { return a.kind + '/' + a.file; }));
  function haystack(row) {
    return [row.id, row.title, row.file, row.type, row.status, row.feature && row.feature.title, row.epic && row.epic.title]
      .map(function (value) { return value == null ? '' : String(value); }).join('\n').toLowerCase();
  }
  return rows.filter(function (row) {
    if (route.attention && !flagged.has(row.kind + '/' + row.file)) return false;
    if (needle && haystack(row).indexOf(needle) < 0) return false;
    if (row.kind !== 'task') return true;
    if (!route.attention && route.status.indexOf(row.group) < 0) return false;
    return route.type === null || route.type.indexOf(row.type) >= 0;
  });
}

/**
 * Sort rows by status group (inbox, refined, in-progress, parked, other, done, dropped), then by
 * id descending with numbers compared as numbers. A row with no id sorts last. It returns a new array.
 */
export function sortRows(rows) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  return rows.slice().sort(function (a, b) {
    var byGroup = TASK_GROUPS.indexOf(a.group) - TASK_GROUPS.indexOf(b.group);
    if (byGroup) return byGroup;
    if (a.id == null || b.id == null) return a.id == null ? (b.id == null ? 0 : 1) : -1;
    return b.id.localeCompare(a.id, undefined, { numeric: true });
  });
}

/**
 * Render the step strip of the Now card as an HTML string. progress is the resolveSteps result.
 * attribution maps a step id to the agent ids that ran in it. Only a done step with agents is a
 * button, so the current step and a pending step stay plain.
 * The page receives this function through toString(), so the body uses no module-scope symbol
 * and no import.
 */
export function renderSteps(progress, esc, attribution) {
  var html = '<div class="strip">';
  progress.steps.forEach(function (st) {
    var inner = '<div class="e">' + esc(st.emoji || '⚙️') + '</div><div class="l">' + esc(st.label || st.id) + '</div>';
    var ids = attribution && Object.prototype.hasOwnProperty.call(attribution, st.id) ? attribution[st.id] : null;
    html += st.state === 'done' && Array.isArray(ids) && ids.length
      ? '<button type="button" class="step done" data-action="open-step" data-value="' + esc(st.id) + '">' + inner + '</button>'
      : '<div class="step ' + st.state + '">' + inner + '</div>';
  });
  if (progress.unknownCurrent) html += '<div class="step current"><div class="e">⚙️</div><div class="l">' + esc(progress.unknownCurrent) + '</div></div>';
  if (!progress.steps.length && !progress.unknownCurrent) html += '<div class="empty">track <code>' + esc(progress.track) + '</code> has no steps in tracks.json</div>';
  return html + '</div>';
}

/**
 * Render the Now card (header, step strip, modifiers, facts) as an HTML string, or the empty
 * state when no workflow runs. view = { state, progress, task, tokens, attribution, projectDir,
 * hhmm, fmtDur, fmtTok, since }. tokens is the snapshot tokens fact: its source sets the tooltip. task is the tree node of state.task, or null. The snapshot errors
 * are not part of this markup: the page writes them to their own region. The page receives this
 * function through toString(); renderSteps is its top-level neighbor on the page.
 */
export function renderNow(view, esc) {
  var s = view.state, p = view.progress, task = view.task;
  if (!s) return '<div class="empty">No workflow in flight<br><code>watching ' + esc(view.projectDir) + '/.constellation/</code></div>';
  function fact(k, v, title) { return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(v) + '</div></div>'; }
  var tk = view.tokens || { source: 'none', spent: null };
  function num(n) { return Number(n).toLocaleString('en-US'); }
  var tokenTitle = tk.source === 'transcripts'
    ? 'from session transcripts since ' + tk.since + ': ' + num(tk.input) + ' / ' + num(tk.cache) + ' / ' + num(tk.output)
    : tk.source === 'state' ? 'from the state file, as the model reported it' : '';
  function sinceSpan(iso, text) { return '<span data-since="' + esc(iso || '') + '" data-prefix="">' + esc(text) + '</span>'; }
  var taskLabel = task && task.title ? '<code>' + esc(task.id || s.task) + '</code> ' + esc(task.title) : '<code>' + esc(s.task) + '</code>';
  var head = '<div class="meta mb12">'
    + '<span class="chip">' + esc(p.track) + (p.n != null ? ' ' + p.n + '/' + p.N : '') + '</span>'
    + (s.branch ? '<span><code>' + esc(s.branch) + '</code></span>' : '')
    + (s.task ? '<span>task ' + taskLabel + '</span>' : '')
    + '</div>';
  var mods = p.modifiers.length ? '<div class="mods">' + p.modifiers.map(function (m) { return '<span class="chip">' + esc(m) + '</span>'; }).join('') + '</div>' : '';
  var facts = '<div class="facts">'
    + '<div class="fact"><div class="k">elapsed</div><div class="v">' + sinceSpan(s.startedAt, view.fmtDur(view.since(s.startedAt)) || '—') + '</div></div>'
    + fact('last save', view.hhmm(s.lastUpdatedAt))
    + fact('tokens spent', view.fmtTok(tk.spent), tokenTitle)
    + fact('review loops', s.reviewLoopCount != null ? s.reviewLoopCount : '—')
    + fact('PR', s.prNumber != null ? '#' + s.prNumber : '—')
    + fact('model profile', s.modelProfile || '—')
    + '</div>';
  return head + renderSteps(p, esc, view.attribution) + mods + facts;
}

/**
 * Render the Now card actions: the View plan button and the Open task button, or '' when no
 * workflow runs. Each button is disabled, with the reason in its title, when the state names no
 * plan or task or the tree does not hold it. view = { state, tree }. The page receives this
 * function through toString(), so the body uses no module-scope symbol and no import; treeHolds
 * is its top-level neighbor on the page.
 */
export function renderNowActions(view, esc) {
  var s = view.state;
  if (!s) return '';
  var planButton = '<button type="button" class="btn primary" ';
  var taskButton = '<button type="button" class="btn secondary" ';
  var viewPlan = !s.plan
    ? planButton + 'disabled title="no plan in the workflow state">View plan</button>'
    : !treeHolds(view.tree, 'plan', s.plan)
      ? planButton + 'disabled title="' + esc('plan ' + s.plan + ' is not in .constellation/plans/') + '">View plan</button>'
      : planButton + 'data-action="view-plan" data-file="' + esc(s.plan) + '">View plan</button>';
  var openTask = !s.task
    ? taskButton + 'disabled title="no task in the workflow state">Open task</button>'
    : !treeHolds(view.tree, 'task', s.task)
      ? taskButton + 'disabled title="' + esc('task ' + s.task + ' is not in .constellation/tasks/') + '">Open task</button>'
      : taskButton + 'data-action="open-task" data-file="' + esc(s.task) + '">Open task</button>';
  return viewPlan + openTask;
}

/**
 * Render the detail view of an epic, a feature, or a task: the breadcrumb, the header, for a task
 * the View plan button and the related chips, the body, and the child tables (the tasks of a
 * feature; the features and the tasks of an epic). view = { kind, file, tree, body, backHash }.
 * body is the HTML that the page built, or null while it loads. A name that the tree does not
 * hold gives a short empty state. The page receives this function through toString(), so the body
 * uses no module-scope symbol and no import; findItem, treeHolds, chipClass, backlogRows,
 * sortRows, and renderTable are its top-level neighbors on the page.
 */
export function renderItemView(view, esc) {
  var TASK_GROUPS = ['inbox', 'refined', 'in-progress', 'parked', 'other', 'done', 'dropped'];
  var tree = view.tree;
  var found = findItem(tree, view.kind, view.file);
  if (!found) return '<div class="empty">Item not found</div>';
  var node = found.node;
  function label(n) { return (n.id ? n.id + ' ' : '') + (n.title || String(n.name).replace(/-/g, ' ')); }
  function levelLink(n, kind) { return '<a href="#/item/' + kind + '/' + esc(n.file) + '">' + esc(label(n)) + '</a>'; }
  function crumbs() {
    var levels = ['<a href="' + esc(view.backHash || '#/') + '">Backlog</a>'];
    if (found.epic) levels.push(levelLink(found.epic, 'epic'));
    if (found.feature) levels.push(levelLink(found.feature, 'feature'));
    levels.push('<span>' + esc(label(node)) + '</span>');
    return '<nav class="crumbs">' + levels.join(' › ') + '</nav>';
  }
  function head() {
    var isTask = view.kind === 'task';
    var html = '<div class="item-head"><span class="item-title">' + esc(label(node)) + '</span> '
      + '<span class="chip ' + chipClass('s-', TASK_GROUPS, isTask ? node.group : node.status) + '">' + esc(node.status || '—') + '</span>';
    if (isTask && node.type) html += ' <span class="chip">' + esc(node.type) + '</span>';
    if (isTask && node.plan) html += ' <span class="chip ' + chipClass('p-', ['draft', 'approved'], node.plan.status) + '">plan ' + esc(node.plan.status || '—') + '</span>';
    if (node.created) html += ' <span class="muted">created ' + esc(node.created) + '</span>';
    if (node.edited) html += ' <span class="muted">edited ' + esc(node.edited) + '</span>';
    if (node.flags.length) html += '<ul class="warns">' + node.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
    return html + '</div>';
  }
  function taskActions() {
    var button = node.plan
      ? '<button type="button" class="btn primary" data-action="view-plan" data-file="' + esc(node.plan.file) + '">View plan</button>'
      : '<button type="button" class="btn primary" disabled title="no plan for this task">View plan</button>';
    var related = (node.related || []).map(function (name) {
      return treeHolds(tree, 'task', name)
        ? '<a class="chip" href="#/item/task/' + esc(name) + '">' + esc(name) + '</a>'
        : '<span class="chip" title="not in .constellation/tasks/">' + esc(name) + '</span>';
    });
    return '<div class="actions">' + button + '</div>' + (related.length ? '<div class="related">' + related.join('') + '</div>' : '');
  }
  function childTable(heading, childKind, files) {
    var rows = sortRows(backlogRows(tree, childKind).filter(function (r) { return files.indexOf(r.file) >= 0; }));
    return '<h3>' + heading + '</h3>' + (rows.length ? renderTable(rows, childKind, esc) : '<p class="muted">No ' + heading.toLowerCase() + '</p>');
  }
  function children() {
    if (view.kind === 'feature') return childTable('Tasks', 'task', node.tasks);
    if (view.kind !== 'epic') return '';
    var taskFiles = [];
    node.features.forEach(function (f) { taskFiles = taskFiles.concat(f.tasks); });
    return childTable('Features', 'feature', node.features.map(function (f) { return f.file; })) + childTable('Tasks', 'task', taskFiles);
  }
  var body = view.body == null ? '<p class="muted">loading</p>' : view.body;
  return crumbs() + head() + (view.kind === 'task' ? taskActions() : '') + '<div id="item-body" class="md">' + body + '</div>' + children();
}

/**
 * Render the inner HTML of the plan dialog: the header (title, file, status chip, task id, close
 * button) and the body. view = { plan: { file, status, title, taskId }, item, markdownit, tree }. item is
 * a /api/item reply or { error }. The status class maps through a fixed allow-list. The page
 * receives this function through toString(); renderItemBody is its top-level neighbor.
 */
export function renderPlanDialog(view, esc) {
  var plan = view.plan, item = view.item;
  var head = '<div class="dlg-head"><span id="dialog-title">' + esc(plan.title || plan.file) + '</span>'
    + '<code>' + esc(plan.file) + '</code>'
    + '<span class="chip ' + chipClass('p-', ['draft', 'approved'], plan.status) + '">' + esc(plan.status || '') + '</span>'
    + (plan.taskId ? '<span class="muted">task ' + esc(plan.taskId) + '</span>' : '')
    + '<button type="button" class="btn secondary" data-action="close-dialog" aria-label="Close">✕</button></div>';
  var body = !item || item.error
    ? '<p class="muted">plan unavailable (' + esc(item && item.error ? item.error : 'no reply') + ')</p>'
    : renderItemBody(item, view.markdownit, esc, view.tree);
  return head + '<div class="dlg-body md">' + body + '</div>';
}

/**
 * The header facts of one agent run: type, description, model, start, duration, tokens. reply is a
 * /api/agent reply or an error stub that keeps the snapshot fields. view = { hhmm, fmtDur, fmtTok }.
 * Every text goes through esc. The page receives this function through toString(), so the body uses
 * no module-scope symbol and no import.
 */
export function renderAgentHead(reply, view, esc) {
  var usage = reply.usage || null;
  return '<span class="ah-type">' + esc(String(reply.agent_type || 'agent').replace(/^constellation:/, '')) + '</span>'
    + (reply.description ? '<span class="muted">' + esc(reply.description) + '</span>' : '')
    + (reply.model ? '<span class="chip">' + esc(reply.model) + '</span>' : '')
    + '<span class="t">' + esc(view.hhmm(reply.start)) + '</span>'
    + '<span class="dur">' + esc(view.fmtDur(reply.durationSec)) + '</span>'
    + '<span class="tok">' + esc(view.fmtTok(usage ? usage.spent : null)) + ' tok</span>';
}

/**
 * The report of one agent run as HTML: the markdown with its first heading kept, then the muted
 * truncation line. A reply without a report gives `Transcript not available (<reason>)`, where the
 * reason is the reply error, a status code, or network. view = { markdownit, tree }. renderMarkdown
 * is its top-level neighbor on the page.
 */
export function renderAgentReport(reply, view, esc) {
  if (typeof reply.report !== 'string') {
    return '<p class="muted">Transcript not available (' + esc(reply.error == null ? 'no reply' : reply.error) + ')</p>';
  }
  return renderMarkdown(reply.report, view.markdownit, esc, view.tree, true)
    + (reply.truncated ? '<p class="muted">truncated at 256 KB</p>' : '');
}

/**
 * The inner HTML of the agent dialog: the header with the close button, the facts of the run, and
 * its report. view = { reply, markdownit, tree, hhmm, fmtDur, fmtTok }. renderAgentHead and
 * renderAgentReport are its top-level neighbors on the page.
 */
export function renderAgentDialog(view, esc) {
  var head = '<div class="dlg-head"><span id="dialog-title">Agent report</span>'
    + '<button type="button" class="btn secondary" data-action="close-dialog" aria-label="Close">✕</button></div>';
  return head + '<div class="dlg-body md"><div class="ahead">' + renderAgentHead(view.reply, view, esc) + '</div>'
    + renderAgentReport(view.reply, view, esc) + '</div>';
}

/**
 * The inner HTML of the step dialog: the step header with the close button, then one details block
 * per agent run, start ascending (newest last). One block alone is open. view = { step: { id,
 * emoji, label }, replies, markdownit, tree, hhmm, fmtDur, fmtTok }. renderAgentHead and
 * renderAgentReport are its top-level neighbors on the page.
 */
export function renderStepDialog(view, esc) {
  var head = '<div class="dlg-head"><span id="dialog-title">' + esc(view.step.emoji || '⚙️') + ' ' + esc(view.step.label || view.step.id) + '</span>'
    + '<button type="button" class="btn secondary" data-action="close-dialog" aria-label="Close">✕</button></div>';
  var ordered = view.replies.slice().sort(function (a, b) { return String(a.start || '').localeCompare(String(b.start || '')); });
  var open = ordered.length === 1 ? ' open' : '';
  var blocks = ordered.map(function (reply) {
    return '<details class="ablock"' + open + '><summary>' + renderAgentHead(reply, view, esc) + '</summary>'
      + '<div class="md">' + renderAgentReport(reply, view, esc) + '</div></details>';
  }).join('');
  return head + '<div class="dlg-body">' + blocks + '</div>';
}
