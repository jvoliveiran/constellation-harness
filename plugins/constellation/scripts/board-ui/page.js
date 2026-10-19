
(function () {
  var snap = null;
  var showAllAgents = false;
  var connected = false, lostAt = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
  var hhmm = function (iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? '—' : d.toTimeString().slice(0, 8); };
  var fmtDur = function (sec) { if (sec == null) return ''; if (sec < 60) return sec + 's'; if (sec < 3600) return Math.floor(sec/60) + 'm ' + (sec%60) + 's'; return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm'; };
  var nowMs = function () { return connected ? Date.now() : (lostAt || Date.now()); };
  var since = function (iso) { if (!iso) return null; var ms = nowMs() - Date.parse(iso); return isNaN(ms) ? null : Math.max(0, Math.round(ms/1000)); };
  var fmtTok = function (n) { if (n == null) return '—'; return n >= 1e6 ? (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n/1e3) + 'k' : String(n); };

  function render() {
    if (!snap) return;
    renderMeta();
    renderNow();
    renderBacklogCard();
    renderAgentsCard();
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

  function renderNow() {
    var now = '';
    var s = snap.state, p = snap.progress;
    if (!s) {
      now = '<div class="empty">No workflow in flight<br><code>watching ' + esc(snap.projectDir) + '/.constellation/</code></div>';
    } else {
      var head = '<div class="meta mb12">'
        + '<span class="chip">' + esc(p.track) + (p.n != null ? ' ' + p.n + '/' + p.N : '') + '</span>'
        + (s.branch ? '<span><code>' + esc(s.branch) + '</code></span>' : '')
        + (s.task ? '<span>task <code>' + esc(s.task) + '</code></span>' : '')
        + '</div>';
      var strip = '<div class="strip">';
      p.steps.forEach(function (st) {
        strip += '<div class="step ' + st.state + '"><div class="e">' + esc(st.emoji || '⚙️') + '</div><div class="l">' + esc(st.label || st.id) + '</div></div>';
      });
      if (p.unknownCurrent) strip += '<div class="step current"><div class="e">⚙️</div><div class="l">' + esc(p.unknownCurrent) + '</div></div>';
      if (!p.steps.length && !p.unknownCurrent) strip += '<div class="empty">track <code>' + esc(p.track) + '</code> has no steps in tracks.json</div>';
      strip += '</div>';
      var mods = p.modifiers.length ? '<div class="mods">' + p.modifiers.map(function (m) { return '<span class="chip">' + esc(m) + '</span>'; }).join('') + '</div>' : '';
      var facts = '<div class="facts">'
        + '<div class="fact"><div class="k">elapsed</div><div class="v">' + sinceSpan(s.startedAt, '', fmtDur(since(s.startedAt)) || '—') + '</div></div>'
        + fact('last save', hhmm(s.lastUpdatedAt))
        + fact('tokens spent', fmtTok(snap.tokenDelta))
        + fact('review loops', s.reviewLoopCount != null ? s.reviewLoopCount : '—')
        + fact('PR', s.prNumber != null ? '#' + s.prNumber : '—')
        + fact('model profile', s.modelProfile || '—')
        + '</div>';
      now = head + strip + mods + facts;
    }
    if (snap.errors && snap.errors.length) now += '<div class="errs">' + snap.errors.map(esc).join('<br>') + '</div>';
    document.getElementById('now').innerHTML = now;
  }

  function renderBacklogCard() {
    var open = [];
    document.querySelectorAll('#backlog details[open]').forEach(function (d) { open.push(d.getAttribute('data-group')); });
    var backlog = document.getElementById('backlog');
    backlog.innerHTML = renderBacklog(snap.tree, esc);
    backlog.querySelectorAll('details').forEach(function (d) { if (open.indexOf(d.getAttribute('data-group')) >= 0) d.setAttribute('open', ''); });
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

  function sinceSpan(iso, prefix, text) { return '<span data-since="' + esc(iso || '') + '" data-prefix="' + esc(prefix) + '">' + esc(text) + '</span>'; }
  function tick() {
    document.querySelectorAll('[data-since]').forEach(function (el) {
      var secs = since(el.getAttribute('data-since'));
      if (secs != null) el.textContent = el.getAttribute('data-prefix') + fmtDur(secs);
    });
  }
  function fact(k, v) { return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

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
    var target = ev.target;
    if (target && target.getAttribute && target.getAttribute('data-action') === 'show-all') { showAllAgents = true; render(); }
  });

  var es = new EventSource('/events');
  es.onopen = function () { connected = true; lostAt = null; render(); };
  es.onmessage = function (ev) { connected = true; lostAt = null; try { snap = JSON.parse(ev.data); render(); } catch (e) { /* ignore */ } };
  es.onerror = function () { connected = false; if (lostAt == null) lostAt = Date.now(); render(); };
  setInterval(tick, 1000);
})();
