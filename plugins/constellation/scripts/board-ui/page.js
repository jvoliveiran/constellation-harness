
(function () {
  var snap = null;
  var connected = false, lostAt = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
  var hhmm = function (iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? '—' : d.toTimeString().slice(0, 8); };
  var fmtDur = function (sec) { if (sec == null) return ''; if (sec < 60) return sec + 's'; if (sec < 3600) return Math.floor(sec/60) + 'm ' + (sec%60) + 's'; return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm'; };
  var nowMs = function () { return connected ? Date.now() : (lostAt || Date.now()); };
  var since = function (iso) { if (!iso) return null; var ms = nowMs() - Date.parse(iso); return isNaN(ms) ? null : Math.max(0, Math.round(ms/1000)); };
  var fmtTok = function (n) { if (n == null) return '—'; return n >= 1e6 ? (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n/1e3) + 'k' : String(n); };

  function render() {
    if (!snap) return;
    var meta = '<span><code>' + esc(snap.projectDir) + '</code></span>';
    if (!snap.initialized) meta += '<span class="badge warn">not initialized — no .constellation/config.json</span>';
    if (!snap.hasTracks) meta += '<span class="badge warn">tracks.json missing</span>';
    if (snap.stale) meta += '<span class="badge warn">stale — state file unreadable, showing last good</span>';
    if (!connected && lostAt) meta += '<span class="badge warn">disconnected since ' + hhmm(new Date(lostAt).toISOString()).slice(0, 5) + ' — showing last data</span>';
    meta += '<span>updated ' + hhmm(snap.at) + '</span>';
    document.getElementById('meta').innerHTML = meta;

    var now = '';
    var s = snap.state, p = snap.progress;
    if (!s) {
      now = '<div class="empty">No workflow in flight<br><code>watching ' + esc(snap.projectDir) + '/.constellation/</code></div>';
    } else {
      var head = '<div class="meta mb12">'
        + '<span class="badge">' + esc(p.track) + (p.n != null ? ' ' + p.n + '/' + p.N : '') + '</span>'
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
      var mods = p.modifiers.length ? '<div class="mods">' + p.modifiers.map(function (m) { return '<span class="badge">' + esc(m) + '</span>'; }).join('') + '</div>' : '';
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

    var open = [];
    document.querySelectorAll('#backlog details[open]').forEach(function (d) { open.push(d.getAttribute('data-group')); });
    var backlog = document.getElementById('backlog');
    backlog.innerHTML = renderBacklog(snap.tree, esc);
    backlog.querySelectorAll('details').forEach(function (d) { if (open.indexOf(d.getAttribute('data-group')) >= 0) d.setAttribute('open', ''); });

    var activity = snap.feed || [];
    var feed = '';
    if (!snap.agents.length && !activity.length) {
      feed = '<div class="empty">No events yet<br><code>.constellation/metrics/events.jsonl</code></div>';
    } else {
      feed += '<ul>';
      snap.agents.forEach(function (a) {
        var dur = a.running ? '<span class="dur run" data-since="' + esc(a.start) + '" data-prefix="running ">running ' + fmtDur(since(a.start)) + '</span>' : '<span class="dur">' + fmtDur(a.durationSec) + '</span>';
        feed += '<li><span class="t">' + hhmm(a.start) + '</span><span' + (a.running ? ' class="run"' : '') + '>' + esc((a.agent_type || 'agent').replace(/^constellation:/, '')) + '</span>' + dur + '</li>';
      });
      feed += '</ul>';
      if (activity.length) {
        feed += '<h2 class="mt16">Activity</h2><ul>';
        activity.forEach(function (e) {
          feed += '<li><span class="t">' + hhmm(e.ts) + '</span><span>' + feedText(e, esc) + '</span></li>';
        });
        feed += '</ul>';
      }
    }
    document.getElementById('feed').innerHTML = feed;
  }
  function sinceSpan(iso, prefix, text) { return '<span data-since="' + esc(iso || '') + '" data-prefix="' + esc(prefix) + '">' + esc(text) + '</span>'; }
  function tick() {
    document.querySelectorAll('[data-since]').forEach(function (el) {
      var secs = since(el.getAttribute('data-since'));
      if (secs != null) el.textContent = el.getAttribute('data-prefix') + fmtDur(secs);
    });
  }
  function fact(k, v) { return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

  var es = new EventSource('/events');
  es.onopen = function () { connected = true; lostAt = null; render(); };
  es.onmessage = function (ev) { connected = true; lostAt = null; try { snap = JSON.parse(ev.data); render(); } catch (e) { /* ignore */ } };
  es.onerror = function () { connected = false; if (lostAt == null) lostAt = Date.now(); render(); };
  setInterval(tick, 1000);
})();
