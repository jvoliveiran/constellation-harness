
(function () {
  var snap = null;
  var showAllAgents = false;
  var connected = false, lostAt = null;
  // The task body and the plan dialog each remember what they show. A reply writes the DOM only when it is still the newest request.
  var taskBody = { file: null, mtime: null };
  var taskSeq = 0;
  var dialogFile = null, dialogSeq = 0, routeBefore = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
  var hhmm = function (iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? '—' : d.toTimeString().slice(0, 8); };
  var fmtDur = function (sec) { if (sec == null) return ''; if (sec < 60) return sec + 's'; if (sec < 3600) return Math.floor(sec/60) + 'm ' + (sec%60) + 's'; return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm'; };
  var nowMs = function () { return connected ? Date.now() : (lostAt || Date.now()); };
  var since = function (iso) { if (!iso) return null; var ms = nowMs() - Date.parse(iso); return isNaN(ms) ? null : Math.max(0, Math.round(ms/1000)); };
  var fmtTok = function (n) { if (n == null) return '—'; return n >= 1e6 ? (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n/1e3) + 'k' : String(n); };

  function render() {
    if (!snap) return;
    renderMeta();
    renderNowCard();
    renderBacklogCard();
    renderAgentsCard();
    syncRoute();
    tick();
  }

  function renderMeta() {
    var meta = '<span><code>' + esc(snap.projectDir) + '</code></span>';
    if (!snap.initialized) meta += '<span class="chip warn">not initialized — no .constellation/config.json</span>';
    if (!snap.hasTracks) meta += '<span class="chip warn">tracks.json missing</span>';
    if (snap.stale) meta += '<span class="chip warn">stale — state file unreadable, showing last good</span>';
    if (!connected && lostAt) meta += '<span class="chip warn">disconnected since ' + hhmm(new Date(lostAt).toISOString()).slice(0, 5) + ' — showing last data</span>';
    meta += '<span>updated ' + hhmm(snap.at) + '</span>';
    document.getElementById('meta').innerHTML = meta;
  }

  function renderNowCard() {
    var s = snap.state;
    var tasks = snap.tree ? snap.tree.tasks : [];
    var task = s && s.task ? tasks.filter(function (t) { return t.file === s.task; })[0] || null : null;
    document.getElementById('now').innerHTML = renderNow({
      state: s, progress: snap.progress, task: task, tokenDelta: snap.tokenDelta, projectDir: snap.projectDir,
      hhmm: hhmm, fmtDur: fmtDur, fmtTok: fmtTok, since: since,
    }, esc);
    document.getElementById('now-errs').innerHTML = snap.errors && snap.errors.length ? snap.errors.map(esc).join('<br>') : '';
    var actions = document.getElementById('now-actions');
    actions.innerHTML = renderNowActions({ state: s, tree: snap.tree }, esc);
    actions.hidden = !s;
    document.getElementById('desc').hidden = !(s && s.task);
    syncTaskBody(task);
  }

  function loadItem(kind, file) {
    return fetch('/api/item?kind=' + kind + '&file=' + encodeURIComponent(file))
      .then(function (r) { return r.ok ? r.json() : { error: r.status }; })
      .catch(function () { return { error: 'network' }; });
  }

  // The body is fetched once per task file and mtime, so the region keeps its scroll position between snapshots.
  function syncTaskBody(task) {
    var s = snap.state;
    if (!s || !s.task) { taskBody = { file: null, mtime: null }; taskSeq++; return; }
    var mtime = task ? task.mtime : null;
    if (taskBody.file === s.task && taskBody.mtime === mtime) return;
    taskBody = { file: s.task, mtime: mtime };
    var seq = ++taskSeq;
    loadItem('task', s.task).then(function (item) {
      if (seq !== taskSeq) return;
      document.getElementById('desc').innerHTML = item.error
        ? '<p class="muted">task body unavailable (' + esc(item.error) + ')</p>'
        : renderItemBody(item, window.markdownit, esc);
    });
  }

  // The plan of a route, from the tree: the plan of a task, or a plan with no task.
  function planView(file) {
    var tasks = snap.tree ? snap.tree.tasks : [];
    var owner = tasks.filter(function (t) { return t.plan && t.plan.file === file; })[0];
    if (owner) return { file: file, status: owner.plan.status, title: owner.plan.title, taskId: owner.id };
    var orphan = (snap.tree ? snap.tree.orphanPlans : []).filter(function (p) { return p.file === file; })[0];
    return { file: file, status: orphan ? orphan.status : null, title: orphan ? orphan.title : null, taskId: null };
  }

  function openPlan(file, dialog) {
    dialogFile = file;
    var seq = ++dialogSeq;
    loadItem('plan', file).then(function (item) {
      if (seq !== dialogSeq) return;
      dialog.innerHTML = renderPlanDialog({ plan: planView(file), item: item, markdownit: window.markdownit }, esc);
      if (!dialog.open) dialog.showModal();
    });
  }

  // The route decides the dialog. A plan route that the tree does not hold shows the overview and keeps the hash.
  function syncRoute() {
    var route = parseRoute(location.hash);
    var dialog = document.getElementById('dialog');
    if (route.view === 'plan' && treeHolds(snap.tree, 'plan', route.file)) {
      if (dialogFile !== route.file) openPlan(route.file, dialog);
      return;
    }
    dialogSeq++;
    dialogFile = null;
    if (dialog.open) dialog.close();
  }

  // Esc and the close button end here. replaceState fires no hashchange, so syncRoute runs by hand.
  // When the plan leaves the tree, syncRoute closes the dialog while the hash still names the plan.
  // This handler then replaces the hash, so the route never names a plan that the tree does not hold
  // and the plan does not reopen by itself when its file returns.
  function onDialogClose() {
    dialogFile = null;
    if (parseRoute(location.hash).view === 'plan') {
      history.replaceState(null, '', routeBefore || '#/');
      routeBefore = null;
      if (snap) syncRoute();
    }
  }

  function renderBacklogCard() {
    document.getElementById('backlog').innerHTML = renderBacklog({ tree: snap.tree, route: parseBacklogRoute(location.hash) }, esc);
  }

  function renderAgentsCard() {
    var activity = snap.feed || [];
    var html;
    if (!snap.agents.length && !activity.length) {
      html = '<div class="empty">No events yet<br><code>.constellation/metrics/events.jsonl</code></div>';
    } else {
      html = renderAgents({ agents: snap.agents, showAll: showAllAgents, hhmm: hhmm, fmtDur: fmtDur }, esc) + renderActivity(activity);
    }
    document.getElementById('agents').innerHTML = html;
  }

  function renderActivity(activity) {
    if (!activity.length) return '';
    var rows = activity.map(function (e) {
      return '<li><span class="t">' + hhmm(e.ts) + '</span><span>' + feedText(e, esc) + '</span></li>';
    }).join('');
    return '<h2 class="mt16">Activity</h2><ul>' + rows + '</ul>';
  }

  function tick() {
    document.querySelectorAll('[data-since]').forEach(function (el) {
      var secs = since(el.getAttribute('data-since'));
      if (secs != null) el.textContent = el.getAttribute('data-prefix') + fmtDur(secs);
    });
  }

  // Theme: the OS theme applies through CSS alone. A stored choice sets data-theme, which wins.
  function effectiveTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function paintThemeButton() {
    var button = document.getElementById('theme');
    var light = effectiveTheme() === 'light';
    button.textContent = light ? '☀' : '☾';
    button.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
  }
  function toggleTheme() {
    var next = effectiveTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('board-theme', next); } catch (e) { /* storage refused: the choice lasts until reload */ }
    paintThemeButton();
  }
  try {
    var storedTheme = localStorage.getItem('board-theme');
    if (storedTheme === 'light' || storedTheme === 'dark') document.documentElement.setAttribute('data-theme', storedTheme);
  } catch (e) { /* storage refused: follow the OS theme */ }
  paintThemeButton();
  document.getElementById('theme').addEventListener('click', toggleTheme);
  document.getElementById('agents').addEventListener('click', function (ev) {
    // closest: a click on a child of the button still counts.
    if (ev.target && ev.target.closest && ev.target.closest('[data-action="show-all"]')) { showAllAgents = true; render(); }
  });
  document.getElementById('now-actions').addEventListener('click', function (ev) {
    var button = ev.target && ev.target.closest && ev.target.closest('[data-action="view-plan"]');
    if (!button) return;
    routeBefore = location.hash || '#/';
    location.hash = '#/plan/' + button.getAttribute('data-file');
  });
  document.getElementById('dialog').addEventListener('click', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('[data-action="close-dialog"]')) document.getElementById('dialog').close();
  });
  document.getElementById('dialog').addEventListener('close', onDialogClose);
  window.addEventListener('hashchange', function () { if (snap) syncRoute(); });

  var es = new EventSource('/events');
  es.onopen = function () { connected = true; lostAt = null; render(); };
  es.onmessage = function (ev) { connected = true; lostAt = null; try { snap = JSON.parse(ev.data); render(); } catch (e) { /* ignore */ } };
  es.onerror = function () { connected = false; if (lostAt == null) lostAt = Date.now(); render(); };
  setInterval(tick, 1000);
})();
