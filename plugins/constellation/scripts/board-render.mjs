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
 * Render the backlog tree as an HTML string. The page receives this function through
 * toString(), so the body uses no module-scope symbol and no import.
 */
export function renderBacklog(tree, esc) {
  var GLYPHS = { inbox: '📥', refined: '📋', 'in-progress': '🔨', parked: '🅿️', done: '✅', dropped: '🚫', other: '❓' };
  var PLAN_GLYPHS = { draft: '📝', approved: '👍' };
  function glyph(map, key, fallback) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback; }
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
    var plan = t.plan ? ' <span title="plan ' + esc(t.plan.status) + '">' + glyph(PLAN_GLYPHS, t.plan.status, '📝') + '</span>' : '';
    var step = t.inFlight ? ' <span class="run">▶ ' + esc(t.currentStep || '') + '</span>' : '';
    return '<div class="task" data-file="' + esc(t.file) + '" title="' + esc(t.warnings.join('; ')) + '">'
      + glyph(GLYPHS, t.group, GLYPHS.other) + ' ' + esc(t.id || '') + ' ' + esc(t.name)
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
  var STATUS_CLASSES = ['inbox', 'refined', 'in-progress', 'parked', 'done', 'dropped'];
  function header(node) {
    return '<div class="gh">' + esc(node.id || '') + ' ' + esc(node.name) + ' <span class="chip ' + chipClass('s-', STATUS_CLASSES, node.status) + '">' + esc(node.status || '') + '</span>' + badge(node) + '</div>' + warnLines(node);
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
      return '<div class="task">' + glyph(PLAN_GLYPHS, p.status, '📝') + ' <code>' + esc(p.file) + '</code>' + badge(p) + '</div>' + warnLines(p);
    }).join(''));
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
 * snapshot sorts it. No agents gives ''.
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
    return '<li><span class="t">' + esc(view.hhmm(a.start)) + '</span><span' + (a.running ? ' class="run"' : '') + '>' + name(a) + '</span>' + dur + '</li>';
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
 * the library factory (window.markdownit); null renders the text in a <pre>. The page receives
 * this function through toString(), so the body uses no module-scope symbol and no import.
 */
export function renderMarkdown(text, markdownit, esc) {
  var body = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').replace(/^# .*(\r?\n|$)/m, '');
  if (!markdownit) return '<pre class="md-raw">' + esc(body) + '</pre>';
  var md = markdownit({ html: false, linkify: false, typographer: false, breaks: false });
  var isRemote = function (href) { return /^https?:\/\//i.test(href || ''); };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    var token = tokens[idx];
    var href = token.attrGet('href');
    if (isRemote(href)) { token.attrSet('rel', 'noopener noreferrer'); token.attrSet('target', '_blank'); }
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
export function renderItemBody(item, markdownit, esc) {
  return renderMarkdown(item.text, markdownit, esc) + (item.truncated ? '<p class="muted">truncated at 512 KB</p>' : '');
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
 * Parse a location hash into a route. `#/plan/<file>` gives the plan view, `#/item/<kind>/<file>`
 * with kind epic, feature, or task gives the detail view, and every other hash gives the overview.
 * The file passes the name rule of spec §4.4 here; tree membership is the page's check (treeHolds).
 */
export function parseRoute(hash) {
  var text = String(hash || '');
  var plan = /^#\/plan\/([A-Za-z0-9][A-Za-z0-9._-]*\.md)$/.exec(text);
  if (plan) return { view: 'plan', file: plan[1] };
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
 * The page receives this function through toString(), so the body uses no module-scope symbol
 * and no import.
 */
export function renderSteps(progress, esc) {
  var html = '<div class="strip">';
  progress.steps.forEach(function (st) {
    html += '<div class="step ' + st.state + '"><div class="e">' + esc(st.emoji || '⚙️') + '</div><div class="l">' + esc(st.label || st.id) + '</div></div>';
  });
  if (progress.unknownCurrent) html += '<div class="step current"><div class="e">⚙️</div><div class="l">' + esc(progress.unknownCurrent) + '</div></div>';
  if (!progress.steps.length && !progress.unknownCurrent) html += '<div class="empty">track <code>' + esc(progress.track) + '</code> has no steps in tracks.json</div>';
  return html + '</div>';
}

/**
 * Render the Now card (header, step strip, modifiers, facts) as an HTML string, or the empty
 * state when no workflow runs. view = { state, progress, task, tokenDelta, projectDir, hhmm,
 * fmtDur, fmtTok, since }. task is the tree node of state.task, or null. The snapshot errors
 * are not part of this markup: the page writes them to their own region. The page receives this
 * function through toString(); renderSteps is its top-level neighbor on the page.
 */
export function renderNow(view, esc) {
  var s = view.state, p = view.progress, task = view.task;
  if (!s) return '<div class="empty">No workflow in flight<br><code>watching ' + esc(view.projectDir) + '/.constellation/</code></div>';
  function fact(k, v) { return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }
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
    + fact('tokens spent', view.fmtTok(view.tokenDelta))
    + fact('review loops', s.reviewLoopCount != null ? s.reviewLoopCount : '—')
    + fact('PR', s.prNumber != null ? '#' + s.prNumber : '—')
    + fact('model profile', s.modelProfile || '—')
    + '</div>';
  return head + renderSteps(p, esc) + mods + facts;
}

/**
 * Render the Now card actions: the View plan button, or '' when no workflow runs. The button is
 * disabled, with the reason in its title, when the state names no plan or the tree does not hold
 * it. view = { state, tree }. The page receives this function through toString(), so the body
 * uses no module-scope symbol and no import; treeHolds is its top-level neighbor on the page.
 */
export function renderNowActions(view, esc) {
  var s = view.state;
  if (!s) return '';
  var base = '<button type="button" class="btn primary" ';
  if (!s.plan) return base + 'disabled title="no plan in the workflow state">View plan</button>';
  if (!treeHolds(view.tree, 'plan', s.plan)) return base + 'disabled title="' + esc('plan ' + s.plan + ' is not in .constellation/plans/') + '">View plan</button>';
  return base + 'data-action="view-plan" data-file="' + esc(s.plan) + '">View plan</button>';
}

/**
 * Render the inner HTML of the plan dialog: the header (title, file, status chip, task id, close
 * button) and the body. view = { plan: { file, status, title, taskId }, item, markdownit }. item is
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
    : renderItemBody(item, view.markdownit, esc);
  return head + '<div class="dlg-body md">' + body + '</div>';
}
