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
 * Parse a location hash into a route. `#/plan/<file>` with a valid file name gives the plan view;
 * every other hash gives the overview. Task 024 extends the table.
 */
export function parseRoute(hash) {
  var match = /^#\/plan\/([A-Za-z0-9][A-Za-z0-9._-]*\.md)$/.exec(String(hash || ''));
  return match ? { view: 'plan', file: match[1] } : { view: 'overview' };
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
