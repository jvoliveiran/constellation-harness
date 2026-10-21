
(function () {
  var snap = null;
  var showAllAgents = false;
  var connected = false, lostAt = null;
  // The task body, the detail body, and the plan dialog each remember what they show. A reply writes the DOM only when it is still the newest request.
  function newSlot() { return { key: null, mtime: null, failed: false, seq: 0 }; }
  var taskSlot = newSlot(), itemSlot = newSlot();
  var itemBodyHtml = null;          // the rendered body of the open detail view; null while it loads
  var lastListHash = '#/';          // the Backlog target of the breadcrumb: the last list the page showed
  var searchTimer = null;
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

  // Fetch a body once per file and mtime. A failed reply marks the slot, so the next render (a snapshot,
  // or es.onopen after a reconnect) fetches again. Only the newest reply writes. Returns true when the file changed.
  function syncBody(slot, kind, file, mtime, write) {
    var key = kind + '/' + file;
    if (slot.key === key && slot.mtime === mtime && !slot.failed) return false;
    var fileChanged = slot.key !== key;
    slot.key = key; slot.mtime = mtime; slot.failed = false;
    var seq = ++slot.seq;
    loadItem(kind, file).then(function (item) {
      if (seq !== slot.seq) return;
      if (item.error) slot.failed = true;
      write(item);
    });
    return fileChanged;
  }

  function writeDesc(item) {
    document.getElementById('desc').innerHTML = item.error
      ? '<p class="muted">task body unavailable (' + esc(item.error) + ')</p>'
      : renderItemBody(item, window.markdownit, esc, snap.tree);
  }

  // A new in-flight task shows a muted loading line, not the old body. An mtime change keeps the old body until the reply.
  function syncTaskBody(task) {
    var s = snap.state;
    if (!s || !s.task) { taskSlot.key = null; taskSlot.seq++; return; }
    // A task outside the tree has no file to read: a fetch would answer 404 on every render and every reconnect.
    if (!treeHolds(snap.tree, 'task', s.task)) {
      taskSlot.key = null; taskSlot.seq++;
      document.getElementById('desc').innerHTML = '<p class="muted">task file not in .constellation/tasks/</p>';
      return;
    }
    if (syncBody(taskSlot, 'task', s.task, task ? task.mtime : null, writeDesc)) document.getElementById('desc').innerHTML = '<p class="muted">loading</p>';
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
      dialog.innerHTML = renderPlanDialog({ plan: planView(file), item: item, markdownit: window.markdownit, tree: snap.tree }, esc);
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

  // The route decides the card: a detail view for an item route that the tree holds, else the list. The plan
  // dialog keeps the view behind it. An item route that the tree does not hold shows the list and keeps the hash.
  function renderBacklogCard() {
    keepFocus(paintBacklogCard);
  }

  // A repaint replaces the focused chip or link. Record its stable key first, then focus the match after the repaint.
  function keepFocus(repaint) {
    var card = document.getElementById('backlog-card');
    var active = document.activeElement;
    var key = null;
    if (active && active.getAttribute && card.contains && card.contains(active)) {
      var action = active.getAttribute('data-action'), href = active.getAttribute('href');
      if (action || href) key = { action: action, value: active.getAttribute('data-value'), href: href };
    }
    repaint();
    if (!key) return;
    var candidates = card.querySelectorAll('[data-action], a[href]');
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var same = key.action
        ? c.getAttribute('data-action') === key.action && c.getAttribute('data-value') === key.value
        : c.getAttribute('href') === key.href;
      if (same) { c.focus(); return; }
    }
  }

  function paintBacklogCard() {
    var listHash = parseRoute(location.hash).view === 'plan' ? (routeBefore || '#/') : location.hash;
    var shown = parseRoute(listHash);
    if (shown.view === 'item' && treeHolds(snap.tree, shown.kind, shown.file)) showItem(shown);
    else showList(listHash, shown);
  }

  function showItem(shown) {
    var node = findItem(snap.tree, shown.kind, shown.file).node;
    var onReply = function (item) {
      itemBodyHtml = item.error
        ? '<p class="muted">body unavailable (' + esc(item.error) + ')</p>'
        : renderItemBody(item, window.markdownit, esc, snap.tree);
      keepFocus(function () { paintItem(shown); });
    };
    if (syncBody(itemSlot, shown.kind, shown.file, node.mtime, onReply)) itemBodyHtml = null;
    document.getElementById('bl-list').hidden = true;
    document.getElementById('bl-item').hidden = false;
    paintItem(shown);
  }

  // The reply paints the view directly: renderBacklogCard would sync again and refetch a failed body at once.
  function paintItem(shown) {
    document.getElementById('bl-item').innerHTML = renderItemView({ kind: shown.kind, file: shown.file, tree: snap.tree, body: itemBodyHtml, backHash: lastListHash }, esc);
  }

  function showList(listHash, shown) {
    itemSlot.key = null; itemSlot.seq++;
    document.getElementById('bl-item').hidden = true;
    document.getElementById('bl-list').hidden = false;
    // A hash that names an item outside the tree must not become the Backlog target of a later breadcrumb.
    if (shown.view === 'overview') lastListHash = listHash || '#/';
    var route = parseBacklogRoute(listHash);
    document.getElementById('bl-banner').innerHTML = renderAttention(snap.tree, esc);
    document.getElementById('bl-chips').innerHTML = renderToolbar({ route: route, tree: snap.tree }, esc);
    document.getElementById('backlog').innerHTML = renderBacklog({ tree: snap.tree, route: route }, esc);
  }

  // A list edit replaces the history entry, so Back leaves the list, not the last chip. replaceState fires no hashchange.
  function writeList(route) {
    history.replaceState(null, '', formatBacklogRoute(route));
    renderBacklogCard();
  }

  var LIST_ACTIONS = ['status', 'type', 'kind', 'attention', 'show-attention'];

  function onBacklogClick(ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    for (var i = 0; i < LIST_ACTIONS.length; i++) {
      var chip = target.closest('[data-action="' + LIST_ACTIONS[i] + '"]');
      if (chip) { writeList(toggleBacklogRoute(parseBacklogRoute(location.hash), LIST_ACTIONS[i], chip.getAttribute('data-value'))); return; }
    }
    if (target.closest('[data-action="reset"]')) { document.getElementById('q').value = ''; writeList(parseBacklogRoute('')); return; }
    var plan = target.closest('[data-action="view-plan"]');
    if (plan) { openPlanRoute(plan.getAttribute('data-file')); return; }
    if (target.closest('a[href]')) return; // the browser follows the anchor and pushes the history entry
    var row = target.closest('tr[data-href]');
    var href = row ? row.getAttribute('data-href') : null;
    if (href && parseRoute(href).view === 'item') location.hash = href;
  }

  function openPlanRoute(file) {
    routeBefore = location.hash || '#/';
    location.hash = '#/plan/' + file;
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      // A click or Back within the debounce moved the route: writing the list now would replace that entry.
      if (parseRoute(location.hash).view !== 'overview') return;
      var route = parseBacklogRoute(location.hash);
      route.q = document.getElementById('q').value;
      writeList(route);
    }, 100);
  }

  // The search box follows the hash on a list route: a reload, Back, or a pasted link fills it. Typing writes with replaceState, which fires no hashchange.
  function syncSearchBox() {
    if (parseRoute(location.hash).view === 'overview') document.getElementById('q').value = parseBacklogRoute(location.hash).q;
  }

  function onRoute() {
    clearTimeout(searchTimer);
    syncSearchBox();
    if (!snap) return;
    renderBacklogCard();
    syncRoute();
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
    var target = ev.target;
    if (!target || !target.closest) return;
    var plan = target.closest('[data-action="view-plan"]');
    if (plan) { openPlanRoute(plan.getAttribute('data-file')); return; }
    var task = target.closest('[data-action="open-task"]');
    if (!task) return;
    location.hash = '#/item/task/' + task.getAttribute('data-file');
    // At 1280 px the backlog card sits under the Now card, so the view opens out of sight without the scroll.
    var card = document.getElementById('backlog-card');
    if (card.scrollIntoView) card.scrollIntoView({ block: 'start' });
  });
  document.getElementById('backlog-card').addEventListener('click', onBacklogClick);
  document.getElementById('q').addEventListener('input', onSearchInput);
  document.getElementById('dialog').addEventListener('click', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('[data-action="close-dialog"]')) document.getElementById('dialog').close();
  });
  document.getElementById('dialog').addEventListener('close', onDialogClose);
  window.addEventListener('hashchange', onRoute);
  syncSearchBox();

  var es = new EventSource('/events');
  es.onopen = function () { connected = true; lostAt = null; render(); };
  es.onmessage = function (ev) { connected = true; lostAt = null; try { snap = JSON.parse(ev.data); render(); } catch (e) { /* ignore */ } };
  es.onerror = function () { connected = false; if (lostAt == null) lostAt = Date.now(); render(); };
  setInterval(tick, 1000);
})();
