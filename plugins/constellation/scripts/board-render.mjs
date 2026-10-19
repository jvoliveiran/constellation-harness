// Constellation Harness — board render: the pure render functions of the page.
//
// Every export is a function whose body uses no module-scope symbol and no import. board.mjs
// ships each export to the page through toString(), so the page runs the same code that
// board.test.mjs tests. A constant that a function needs sits inside its body.

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
  function header(node) {
    return '<div class="gh">' + esc(node.id || '') + ' ' + esc(node.name) + ' <span class="chip s-' + esc(node.status || 'other') + '">' + esc(node.status || '') + '</span>' + badge(node) + '</div>' + warnLines(node);
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
