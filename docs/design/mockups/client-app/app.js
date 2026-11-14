/* Agent Store 桌面客户端原型：路由、界面、流程。所有引擎动作都是模拟，规则取自 INVENTORY.md 里列出的代码。 */
(function () {
  'use strict';
  var A = window.AS, S = A.state, I = window.AS_I18N;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var U = { menu: false, pc: false, loading: false, err: null, reveal: {}, lib: {}, period: '7', settingsTab: 'general', busy: {}, updMsg: '' };
  var R = { view: '', arg: '', q: {} };
  var D = null;

  function t(k) {
    var e = I[k]; if (!e) { (window.AS_MISSING = window.AS_MISSING || {})[k] = 1; return k; }
    var s = e[S.lang === 'en' ? 1 : 0];
    for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(arguments[i]);
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var P = {
    discover: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    skill: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    mcp: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.5 6h7M7 8.3l4 7.4M17 8.3l-4 7.4"/>',
    provider: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
    usage: '<path d="M5 20V11M11 20V5M17 20v-7M2 20h20"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9Z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    sync: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    ext: '<path d="M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5"/>',
    warn: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    out: '<path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
    kbd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    github: '<path d="M9 19c-4 1.2-4-2-6-2.5M15 21v-3.2a2.8 2.8 0 0 0-.8-2.2c2.700-.3 5.500-1.300 5.500-6a4.600 4.600 0 0 0-1.300-3.200 4.300 4.300 0 0 0-.1-3.200s-1-.3-3.400 1.300a11.700 11.700 0 0 0-6 0C6.500 2.900 5.500 3.200 5.500 3.200a4.300 4.300 0 0 0-.1 3.200A4.600 4.600 0 0 0 4 9.600c0 4.700 2.800 5.700 5.500 6a2.800 2.800 0 0 0-.8 2.200V21"/>',
    google: '<path d="M20.500 12.200c0-.6-.1-1.200-.2-1.700H12v3.300h4.800a4.100 4.100 0 0 1-1.800 2.700"/><path d="M15 16.500A5.500 5.500 0 1 1 15.800 8l2.300-2.300A8.700 8.700 0 1 0 12 20.700c2.400 0 4.400-.8 5.800-2.100"/>',
    wmin: '<path d="M5 12h14"/>', wmax: '<rect x="5" y="5" width="14" height="14"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>'; }
  function fmt(n) {
    if (n == null) return '—';
    if (S.lang === 'en') return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, '') + ' 万';
    return String(n);
  }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function ver(v) { return !v || v === '—' ? '—' : /^\d+(\.\d+)+/.test(v) ? 'v' + v : v; }
  function agentName(id) { return A.AGENTS.filter(function (a) { return a.id === id; })[0].name; }
  function nameOf(e) { var it = A.item(e.id); return e.kind === 'provider' ? (e.cfg && e.cfg.name) || (it && it.name) || e.slug : (it && it.name) || e.name || e.slug; }
  function mask(v) { return v ? v.slice(0, 6) + '••••••••' + v.slice(-4) : ''; }
  function ofKind(k) { return S.installed.filter(function (e) { return e.kind === k; }); }
  function updates() { return S.installed.filter(function (e) { return e.latest; }); }
  /* 项目级的技能目录和 MCP 配置文件，路径相对项目根。 */
  var PDIR = { claude: '.claude/skills', codex: '.agents/skills' }, PMCP = { claude: '.mcp.json', codex: '.codex/config.toml' }, PKEY = { claude: 'mcpServers', codex: 'mcp_servers' };
  function joinNames(a) { return a.join(S.lang === 'en' ? ', ' : '、'); }
  function projNeeds(x) { var it = A.item(x.id); return x.kind !== 'mcp' ? [] : x.needs || (it ? A.needs(it).map(function (n) { return n.key; }) : []); }
  function projMiss(x) { return projNeeds(x).some(function (k) { return !(x.vars || {})[k]; }); }
  function projOver(x) { return x.kind !== 'mcp' ? null : S.installed.filter(function (e) { return e.kind === 'mcp' && e.slug === x.key; })[0] || null; }
  function projKey(it) { return it.kind === 'skill' ? it.name : slugFor(it); }
  function projHas(p, it) { return p.items.filter(function (x) { return x.id === it.id; })[0] || null; }
  function intoProj() { var p = R.q.into && A.project(R.q.into); return p && !p.missing ? p : null; }

  /* ---------- 路由 ---------- */
  function parse() {
    var h = location.hash.replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
    if (qi > -1) { new URLSearchParams(h.slice(qi + 1)).forEach(function (v, k) { q[k] = v; }); h = h.slice(0, qi); }
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { view: parts[0] || '', arg: parts.slice(1).join('/'), q: q };
  }
  function href(view, arg, q) {
    var s = '#/' + view + (arg ? '/' + encodeURIComponent(arg) : '');
    var qs = new URLSearchParams(q || {}).toString();
    return s + (qs ? '?' + qs : '');
  }
  function go(view, arg, q) { var h = href(view, arg, q); if (location.hash === h) render(); else location.hash = h; }
  function keepQ() { var q = {}; ['q', 'kind', 'sort', 'into'].forEach(function (k) { if (R.q[k]) q[k] = R.q[k]; }); return q; }
  function libHref(e) { return href(e.kind === 'skill' ? 'skills' : e.kind === 'mcp' ? 'mcp' : 'providers', e.slug); }

  /* ---------- 提示与记录 ---------- */
  function toast(msg, opt) {
    opt = opt || {};
    var el = document.createElement('div');
    el.className = 'toast' + (opt.err ? ' er' : '');
    el.innerHTML = ic(opt.err ? 'warn' : 'check') + '<span>' + esc(msg) + '</span>' + (opt.act ? '<button type="button">' + esc(opt.act) + '</button>' : '');
    if (opt.act) el.querySelector('button').onclick = function () { opt.run(); el.remove(); };
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, opt.act ? 6000 : 3200);
  }
  function log(line, cls) { S.log.push([line, cls || '']); if (S.log.length > 60) S.log.shift(); A.save(); renderSb(); }
  function copy(text) {
    var done = function () { toast(t('copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(t('copy.fail'), { err: true }); });
    else toast(t('copy.fail'), { err: true });
  }
  function ext(url) { toast(t('ext.open', url.replace(/^https?:\/\//, ''))); }

  /* ---------- 窗口 ---------- */
  function fit() {
    var vw = innerWidth, vh = innerHeight, w, h;
    if (S.size === 'full') { w = 1200; h = 764; }
    else if (S.size === 'narrow') { w = 900; h = 640; }
    else { w = Math.max(860, Math.min(1200, vw - 32)); h = Math.max(560, Math.min(764, vh - 32)); }
    var k = Math.min(1, (vw - 16) / w, (vh - 16) / h), app = $('#app');
    app.style.width = w + 'px'; app.style.height = h + 'px';
    app.style.transform = k < 1 ? 'scale(' + k.toFixed(4) + ')' : '';
  }

  function renderTb() {
    var mac = S.platform === 'mac';
    var mod = mac ? '⌘' : 'Ctrl';
    var brand = '<div class="tb-brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span>Agent Store</span></div>';
    var lights = '<div class="tb-lights">' + ['close', 'min', 'max'].map(function (k) { return '<button type="button" data-act="win" aria-label="' + t('win.' + k) + '" title="' + t('win.' + k) + '"></button>'; }).join('') + '</div>';
    var ctl = '<div class="tb-win">' + [['min', 'wmin'], ['max', 'wmax'], ['close', 'x']].map(function (k) { return '<button type="button" data-act="win" aria-label="' + t('win.' + k[0]) + '" title="' + t('win.' + k[0]) + '">' + ic(k[1]) + '</button>'; }).join('') + '</div>';
    var search = '<button type="button" class="tb-search" data-act="palette">' + ic('search') + '<span>' + t('tb.search') + '</span><kbd class="kbd">' + mod + ' K</kbd></button>';
    var tb = $('#tb'); tb.dataset.platform = S.platform;
    tb.innerHTML = (mac ? lights : '') + brand + search + (mac ? '' : ctl);
  }

  function renderSide() {
    var up = updates();
    function nav(view, icon, kind, n) {
      var cur = R.view === view;
      var dot = kind && up.some(function (e) { return e.kind === kind; });
      return '<a class="nav-i" href="' + href(view) + '"' + (kind ? ' data-kind="' + kind + '"' : '') + (cur ? ' aria-current="page"' : '') + ' title="' + t('nav.' + view) + '">' + ic(icon) + '<span class="lbl">' + t('nav.' + view) + '</span>' + (n != null ? '<span class="n">' + n + '</span>' : '') + (dot ? '<span class="dot" title="' + t('upd.available') + '"></span>' : '') + '</a>';
    }
    var who = S.signedIn ? 'lin@example.com' : t('acct.out');
    var html = nav('discover', 'discover') +
      '<div class="side-h">' + t('nav.local') + '</div>' +
      nav('skills', 'skill', 'skill', ofKind('skill').length) + nav('mcp', 'mcp', 'mcp', ofKind('mcp').length) + nav('providers', 'provider', 'provider', ofKind('provider').length) +
      nav('usage', 'usage') +
      '<a class="side-h" href="' + href('projects') + '">' + t('nav.projects') + '</a>' +
      '<a class="nav-i nav-n" href="' + href('projects') + '"' + (/^projects?$/.test(R.view) ? ' aria-current="page"' : '') + ' title="' + t('nav.projects') + '" aria-label="' + t('nav.projects') + '">' + ic('folder') + '</a>' +
      '<div class="side-pj">' + S.projects.map(function (p) {
        return '<a class="nav-i" href="' + href('project', p.id) + '"' + (R.view === 'project' && R.arg === p.id ? ' aria-current="page"' : '') + ' title="' + esc(p.path) + '">' + ic('folder') + '<span class="lbl">' + esc(p.name) + '</span>' + (p.missing ? '<span class="n warn" title="' + t('pj.missing.chip') + '">' + ic('warn') + '<span class="sr">' + t('pj.missing.chip') + '</span></span>' : '<span class="n">' + p.items.length + '</span>') + '</a>';
      }).join('') + '</div>' +
      '<button type="button" class="nav-i nav-add" data-act="pj-new">' + ic('plus') + '<span class="lbl">' + t('pj.add') + '</span></button>' +
      '<div class="side-foot">' + nav('settings', 'settings') +
      '<a class="relay-mini" href="' + href('providers') + '" title="' + t('relay.title') + '"><i class="pulse' + (S.relay ? ' on' : '') + '"></i><span>' + t(S.relay ? 'relay.on.short' : 'relay.off.short') + '</span></a>' +
      '<button type="button" class="acct" data-act="menu" aria-haspopup="menu" aria-expanded="' + U.menu + '" title="' + esc(who) + '"><span class="avatar' + (S.signedIn ? ' in' : '') + '">' + (S.signedIn ? 'L' : ic('user')) + '</span><span class="acct-t"><b>' + esc(who) + '</b><small>' + (S.signedIn ? (A.isPro() ? 'Pro' : 'Free') : t('acct.out.sub')) + '</small></span></button></div>';
    if (U.menu) {
      html += '<div class="menu acct-menu" role="menu">' + (S.signedIn
        ? '<div class="who"><b>lin@example.com</b>' + t(A.isPro() ? 'plan.pro.line' : 'plan.free.line') + '</div><div class="sep"></div>' +
          (A.isPro() ? '<button type="button" role="menuitem" data-act="manage">' + ic('ext') + t('acct.manage') + '</button>' : '<button type="button" role="menuitem" data-act="upgrade">' + ic('bolt') + t('acct.upgrade') + '</button>') +
          '<a role="menuitem" href="' + href('settings', 'account') + '">' + ic('user') + t('acct.settings') + '</a><div class="sep"></div><button type="button" role="menuitem" data-act="signout">' + ic('out') + t('acct.signout') + '</button>'
        : '<div class="who">' + t('acct.out.hint') + '</div><div class="sep"></div><button type="button" role="menuitem" data-act="signin">' + ic('user') + t('acct.signin') + '</button><a role="menuitem" href="' + href('settings', 'account') + '">' + ic('settings') + t('acct.settings') + '</a>') + '</div>';
    }
    $('#side').innerHTML = html;
  }

  function renderSb() {
    var last = S.log[S.log.length - 1];
    $('#sb').innerHTML = '<button type="button" data-act="dlg" data-arg="activity" title="' + t('log.title') + '" style="flex:1">' + ic('term').replace('<svg', '<svg width="13" height="13"') + '<span class="last ' + (last ? last[1] : '') + '">' + esc(last ? last[0] : t('log.none')) + '</span></button>' +
      '<span><i class="d' + (S.offline ? ' off' : '') + '"></i> ' + t(S.offline ? 'sb.offline' : 'sb.online') + '</span><span>v0.2.2</span>';
  }

  /* ---------- 通用片段 ---------- */
  function tile(kind, cls) { return '<span class="tile ' + (cls || '') + '" data-kind="' + kind + '">' + ic(kind) + '</span>'; }
  function banner(kind, body, extra) { return '<div class="banner ' + (kind || '') + '" role="' + (kind === 'err' ? 'alert' : 'status') + '">' + ic(kind === 'info' ? 'info' : 'warn') + '<div class="sp">' + body + (extra || '') + '</div></div>'; }
  function empty(kind, title, body, btn) { return '<div class="empty">' + tile(kind, 'lg') + '<b>' + title + '</b><p>' + body + '</p>' + (btn || '') + '</div>'; }
  function skeleton(n) { var s = ''; for (var i = 0; i < n; i++) s += '<div class="row"><span class="sk" style="width:36px;height:36px;border-radius:10px"></span><div class="row-t"><span class="sk" style="width:' + (30 + (i * 13) % 30) + '%;height:12px"></span><span class="sk" style="width:' + (55 + (i * 17) % 35) + '%;height:10px;margin-top:8px"></span></div><span class="sk" style="width:58px;height:26px"></span></div>'; return '<div class="list" aria-busy="true" aria-label="' + t('loading') + '">' + s + '</div>'; }
  function codeBlock(text, kind) { return '<div class="code"' + (kind ? ' data-kind="' + kind + '"' : '') + '><span class="p">$</span> ' + esc(text) + '<button type="button" class="btn btn-sm btn-ic cp" data-act="copy" data-arg="' + esc(text) + '" aria-label="' + t('copy') + '" title="' + t('copy') + '">' + ic('copy') + '</button></div>'; }
  function trChip(it) {
    var tr = A.transport(it); if (!tr) return '';
    return '<span class="chip" title="' + esc(tr.text) + '">' + (tr.remote ? t(tr.type === 'sse' ? 'tr.sse' : 'tr.http') : tr.type) + '</span>';
  }
  function pro() { return '<span class="chip pro">Pro</span>'; }
  function gate(key) { return '<div class="gate"><b>' + ic('lock').replace('<svg', '<svg width="15" height="15"') + t('pro.' + key + '.t') + ' ' + pro() + '</b><p>' + t('pro.' + key + '.d') + '</p><button type="button" class="btn btn-sm" data-act="upgrade">' + t('acct.upgrade') + ' ' + ic('ext') + '</button></div>'; }

  /* 某项在某个 agent 上的开关 */
  function agentSwitch(e, a, kind) {
    var it = A.item(e.id), on = !!e.on[a.id], why = '';
    if (!A.detected(a.id)) why = t('ag.missing', a.name);
    else if (!on) { var b = A.blocker(it, a.id, e.cfg); if (b === 'incompatible') why = t('err.incompatible', a.name); else if (b === 'sse') why = t('err.codexSse'); }
    var busy = U.busy[e.slug + a.id];
    return '<button type="button" class="sw' + (busy ? ' busy' : '') + '" role="switch" aria-checked="' + on + '" data-kind="' + kind + '" data-act="toggle" data-arg="' + esc(e.slug) + '|' + a.id + '"' + (why ? ' disabled title="' + esc(why) + '"' : ' title="' + esc(t(on ? 'sw.off' : 'sw.on', a.name)) + '"') + ' aria-label="' + esc(a.name + ' · ' + nameOf(e)) + '"></button>';
  }

  /* ---------- 发现 ---------- */
  function catalog() {
    var q = (R.q.q || '').toLowerCase().trim(), kind = R.q.kind || '', sort = R.q.sort || '';
    var rows = AS_DATA.filter(function (it) {
      if (kind && it.kind !== kind) return false;
      if (!q) return true;
      return (it.name + ' ' + it.description + ' ' + (it.author || '')).toLowerCase().indexOf(q) > -1;
    });
    if (sort === 'installs') rows = rows.slice().sort(function (a, b) { return (b.installs || -1) - (a.installs || -1); });
    if (sort === 'updated') rows = rows.slice().sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
    if (S.offline) rows = rows.slice(0, 8);
    return rows;
  }
  function catRow(it) {
    var e = A.entryFor(it.id), sel = R.arg === it.id, btn, into = intoProj();
    if (into && it.kind !== 'provider') btn = projHas(into, it) ? '<a class="btn btn-sm" href="' + href('project', into.id) + '">' + t('pj.inproj') + '</a>' : '<button type="button" class="btn btn-sm btn-kind" data-act="install" data-arg="' + esc(it.id) + '">' + t('act.install') + '</button>';
    else if (it.kind === 'provider') btn = '<button type="button" class="btn btn-sm btn-kind" data-act="install" data-arg="' + esc(it.id) + '">' + t(e ? 'act.addcfg' : 'act.install') + '</button>';
    else if (e && e.latest) btn = '<button type="button" class="btn btn-sm btn-kind" data-act="update" data-arg="' + esc(e.slug) + '">' + t('act.update') + '</button>';
    else if (e) btn = '<a class="btn btn-sm" href="' + libHref(e) + '">' + t('act.manage') + '</a>';
    else btn = '<button type="button" class="btn btn-sm btn-kind" data-act="install" data-arg="' + esc(it.id) + '">' + t('act.install') + '</button>';
    return '<div class="row' + (sel ? ' sel' : '') + '" data-kind="' + it.kind + '"><a class="row-main" href="' + href('discover', it.id, keepQ()) + '">' + tile(it.kind) +
      '<div class="row-t"><b><span class="nm">' + esc(it.name) + '</span>' + (e && it.kind !== 'provider' ? '<span class="chip ok">' + ic('check') + t('st.installed') + '</span>' : '') + (e && e.latest ? '<span class="chip warn">' + t('upd.available') + '</span>' : '') + '</b><p>' + esc(it.author || t('unknown.author')) + ' · ' + esc(it.description) + '</p></div></a>' +
      '<div class="row-x"><span class="row-meta" title="' + t('f.installs') + '">' + (it.installs != null ? '↓ ' + fmt(it.installs) : it.stars != null ? '★ ' + fmt(it.stars) : '') + '</span>' + btn + '</div></div>';
  }
  function listHtml() {
    if (U.loading || R.q.state === 'loading') return skeleton(7);
    var rows = catalog();
    if (R.q.state === 'empty') rows = [];
    if (!rows.length) return empty(R.q.kind || 'mcp', t('disc.empty.t'), t('disc.empty.d'), '<button type="button" class="btn btn-sm" data-act="clearq">' + t('disc.clear') + '</button>');
    return '<div class="list" id="rows">' + rows.map(catRow).join('') + '</div>' +
      (S.offline ? '' : '<div class="more"><button type="button" class="btn btn-sm" data-act="more">' + t('disc.more') + '</button></div>');
  }
  function viewDiscover() {
    var k = R.q.kind || '', into = intoProj();
    var segs = [['', t('kind.all')], ['skill', t('kinds.skill')], ['mcp', 'MCP'], ['provider', t('kinds.provider')]].map(function (x) {
      return '<button type="button" data-act="kind" data-arg="' + x[0] + '"' + (x[0] ? ' data-kind="' + x[0] + '"' : '') + ' aria-pressed="' + (k === x[0]) + '">' + x[1] + '</button>';
    }).join('');
    var sorts = [['', 'sort.default'], ['installs', 'sort.installs'], ['updated', 'sort.updated']].map(function (x) { return '<option value="' + x[0] + '"' + ((R.q.sort || '') === x[0] ? ' selected' : '') + '>' + t(x[1]) + '</option>'; }).join('');
    return '<div class="view"><div class="vh"><div><h1>' + t('disc.h') + '</h1><p class="sub">' + t('disc.sub', num(AS_CATALOG.mcp), num(AS_CATALOG.skill)) + '</p></div></div>' +
      (into ? banner('info', '<b>' + t('pj.into.t', esc(into.name)) + '</b><p>' + t('pj.into.d') + '</p>', '<div class="acts"><a class="btn btn-sm" href="' + href('project', into.id) + '">' + t('pj.into.back') + '</a><button type="button" class="btn btn-sm" data-act="pj-into-clear">' + t('pj.into.clear') + '</button></div>') : '') +
      (S.offline ? banner('', '<b>' + t('off.t') + '</b><p>' + t('off.d') + '</p>', '<div class="acts"><button type="button" class="btn btn-sm" data-act="retry">' + t('off.retry') + '</button></div>') : '') +
      (R.q.state === 'error' ? banner('err', '<b>' + t('err.catalog.t') + '</b><p>' + t('err.catalog.d') + '</p>', '<div class="acts"><button type="button" class="btn btn-sm" data-act="retry">' + t('off.retry') + '</button></div>') : '') +
      '<div class="bar"><div class="field">' + ic('search') + '<input class="inp" id="q" type="search" autocomplete="off" spellcheck="false" placeholder="' + t('disc.ph') + '" aria-label="' + t('disc.ph') + '" value="' + esc(R.q.q || '') + '"></div>' +
      '<div class="seg" role="group" aria-label="' + t('disc.kind') + '">' + segs + '</div><select class="inp" id="sort" aria-label="' + t('sort.label') + '">' + sorts + '</select></div>' +
      '<div id="list">' + listHtml() + '</div></div>';
  }

  /* ---------- 详情栏：目录条目 ---------- */
  function writes(it, slug, lp, tg) {
    var out = [];
    if (lp && it.kind === 'skill') A.AGENTS.forEach(function (a) { if (!tg || tg[a.id]) out.push(t('p.mcp.write') + ' ' + lp.path + '/' + PDIR[a.id] + '/' + it.name); });
    else if (lp && it.kind === 'mcp') { var ptr = A.transport(it); out.push((ptr.remote ? t('w.mcp.connect') : t('w.mcp.run')) + ' ' + ptr.text); A.AGENTS.forEach(function (a) { if (!tg || tg[a.id]) out.push(t('p.mcp.write') + ' ' + lp.path + '/' + PMCP[a.id]); }); if (!tg || tg.claude) A.needs(it).forEach(function (n) { out.push(t('w.pj.ref') + ' ${' + n.key + '}'); }); }
    else if (it.kind === 'skill') { out.push(t('w.skill.fetch') + ' ~/.agent-store/skills/' + slug); out.push(t('w.skill.link')); }
    else if (it.kind === 'mcp') { var tr = A.transport(it); out.push((tr.remote ? t('w.mcp.connect') : t('w.mcp.run')) + ' ' + tr.text); A.needs(it).forEach(function (n) { out.push(t('w.mcp.needs') + ' ' + n.key); }); out.push(t('w.mcp.write')); }
    else out.push(it.id === 'builtin:local' ? t('w.prov.local') : t('w.prov.preset'));
    return out;
  }
  function slugFor(it) {
    var s;
    if (it.kind === 'skill') { var p = it.id.replace('github:', '').split('/'); s = p[1] + '-' + p[p.length - 1]; }
    else if (it.kind === 'mcp') s = String(it.mcpName || it.name).toLowerCase();
    else { s = it.id.replace('builtin:', ''); var n = 1, base = s; while (A.entry(s)) s = base + '-' + (++n); }
    return s.replace(/[^a-z0-9-]+/g, '-');
  }
  function paneCatalog(it) {
    var e = A.entryFor(it.id), fav = S.favs.indexOf(it.id) > -1, tr = A.transport(it), nd = A.needs(it), act, into = intoProj();
    if (into && it.kind !== 'provider') act = projHas(into, it) ? '<span class="chip ok">' + ic('check') + t('pj.inproj.chip') + '</span><a class="btn" href="' + href('project', into.id) + '">' + t('pj.open') + '</a>' : '<button type="button" class="btn btn-pri" data-act="install" data-arg="' + esc(it.id) + '">' + t('pj.into.install', esc(into.name)) + '</button>';
    else if (it.kind === 'provider') act = '<button type="button" class="btn btn-pri" data-act="install" data-arg="' + esc(it.id) + '">' + t(e ? 'act.addcfg' : 'act.install') + '</button>' + (e ? '<a class="btn" href="' + libHref(e) + '">' + t('act.manage') + '</a>' : '');
    else if (e) act = '<span class="chip ok">' + ic('check') + t('st.installed') + '</span><a class="btn" href="' + libHref(e) + '">' + t('act.manage') + '</a>' + (e.latest ? '<button type="button" class="btn btn-kind" data-act="update" data-arg="' + esc(e.slug) + '">' + t('act.update.to', ver(e.latest)) + '</button>' : '');
    else act = '<button type="button" class="btn btn-pri" data-act="install" data-arg="' + esc(it.id) + '">' + t('act.install') + '</button>';
    var facts = [[t('f.kind'), '<span class="kind">' + t('kind.' + it.kind) + '</span>']];
    if (tr) facts.push([t('f.transport'), (tr.remote ? t(tr.type === 'sse' ? 'tr.sse.long' : 'tr.http.long') : t('tr.local', tr.type)) + '<br><code class="mono" style="font-size:11.5px;color:var(--fg2)">' + esc(tr.text) + '</code>']);
    if (nd.length) facts.push([t('f.needs'), nd.map(function (n) { return '<code class="mono" style="font-size:11.5px">' + esc(n.key) + '</code>'; }).join(', ')]);
    var comp = A.AGENTS.filter(function (a) { return !A.blocker(it, a.id, { apiKey: 1 }) || A.blocker(it, a.id, {}) === 'needs-config' || A.blocker(it, a.id, {}) === 'no-key'; }).map(function (a) { return a.name; });
    facts.push([t('f.agents'), comp.join(S.lang === 'en' ? ', ' : '、') + (it.sse ? '<br><span style="color:var(--fg3)">' + t('err.codexSse') + '</span>' : '')]);
    facts.push([t('f.version'), '<span class="mono" style="font-size:12px">' + esc(ver(it.version)) + '</span>']);
    if (it.updated) facts.push([t('f.updated'), it.updated]);
    if (it.installs != null) facts.push([t('f.installs'), fmt(it.installs)]);
    if (it.stars != null) facts.push([t('f.stars'), fmt(it.stars)]);
    facts.push([t('f.source'), it.home ? '<button type="button" class="lnk" data-act="ext" data-arg="' + esc(it.home) + '">' + esc(it.home.replace(/^https?:\/\//, '')) + '</button>' : t('f.builtin')]);
    return '<div class="pane-top"><span>' + esc(it.id) + '</span><a class="btn btn-sm btn-ic" href="' + href('discover', '', keepQ()) + '" aria-label="' + t('close') + '" title="' + t('close') + ' (Esc)">' + ic('x') + '</a></div>' +
      '<div class="pane-body" data-kind="' + it.kind + '"><div class="ph">' + tile(it.kind, 'lg') + '<div><h2>' + esc(it.name) + '</h2><div class="by">' + esc(it.author || t('unknown.author')) + '</div></div></div>' +
      '<p class="desc">' + esc(it.description) + '</p>' +
      '<div class="acts">' + act + '<button type="button" class="btn btn-ic" data-act="fav" data-arg="' + esc(it.id) + '" aria-pressed="' + fav + '" aria-label="' + t(fav ? 'fav.off' : 'fav.on') + '" title="' + t(fav ? 'fav.off' : 'fav.on') + '">' + ic('heart') + '</button><button type="button" class="btn btn-ic" data-act="storepage" data-arg="' + esc(it.id) + '" aria-label="' + t('act.storepage') + '" title="' + t('act.storepage') + '">' + ic('ext') + '</button></div>' +
      (U.err && U.err.slug === it.id ? '<div style="margin-top:12px">' + errBanner() + '</div>' : '') +
      '<div class="sec"><h3>' + t('sec.facts') + '</h3><dl class="facts">' + facts.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>'; }).join('') + '</dl></div>' +
      '<div class="sec"><h3>' + t('sec.writes') + '</h3><ul class="steps">' + writes(it, slugFor(it)).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="sec"><h3>' + t('sec.cli') + '</h3>' + codeBlock('aas install ' + it.id, it.kind) + '</div>' +
      (it.readme ? '<div class="sec"><h3>' + t('sec.readme') + '</h3><div class="readme">' + esc(it.readme.slice(0, 900)) + '</div><p style="margin-top:8px"><button type="button" class="lnk" data-act="storepage" data-arg="' + esc(it.id) + '">' + t('readme.more') + '</button></p></div>' : '') + '</div>';
  }
  function errBanner() {
    var x = U.err;
    return banner('err', '<b>' + esc(x.lead) + '</b><p>' + esc(x.msg) + '</p>' + (x.detail ? '<details><summary>' + t('err.details') + '</summary><code class="mono">' + esc(x.detail) + '</code></details>' : ''),
      '<div class="acts">' + (x.force ? '<button type="button" class="btn btn-sm btn-bad" data-act="force" data-arg="' + esc(x.force) + '">' + esc(x.forceLabel) + '</button>' : '') + '<button type="button" class="btn btn-sm" data-act="dismiss">' + t('close') + '</button></div>');
  }

  /* ---------- 技能库与 MCP 列表 ---------- */
  function soonChip() { return '<span class="chip dash" title="' + t('ag.soon.d') + '">' + ic('plus') + t('ag.soon') + '</span>'; }
  function viewLib(kind) {
    var view = kind === 'skill' ? 'skills' : 'mcp', all = ofKind(kind), f = U.lib[kind] || (U.lib[kind] = { q: '', f: 'all' });
    var up = all.filter(function (e) { return e.latest; });
    var head = '<div class="vh"><div><h1>' + t('lib.' + kind + '.h') + '</h1><p class="sub">' + t('lib.' + kind + '.sub') + '</p></div><span class="sp"></span>' +
      '<button type="button" class="btn btn-sm" data-act="check">' + ic('sync') + t('upd.check') + '</button>' +
      (up.length ? '<button type="button" class="btn btn-sm btn-kind" data-kind="' + kind + '" data-act="updateall" data-arg="' + kind + '">' + t('upd.all', up.length) + '</button>' : '') +
      '<a class="btn btn-sm" href="' + href('discover', '', { kind: kind }) + '">' + ic('plus') + t('lib.add') + '</a></div>' +
      '<p class="pj-hint">' + ic('folder') + '<span>' + t('lib.global.hint') + '</span><a class="lnk" href="' + href('projects') + '">' + t('lib.global.go') + '</a></p>';
    if (R.q.state === 'loading') return '<div class="view">' + head + skeleton(5) + '</div>';
    if (!all.length || R.q.state === 'empty') return '<div class="view">' + head + empty(kind, t('lib.' + kind + '.empty.t'), t('lib.' + kind + '.empty.d'), '<a class="btn btn-pri" href="' + href('discover', '', { kind: kind }) + '">' + t('lib.browse.' + kind) + '</a>') + '</div>';
    var rows = all.filter(function (e) {
      if (f.q && (nameOf(e) + ' ' + e.slug).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
      var any = e.on.claude || e.on.codex;
      return f.f === 'all' || (f.f === 'on' && any) || (f.f === 'off' && !any) || (f.f === 'upd' && e.latest);
    });
    var segs = ['all', 'on', 'off', 'upd'].map(function (k) { return '<button type="button" data-act="libf" data-arg="' + kind + '|' + k + '" aria-pressed="' + (f.f === k) + '">' + t('lib.f.' + k) + (k === 'upd' && up.length ? ' <small>' + up.length + '</small>' : '') + '</button>'; }).join('');
    var cols = '<div class="cols-h"><span class="sp">' + t('lib.count', rows.length, all.length) + '</span>' + A.AGENTS.map(function (a) { return '<span class="col-ag h">' + a.name + '</span>'; }).join('') + '<span class="col-act">' + soonChip() + '</span></div>';
    var list = rows.map(function (e) {
      var it = A.item(e.id), sub, chips = '';
      if (kind === 'skill') sub = '~/.agent-store/skills/' + e.slug;
      else { var tr = A.transport(it); sub = tr ? tr.text : ''; }
      if (e.latest) chips += '<span class="chip warn">' + t('upd.available') + '</span>';
      if (kind === 'mcp' && A.needs(it).some(function (n) { return !(e.cfg || {})[n.key]; })) chips += '<span class="chip warn">' + t('st.needscfg') + '</span>';
      if (e.migrated) chips += '<span class="chip">' + t('st.migrated') + '</span>';
      if (!e.on.claude && !e.on.codex) chips += '<span class="chip">' + t('st.off') + '</span>';
      return '<div class="row' + (R.arg === e.slug ? ' sel' : '') + '" data-kind="' + kind + '"><a class="row-main" href="' + href(view, e.slug) + '">' + tile(kind) +
        '<div class="row-t"><b><span class="nm">' + esc(nameOf(e)) + '</span>' + (kind === 'mcp' ? trChip(it) : '') + chips + '</b><p class="mono" style="font-size:11.5px">' + esc(sub) + '</p></div></a>' +
        '<div class="row-x">' + A.AGENTS.map(function (a) { return '<span class="col-ag">' + agentSwitch(e, a, kind) + '</span>'; }).join('') +
        '<span class="col-act">' + (e.latest ? '<button type="button" class="btn btn-sm btn-kind" data-act="update" data-arg="' + esc(e.slug) + '">' + t('act.update') + '</button>' : '<span class="row-meta" style="display:block">' + esc(ver(e.version)) + '</span>') + '</span></div></div>';
    }).join('');
    return '<div class="view">' + head +
      '<div class="bar"><div class="field">' + ic('search') + '<input class="inp" id="lq" data-kind="' + kind + '" type="search" autocomplete="off" placeholder="' + t('lib.ph') + '" aria-label="' + t('lib.ph') + '" value="' + esc(f.q) + '"></div><div class="seg" role="group" aria-label="' + t('lib.filter') + '">' + segs + '</div></div>' +
      cols + (rows.length ? '<div class="list" id="rows">' + list + '</div>' : empty(kind, t('lib.nomatch.t'), t('lib.nomatch.d'), '<button type="button" class="btn btn-sm" data-act="libclear" data-arg="' + kind + '">' + t('disc.clear') + '</button>')) + '</div>';
  }

  /* ---------- 详情栏：已安装 ---------- */
  function agentRows(e, sub) {
    return '<div class="ag">' + A.AGENTS.map(function (a) {
      var det = A.detected(a.id), line = det ? sub(a, !!e.on[a.id]) : [t('ag.missing', a.name), ''];
      return '<div class="ag-r"><span class="ag-ic" style="color:' + a.color + '">' + a.mark + '</span><div class="ag-t"><b>' + a.name + (det ? '' : ' <span class="chip">' + t('ag.notfound') + '</span>') + '</b><small class="' + (line[1] || '') + '">' + esc(line[0]) + '</small></div>' + agentSwitch(e, a, e.kind) + '</div>';
    }).join('') + '<div class="ag-r soon"><span class="ag-ic soon">' + '+' + '</span><div class="ag-t"><b>' + t('ag.soon') + '</b><small>' + t('ag.soon.d') + '</small></div></div></div>';
  }
  function paneTop(e) {
    var view = e.kind === 'skill' ? 'skills' : e.kind === 'mcp' ? 'mcp' : 'providers';
    return '<div class="pane-top"><span>' + esc(e.slug) + '</span><span class="saved" id="saved">' + ic('check').replace('<svg', '<svg width="11" height="11" style="display:inline;vertical-align:-1px"') + ' ' + t('cfg.saved') + '</span><a class="btn btn-sm btn-ic" href="' + href(view) + '" aria-label="' + t('close') + '" title="' + t('close') + ' (Esc)">' + ic('x') + '</a></div>';
  }
  function secret(e, key, ph, id) {
    var show = U.reveal[e.slug + key], v = (e.cfg || {})[key] || '';
    return '<div class="fld-row"><input class="inp mono" id="' + id + '" type="' + (show ? 'text' : 'password') + '" autocomplete="off" spellcheck="false" data-cfg="' + esc(e.slug) + '|' + esc(key) + '" value="' + esc(v) + '" placeholder="' + esc(ph) + '"><button type="button" class="btn btn-ic" data-act="reveal" data-arg="' + esc(e.slug) + '|' + esc(key) + '" aria-pressed="' + !!show + '" aria-label="' + t(show ? 'cfg.hide' : 'cfg.show') + '" title="' + t(show ? 'cfg.hide' : 'cfg.show') + '" style="color:inherit;border-color:var(--line-strong)">' + ic('eye') + '</button></div>';
  }
  function textFld(e, key, label, ph, hint, attrs) {
    return '<div class="fld"><label for="f-' + key + '">' + label + '</label><input class="inp' + (/url|path|header/i.test(key) ? ' mono' : '') + '" id="f-' + key + '" autocomplete="off" spellcheck="false" data-cfg="' + esc(e.slug) + '|' + key + '" value="' + esc((e.cfg || {})[key] == null ? '' : e.cfg[key]) + '" placeholder="' + esc(ph || '') + '"' + (attrs || '') + '>' + (hint ? '<p class="hint">' + hint + '</p>' : '') + '</div>';
  }
  function selFld(e, key, label, opts, hint) {
    var v = (e.cfg || {})[key];
    return '<div class="fld"><label for="f-' + key + '">' + label + '</label><select class="inp" style="width:100%" id="f-' + key + '" data-cfg="' + esc(e.slug) + '|' + key + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v == null ? opts[0][0] : v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + (hint ? '<p class="hint">' + hint + '</p>' : '') + '</div>';
  }
  function dangerSec(e, label) { return '<div class="sec"><button type="button" class="btn btn-bad" data-act="uninstall" data-arg="' + esc(e.slug) + '">' + ic('trash') + label + '</button></div>'; }
  function versionSec(e, it) {
    var f = [[t('f.version'), '<span class="mono" style="font-size:12px">' + esc(ver(e.version)) + '</span>' + (e.latest ? ' → <span class="mono" style="font-size:12px;color:var(--warn)">' + esc(ver(e.latest)) + '</span>' : '')]];
    if (it) f.push([t('f.id'), '<span class="mono" style="font-size:11.5px">' + esc(it.id) + '</span>']);
    if (it && it.home) f.push([t('f.source'), '<button type="button" class="lnk" data-act="ext" data-arg="' + esc(it.home) + '">' + esc(it.home.replace(/^https?:\/\//, '')) + '</button>']);
    if (e.migrated) f.push([t('f.origin'), t('st.migrated.d')]);
    return '<div class="sec"><h3>' + t('sec.version') + '<span class="sp"></span>' + (it ? '<a class="lnk" href="' + href('discover', it.id) + '">' + t('act.incatalog') + '</a>' : '') + '</h3><dl class="facts">' + f.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>' +
      (e.latest ? '<div class="acts"><button type="button" class="btn btn-kind" data-act="update" data-arg="' + esc(e.slug) + '">' + t('act.update.to', ver(e.latest)) + '</button></div>' : '') + '</div>';
  }
  function paneHead(e, it, by) { return '<div class="ph">' + tile(e.kind, 'lg') + '<div><h2>' + esc(nameOf(e)) + '</h2><div class="by">' + by + '</div></div></div>' + (U.err && U.err.slug === e.slug ? '<div style="margin-top:12px">' + errBanner() + '</div>' : ''); }

  function paneSkill(e) {
    var it = A.item(e.id), path = '~/.agent-store/skills/' + e.slug;
    return paneTop(e) + '<div class="pane-body" data-kind="skill">' + paneHead(e, it, '<span class="kind">' + t('kind.skill') + '</span>' + esc(it ? it.author : t('unknown.author'))) +
      (it ? '<p class="desc">' + esc(it.description) + '</p>' : '') +
      '<div class="sec"><h3>' + t('sec.agents') + '</h3>' + agentRows(e, function (a, on) { return on ? [a.skills + '/' + e.deploy + '  →  ' + t('dep.link'), 'mono'] : [t('dep.none'), '']; }) + '</div>' +
      '<div class="sec"><h3>' + t('sec.libpath') + '</h3><div class="code" style="padding-right:76px">' + esc(path) + '<span class="cp" style="display:flex;gap:4px"><button type="button" class="btn btn-sm btn-ic" data-act="copy" data-arg="' + path + '" aria-label="' + t('copy') + '" title="' + t('copy') + '">' + ic('copy') + '</button><button type="button" class="btn btn-sm btn-ic" data-act="reveal-dir" data-arg="' + path + '" aria-label="' + t('act.showdir') + '" title="' + t('act.showdir') + '">' + ic('folder') + '</button></span></div><p class="fld" style="margin:6px 0 0"><span class="hint">' + t('lib.path.d') + '</span></p></div>' +
      versionSec(e, it) + dangerSec(e, t('act.uninstall')) + '</div>';
  }
  function paneMcp(e) {
    var it = A.item(e.id), nd = A.needs(it), tr = A.transport(it), miss = nd.some(function (n) { return !(e.cfg || {})[n.key]; });
    var warn = miss ? t('mcp.warn.cfg') : (!e.on.claude && !e.on.codex) ? t('mcp.warn.none') : '';
    var fields = nd.length ? nd.map(function (n) {
      return '<div class="fld"><label for="f-' + n.key + '">' + esc(n.key) + ' <span class="req" aria-label="' + t('cfg.required') + '">*</span></label>' + secret(e, n.key, n.key, 'f-' + n.key) + (n.bearer ? '<p class="hint">' + t('mcp.codexenv') + ' <code class="mono">export ' + esc(n.key) + '=…</code></p>' : '') + '</div>';
    }).join('') : '<p style="color:var(--fg3);font-size:12.5px">' + t('mcp.nocfg') + '</p>';
    return paneTop(e) + '<div class="pane-body" data-kind="mcp">' + paneHead(e, it, '<span class="kind">MCP</span>' + trChip(it) + esc(it ? it.author : '')) +
      (warn ? '<div style="margin-top:12px">' + banner('', '<p style="color:var(--fg)">' + warn + '</p>') + '</div>' : '') +
      '<div class="sec"><h3>' + t('sec.agents') + '</h3>' + agentRows(e, function (a, on) { return on ? [a.mcp + ' › ' + a.mcpKey + '.' + e.slug, 'mono'] : A.blocker(it, a.id, e.cfg) === 'sse' ? [t('err.codexSse'), 'wrap'] : A.blocker(it, a.id, e.cfg) === 'needs-config' ? [t('mcp.fillfirst'), ''] : [t('dep.none'), '']; }) + '</div>' +
      '<div class="sec"><h3>' + t('sec.config') + '</h3>' + fields + '</div>' +
      '<div class="sec"><h3>' + t('f.transport') + '</h3><div class="code" style="padding-right:11px">' + esc(tr ? tr.text : '') + '</div><p class="fld" style="margin:6px 0 0"><span class="hint">' + (tr ? (tr.remote ? t(tr.type === 'sse' ? 'tr.sse.long' : 'tr.http.long') : t('tr.local', tr.type)) : '') + '</span></p></div>' +
      versionSec(e, it) + dangerSec(e, t('act.uninstall')) + '</div>';
  }
  function paneProvider(e) {
    var it = A.item(e.id), local = e.slug === 'local', c = e.cfg || {}, nokey = !local && !c.apiKey, none = !e.on.claude && !e.on.codex;
    var warn = nokey ? t('prov.warn.key') : none ? t('prov.warn.none') : '';
    var body = '';
    if (local) {
      body += '<div class="sec">' + textFld(e, 'baseUrl', t('prov.listen'), 'http://127.0.0.1:18100', t('prov.listen.d')) + '</div>';
    } else {
      body += '<div class="sec">' + textFld(e, 'name', t('prov.cfgname'), t('prov.cfgname.ph')) +
        '<div class="fld"><label for="f-apiKey">' + t('prov.key') + ' <span class="req">*</span></label>' + secret(e, 'apiKey', 'sk-…', 'f-apiKey') + '<p class="hint">' + t('prov.key.d') + '</p></div></div>' +
        '<div class="sec"><h3>' + t('prov.keys') + ' ' + pro() + '</h3>' + (A.isPro()
          ? (c.apiKeys || []).map(function (k, i) { return '<div class="fld-row" style="margin-bottom:6px"><input class="inp mono" type="password" value="' + esc(k) + '" data-key-i="' + i + '" data-slug="' + e.slug + '" placeholder="sk-…" aria-label="' + t('prov.keys') + ' ' + (i + 1) + '"><button type="button" class="btn btn-ic" data-act="delkey" data-arg="' + e.slug + '|' + i + '" aria-label="' + t('act.remove') + '">' + ic('x') + '</button></div>'; }).join('') + '<button type="button" class="btn btn-sm" data-act="addkey" data-arg="' + e.slug + '">' + ic('plus') + t('prov.addkey') + '</button>'
          : gate('keys')) + '</div>' +
        '<details class="fold"' + (U.fold1 ? ' open' : '') + ' data-fold="fold1"><summary>' + t('prov.more') + ' <small>' + t('prov.more.d') + '</small></summary><div>' +
          '<div class="fld"><span class="lb">' + t('prov.pname') + '</span><div class="code" style="padding-right:11px">' + esc(it ? it.name : e.slug) + '</div></div>' +
          textFld(e, 'baseUrl', t('prov.url'), it && it.runs[0] ? it.runs[0][1] : 'https://', t('prov.url.d')) +
          '<div class="grid2">' + textFld(e, 'endpointPath', t('prov.endpoint'), '/v1/messages', '') +
          selFld(e, 'upstreamProtocol', t('prov.protocol'), [['auto', t('prov.auto')], ['openai_chat', 'openai_chat'], ['claude_messages', 'claude_messages'], ['codex_responses', 'codex_responses']]) +
          selFld(e, 'authType', t('prov.auth'), [['bearer', 'Bearer'], ['anthropic', 'X-API-Key'], ['custom', t('prov.auth.custom')]]) +
          selFld(e, 'level', t('prov.level'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return [n, 'Level ' + n]; })) + '</div>' +
          (c.authType === 'custom' ? textFld(e, 'customHeader', t('prov.header'), 'X-Custom-Key') : '') +
          '<p class="hint" style="font-size:11.5px;color:var(--fg3);margin-bottom:10px">' + t('prov.level.d') + '</p></div></details>' +
        '<details class="fold"' + (U.fold2 ? ' open' : '') + ' data-fold="fold2"><summary>' + t('prov.adv') + ' <small>' + t('prov.adv.d') + '</small></summary><div>' +
          '<div class="fld"><span class="lb">' + t('prov.whitelist') + '</span><div class="tags">' + (c.whitelist || []).map(function (w, i) { return '<span class="chip mono">' + esc(w) + '<button type="button" data-act="delwl" data-arg="' + e.slug + '|' + i + '" aria-label="' + t('act.remove') + ' ' + esc(w) + '">×</button></span>'; }).join('') + '</div><div class="fld-row"><input class="inp mono" id="wl" placeholder="claude-*" aria-label="' + t('prov.whitelist') + '"><button type="button" class="btn" data-act="addwl" data-arg="' + e.slug + '">' + t('act.add') + '</button></div></div>' +
          '<div class="fld"><span class="lb">' + t('prov.mapping') + '</span><div class="tags">' + Object.keys(c.modelMapping || {}).map(function (k) { return '<span class="chip mono">' + esc(k) + ' → ' + esc(c.modelMapping[k]) + '<button type="button" data-act="delmap" data-arg="' + e.slug + '|' + esc(k) + '" aria-label="' + t('act.remove') + ' ' + esc(k) + '">×</button></span>'; }).join('') + '</div><div class="fld-row"><input class="inp mono" id="mapf" placeholder="' + t('prov.map.from') + '" aria-label="' + t('prov.map.from') + '"><input class="inp mono" id="mapt" placeholder="' + t('prov.map.to') + '" aria-label="' + t('prov.map.to') + '"><button type="button" class="btn" data-act="addmap" data-arg="' + e.slug + '">' + t('act.add') + '</button></div></div>' +
          '<div class="ag-r" style="padding:0 0 10px"><div class="ag-t"><b>' + t('prov.health') + '</b><small class="wrap">' + t('prov.health.d') + '</small></div><button type="button" class="sw" role="switch" data-kind="provider" aria-checked="' + !!c.healthCheck + '" data-act="cfgflag" data-arg="' + e.slug + '|healthCheck" aria-label="' + t('prov.health') + '"></button></div></div></details>';
    }
    return paneTop(e) + '<div class="pane-body" data-kind="provider">' + paneHead(e, it, '<span class="kind">' + t('kind.provider') + '</span>' + (local ? t('prov.builtin') : '<span class="lv">L' + (c.level || 1) + '</span>' + esc(it ? it.name : ''))) +
      (it && local ? '<p class="desc">' + t('prov.local.d') + '</p>' : '') +
      (warn ? '<div style="margin-top:12px">' + banner('', '<p style="color:var(--fg)">' + warn + '</p>') + '</div>' : '') +
      '<div class="sec"><h3>' + t(local ? 'prov.wiring' : 'sec.agents') + '</h3>' + agentRows(e, function (a, on) { return on ? [local ? t('prov.wired', a.name) : t('prov.via'), 'wrap'] : A.blocker(it, a.id, c) === 'incompatible' ? [t('err.incompatible', a.name), 'wrap'] : A.blocker(it, a.id, c) === 'no-key' ? [t('prov.fillkey'), ''] : [t('dep.none'), '']; }) + '</div>' +
      body +
      (local ? '' : '<div class="sec acts"><button type="button" class="btn" data-act="dup" data-arg="' + e.slug + '">' + ic('copy') + t('prov.dup') + '</button><button type="button" class="btn btn-bad" data-act="uninstall" data-arg="' + esc(e.slug) + '">' + ic('trash') + t('act.delete') + '</button></div>') + '</div>';
  }

  /* ---------- 供应商与本地中转 ---------- */
  function provs() { return ofKind('provider').filter(function (e) { return e.slug !== 'local'; }).sort(function (a, b) { return (a.cfg.level || 1) - (b.cfg.level || 1) || (a.slug < b.slug ? -1 : 1); }); }
  function chain(agent) { return provs().filter(function (e) { return e.on[agent] && e.cfg.apiKey; }); }
  function viewProviders() {
    var list = provs(), local = A.entry('local');
    var flows = A.AGENTS.map(function (a) {
      var wired = local && local.on[a.id] && A.detected(a.id), ch = chain(a.id);
      var nodes = ch.map(function (e, i) { var cut = !A.isPro() && i >= 2; return '<span class="arr">→</span><span class="node' + (cut ? '' : ' on') + '"' + (cut ? ' style="opacity:.5" title="' + t('relay.free2') + '"' : '') + '><span class="lv">L' + (e.cfg.level || 1) + '</span>' + esc(nameOf(e)) + '</span>'; }).join('');
      return '<div class="flow"><span class="node' + (wired ? ' on' : '') + '"><b style="color:' + a.color + '">' + a.name + '</b></span><span class="arr">→</span>' + (wired ? '<span class="node on mono" style="font-size:11.5px">127.0.0.1:18100</span>' + (nodes || '<span class="arr">→</span><span style="color:var(--warn)">' + t('relay.nochain') + '</span>') : '<span style="color:var(--fg3)">' + t(A.detected(a.id) ? 'relay.notwired' : 'ag.notfound') + '</span>') + '</div>';
    }).join('');
    var relay = '<div class="card" data-kind="provider"><h3><i class="pulse' + (S.relay ? ' on' : '') + '" style="margin:0 2px"></i>' + t('relay.title') + ' <span class="chip ' + (S.relay ? 'ok' : '') + '">' + t(S.relay ? 'relay.on' : 'relay.off') + '</span><span class="sp"></span><button type="button" class="btn btn-sm" data-act="dlg" data-arg="reqlog">' + ic('term') + t('relay.log') + '</button><a class="btn btn-sm" href="' + href('providers', 'local') + '">' + t('relay.settings') + '</a><button type="button" class="sw" role="switch" aria-checked="' + S.relay + '" data-act="relay" aria-label="' + t('relay.title') + '" title="' + t(S.relay ? 'relay.stop' : 'relay.start') + '"></button></h3>' +
      '<p class="sub" style="margin-top:6px;max-width:74ch">' + t('relay.d') + '</p>' + (S.relay ? flows : banner('', '<p style="color:var(--fg)">' + t('relay.stopped.d') + '</p>').replace('class="banner', 'style="margin:12px 0 0" class="banner')) +
      '<p class="sub" style="margin-top:12px">' + t(A.isPro() ? 'relay.rule.pro' : 'relay.rule.free') + '</p></div>';
    var rows = list.map(function (e, i) {
      var it = A.item(e.id), nokey = !e.cfg.apiKey;
      return '<div class="row' + (R.arg === e.slug ? ' sel' : '') + '" data-kind="provider"><a class="row-main" href="' + href('providers', e.slug) + '"><span class="lv" title="' + t('prov.level') + '">L' + (e.cfg.level || 1) + '</span>' + tile('provider') +
        '<div class="row-t"><b><span class="nm">' + esc(nameOf(e)) + '</span>' + (nokey ? '<span class="chip warn">' + t('st.nokey') + '</span>' : '') + (e.parent ? '<span class="chip">' + t('st.copyof', e.parent) + '</span>' : '') + '</b><p class="mono" style="font-size:11.5px">' + esc(e.cfg.baseUrl || (it && it.runs[0] ? it.runs[0][1] : '')) + '</p></div></a>' +
        '<div class="row-x"><span style="display:flex;gap:4px"><button type="button" class="btn btn-sm btn-ic" data-act="move" data-arg="' + e.slug + '|-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="' + t('prov.up', nameOf(e)) + '" title="' + t('prov.up', nameOf(e)) + '">' + ic('up') + '</button><button type="button" class="btn btn-sm btn-ic" data-act="move" data-arg="' + e.slug + '|1"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="' + t('prov.down', nameOf(e)) + '" title="' + t('prov.down', nameOf(e)) + '">' + ic('down') + '</button></span>' +
        A.AGENTS.map(function (a) { return '<span class="col-ag">' + agentSwitch(e, a, 'provider') + '</span>'; }).join('') + '</div></div>';
    }).join('');
    var health = A.isPro()
      ? '<div class="card"><h3>' + t('health.t') + ' ' + pro() + '<span class="sp"></span><span class="chip sample">' + t('sample') + '</span></h3><div class="ag" style="margin-top:10px">' + list.filter(function (e) { return e.cfg.apiKey; }).map(function (e, i) {
          var cool = i === 1 && !U.recovered;
          return '<div class="ag-r"><i class="pulse' + (cool ? '' : ' on') + '"' + (cool ? ' style="background:var(--warn)"' : '') + '></i><div class="ag-t"><b>' + esc(nameOf(e)) + '</b><small>' + (cool ? t('health.cooling') : t('health.ok')) + '</small></div>' + (cool ? '<button type="button" class="btn btn-sm" data-act="recover">' + t('health.recover') + '</button>' : '') + '</div>';
        }).join('') + '</div></div>'
      : gate('routing');
    return '<div class="view"><div class="vh"><div><h1>' + t('prov.h') + '</h1><p class="sub">' + t('prov.sub') + '</p></div><span class="sp"></span><a class="btn btn-sm" href="' + href('discover', '', { kind: 'provider' }) + '">' + ic('plus') + t('prov.add') + '</a></div>' +
      relay + '<div class="cols-h" style="margin-top:18px"><span class="sp">' + t('prov.order') + '</span>' + A.AGENTS.map(function (a) { return '<span class="col-ag h">' + a.name + '</span>'; }).join('') + '</div>' +
      (R.q.state === 'empty' || !list.length ? empty('provider', t('prov.empty.t'), t('prov.empty.d'), '<a class="btn btn-pri" href="' + href('discover', '', { kind: 'provider' }) + '">' + t('prov.add') + '</a>') : '<div class="list" id="rows">' + rows + '</div>') +
      '<div style="margin-top:14px">' + health + '</div></div>';
  }

  /* ---------- 用量（示例数据） ---------- */
  var USE = [['skyapi', 'claude-sonnet-4-5', 'claude', 140, 0.021, 5200, 900], ['skyapi', 'claude-haiku-4-5', 'claude', 60, 0.004, 3100, 420], ['openrouter', 'gpt-5-codex', 'codex', 85, 0.017, 4300, 760]];
  function rnd(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return 0.6 + 0.8 * (x - Math.floor(x)); }
  function usage(period) {
    var n = period === '1' ? 24 : Number(period), series = [], by = USE.map(function (u) { return { prov: u[0], model: u[1], agent: u[2], req: 0, ok: 0, tin: 0, tout: 0, cost: 0 }; });
    for (var i = 0; i < n; i++) {
      var cost = 0, req = 0;
      USE.forEach(function (u, j) {
        var f = rnd(i * 3 + j + n), r = Math.round(u[3] * f / (period === '1' ? 24 / (i > 8 && i < 20 ? 2.2 : 0.3) : 1));
        by[j].req += r; by[j].ok += Math.round(r * (j === 2 ? 0.985 : 0.996)); by[j].tin += r * u[5]; by[j].tout += r * u[6]; by[j].cost += r * u[4];
        cost += r * u[4]; req += r;
      });
      var label;
      if (period === '1') label = (i < 10 ? '0' : '') + i;
      else { var d = new Date(2026, 10, 13 - (n - 1 - i)); label = (d.getMonth() + 1) + '/' + d.getDate(); }
      series.push({ label: label, cost: cost, req: req });
    }
    return { series: series, by: by };
  }
  function chart(series) {
    var W = 720, H = 150, pad = 26, max = Math.max.apply(null, series.map(function (s) { return s.cost; })) || 1, bw = (W - pad) / series.length;
    var bars = series.map(function (s, i) {
      var h = Math.max(2, (H - 34) * s.cost / max), x = pad + i * bw + bw * 0.14, show = series.length <= 8 || i % Math.ceil(series.length / 8) === 0;
      return '<rect class="b" x="' + x.toFixed(1) + '" y="' + (H - 20 - h).toFixed(1) + '" width="' + (bw * 0.72).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"><title>' + s.label + ' · $' + s.cost.toFixed(2) + ' · ' + s.req + ' ' + t('use.req') + '</title></rect>' + (show ? '<text x="' + (x + bw * 0.36).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle">' + s.label + '</text>' : '');
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + t('use.chart') + '"><line x1="' + pad + '" x2="' + W + '" y1="' + (H - 20) + '" y2="' + (H - 20) + '"/><line x1="' + pad + '" x2="' + W + '" y1="14" y2="14" stroke-dasharray="3 4"/><text x="0" y="18">$' + max.toFixed(max < 10 ? 1 : 0) + '</text><text x="0" y="' + (H - 18) + '">$0</text>' + bars + '</svg>';
  }
  function viewUsage() {
    var isEmpty = S.usage === 'empty' || R.q.state === 'empty';
    var head = '<div class="vh"><div><h1>' + t('use.h') + '</h1><p class="sub">' + t('use.sub') + '</p></div><span class="sp"></span>' +
      '<div class="seg" role="group" aria-label="' + t('proto.data') + '" style="border-style:dashed;border-color:rgba(255,184,107,.4)"><button type="button" data-act="usedata" data-arg="sample" aria-pressed="' + !isEmpty + '">' + t('sample') + '</button><button type="button" data-act="usedata" data-arg="empty" aria-pressed="' + isEmpty + '">' + t('proto.empty') + '</button></div></div>';
    if (isEmpty) return '<div class="view">' + head + empty('provider', t('use.empty.t'), t('use.empty.d'), '<a class="btn btn-pri" href="' + href('providers') + '">' + t('use.empty.cta') + '</a>') + '</div>';
    var u = usage(U.period), tot = u.by.reduce(function (a, b) { return { req: a.req + b.req, ok: a.ok + b.ok, tok: a.tok + b.tin + b.tout, cost: a.cost + b.cost }; }, { req: 0, ok: 0, tok: 0, cost: 0 });
    var seg = [['1', 'use.today'], ['7', 'use.7'], ['30', 'use.30']].map(function (p) { return '<button type="button" data-act="period" data-arg="' + p[0] + '" aria-pressed="' + (U.period === p[0]) + '">' + t(p[1]) + '</button>'; }).join('');
    var stats = [[t('use.cost'), '$' + tot.cost.toFixed(2)], [t('use.tokens'), fmt(tot.tok)], [t('use.reqs'), num(tot.req)], [t('use.ok'), (tot.ok / tot.req * 100).toFixed(1) + '%']].map(function (s) { return '<div class="card stat"><small>' + s[0] + '</small><b>' + s[1] + '</b></div>'; }).join('');
    var table = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + t('kind.provider') + '</th><th>' + t('use.model') + '</th><th>Agent</th><th class="num">' + t('use.reqs') + '</th><th class="num">' + t('use.ok') + '</th><th class="num">' + t('use.in') + '</th><th class="num">' + t('use.out') + '</th><th class="num">' + t('use.cost') + '</th></tr></thead><tbody>' +
      u.by.map(function (b) { return '<tr><td>' + b.prov + '</td><td class="mono" style="font-size:12px">' + b.model + '</td><td>' + agentName(b.agent) + '</td><td class="num">' + num(b.req) + '</td><td class="num">' + (b.ok / b.req * 100).toFixed(1) + '%</td><td class="num">' + fmt(b.tin) + '</td><td class="num">' + fmt(b.tout) + '</td><td class="num">$' + b.cost.toFixed(2) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var month = usage('30').by.reduce(function (a, b) { return a + b.cost; }, 0) * 13 / 30, proj = month / 13 * 30, budget;
    if (!A.isPro()) budget = gate('budget');
    else {
      var lim = S.budget, frac = lim ? month / lim : 0, lvl = lim && frac >= 1 ? 'over' : lim && (frac >= 0.8 || proj > lim) ? 'warn' : '';
      budget = '<div class="card"><h3>' + t('bud.t') + ' ' + pro() + '<span class="sp"></span><span class="chip sample">' + t('sample') + '</span></h3><p class="sub">' + t('bud.d') + '</p>' +
        '<div class="fld-row" style="margin-top:10px;align-items:center"><span style="color:var(--fg3)">$</span><input class="inp" id="budget" type="number" min="0" step="10" value="' + (lim || '') + '" placeholder="' + t('bud.ph') + '" aria-label="' + t('bud.t') + '"><button type="button" class="btn" data-act="setbudget">' + t('save') + '</button></div>' +
        (lim ? '<div class="meter ' + lvl + '"><i style="width:' + Math.min(100, frac * 100).toFixed(0) + '%"></i></div><dl class="facts" style="margin-top:10px"><dt>' + t('bud.spent') + '</dt><dd>$' + month.toFixed(2) + ' / $' + lim + '</dd><dt>' + t('bud.proj') + '</dt><dd>$' + proj.toFixed(2) + (lvl ? ' <span class="chip ' + (lvl === 'over' ? 'bad' : 'warn') + '">' + t(lvl === 'over' ? 'bud.over' : 'bud.near') + '</span>' : '') + '</dd></dl>' : '<p class="sub" style="margin-top:8px">' + t('bud.none') + '</p>') +
        '<div class="acts"><button type="button" class="btn btn-sm" data-act="export" data-arg="csv">' + t('use.export', 'CSV') + '</button><button type="button" class="btn btn-sm" data-act="export" data-arg="json">' + t('use.export', 'JSON') + '</button></div></div>';
    }
    return '<div class="view">' + head +
      '<div class="card"><h3>' + t('use.trend') + ' <span class="chip sample">' + t('sample') + '</span><span class="sp"></span><div class="seg" role="group" aria-label="' + t('use.period') + '">' + seg + '</div></h3>' + chart(u.series) + '</div>' +
      '<div class="cards c4" style="margin-top:12px">' + stats + '</div>' +
      '<div class="cards c2" style="margin-top:12px;align-items:start"><div class="card"><h3>' + t('use.by') + '<span class="sp"></span><button type="button" class="btn btn-sm" data-act="dlg" data-arg="reqlog">' + t('relay.log') + '</button></h3><div style="margin:8px -4px 0">' + table + '</div></div>' + budget + '</div></div>';
  }

  /* ---------- 项目 ---------- */
  function viewProjects() {
    var list = R.q.state === 'empty' ? [] : S.projects;
    var head = '<div class="vh"><div><h1>' + t('pj.h') + '</h1><p class="sub">' + t('pj.sub') + '</p></div><span class="sp"></span><button type="button" class="btn btn-sm" data-act="pj-new">' + ic('plus') + t('pj.add') + '</button></div>';
    if (R.q.state === 'loading') return '<div class="view">' + head + skeleton(3) + '</div>';
    if (!list.length) return '<div class="view">' + head + empty('folder', t('pj.none.t'), t('pj.none.d'), '<button type="button" class="btn btn-pri" data-act="pj-new">' + t('pj.add') + '</button>') + '</div>';
    return '<div class="view">' + head + '<div class="list" id="rows">' + list.map(function (p) {
      var miss = p.items.filter(projMiss).length;
      return '<div class="row" data-kind="folder"><a class="row-main" href="' + href('project', p.id) + '">' + tile('folder') + '<div class="row-t"><b><span class="nm">' + esc(p.name) + '</span>' + (p.missing ? '<span class="chip warn">' + t('pj.missing.chip') + '</span>' : '') + (miss && !p.missing ? '<span class="chip warn">' + t('st.nokey') + '</span>' : '') + '</b><p class="mono" style="font-size:11.5px">' + esc(p.path) + '</p></div></a>' +
        '<div class="row-x"><span class="row-meta" style="display:block">' + t('pj.count', p.items.length) + '</span></div></div>';
    }).join('') + '</div></div>';
  }
  function pjWhere(p, x) {
    var ags = A.AGENTS.filter(function (a) { return x.on[a.id]; });
    if (x.kind === 'mcp') return [ags.map(function (a) { return PMCP[a.id] + ' › ' + PKEY[a.id] + '.' + x.name; }).join(' · '), p.path + '/' + PMCP[ags[0] ? ags[0].id : 'claude']];
    return [ags.map(function (a) { return PDIR[a.id] + '/' + x.name; }).join(' · '), p.path + '/' + PDIR[ags[0] ? ags[0].id : 'claude'] + '/' + x.name];
  }
  function pjRow(p, x) {
    var dis = p.missing ? ' disabled' : '', arg = esc(p.id + '|' + x.key), over = projOver(x), miss = projMiss(x), w = pjWhere(p, x), open = U.over === x.key && over;
    var ags = A.AGENTS.filter(function (a) { return x.on[a.id]; }).map(function (a) { return a.name; });
    var chips = '<span class="chip' + (x.ours ? ' ok' : '') + '" title="' + t(x.ours ? 'pj.src.ours.d' : 'pj.src.own.d') + '">' + t(x.ours ? 'pj.src.ours' : 'pj.src.own') + '</span>';
    if (over) chips += '<button type="button" class="chip" data-act="pj-over" data-arg="' + esc(x.key) + '" aria-expanded="' + !!open + '" aria-controls="ov-' + esc(x.key) + '" title="' + esc(t('pj.over.d', x.name)) + '">' + t('pj.over') + ic(open ? 'up' : 'down') + '</button>';
    if (miss) chips += '<button type="button" class="chip warn" data-act="pj-vars" data-arg="' + arg + '"' + dis + ' title="' + t('pj.vars.fill') + '">' + ic('lock') + t('st.nokey') + '</button>';
    var acts = (projNeeds(x).length && !miss ? '<button type="button" class="btn btn-sm btn-ic" data-act="pj-vars" data-arg="' + arg + '"' + dis + ' aria-label="' + esc(t('pj.vars.edit') + ' · ' + x.name) + '" title="' + t('pj.vars.edit') + '">' + ic('lock') + '</button>' : '') +
      '<button type="button" class="btn btn-sm btn-ic" data-act="reveal-dir" data-arg="' + esc(w[1]) + '"' + dis + ' aria-label="' + esc(t('act.showdir') + ' · ' + x.name) + '" title="' + t('act.showdir') + '">' + ic('folder') + '</button>' +
      (x.ours ? '<button type="button" class="btn btn-sm btn-bad" data-act="pj-un" data-arg="' + arg + '"' + dis + ' aria-label="' + esc(t('act.uninstall') + ' · ' + x.name) + '">' + t('act.uninstall') + '</button>' : '');
    return '<div class="row pj-row' + (p.missing ? ' off' : '') + '" data-kind="' + x.kind + '">' + tile(x.kind) + '<div class="row-t"><b><span class="nm">' + esc(x.name) + '</span>' + chips + '</b><p>' + t('pj.for', joinNames(ags)) + ' · <span class="mono" style="font-size:11.5px">' + esc(w[0]) + '</span>' + (x.version ? ' · <span class="mono" style="font-size:11.5px">' + esc(ver(x.version)) + '</span>' : '') + '</p></div><div class="row-x">' + acts + '</div></div>' +
      (open ? '<div class="row-note" id="ov-' + esc(x.key) + '"><p>' + t('pj.over.long', esc(x.name)) + '</p><a class="lnk" href="' + libHref(over) + '">' + t('pj.over.view') + '</a></div>' : '');
  }
  function pjSec(p, kind) {
    var xs = p.items.filter(function (x) { return x.kind === kind; });
    return '<h2 class="pj-h" data-kind="' + kind + '"><span class="kind">' + t(kind === 'skill' ? 'kinds.skill' : 'kind.mcp') + '</span><small>' + xs.length + '</small><span class="sp"></span><small class="w">' + t('pj.where.' + kind) + '</small></h2>' +
      (xs.length ? '<div class="list">' + xs.map(function (x) { return pjRow(p, x); }).join('') + '</div>' : '<div class="empty" style="padding:20px"><p>' + t('pj.sec.none.' + kind) + '</p></div>');
  }
  function viewProject() {
    var p = A.project(R.arg);
    if (!p) return '<div class="view">' + empty('folder', t('pj.nf.t'), t('pj.nf.d'), '<a class="btn btn-pri" href="' + href('projects') + '">' + t('pj.h') + '</a>') + '</div>';
    var dis = p.missing ? ' disabled' : '';
    var head = '<div class="vh"><div style="min-width:0"><p class="crumb"><a class="lnk" href="' + href('projects') + '">' + t('pj.h') + '</a> /</p><h1>' + esc(p.name) + '</h1><p class="sub mono">' + esc(p.path) + '</p></div><span class="sp"></span>' +
      '<button type="button" class="btn btn-sm btn-kind" data-act="pj-addto" data-arg="' + esc(p.id) + '"' + dis + '>' + ic('plus') + t('pj.addto') + '</button>' +
      '<button type="button" class="btn btn-sm" data-act="reveal-dir" data-arg="' + esc(p.path) + '"' + dis + '>' + ic('folder') + t('act.showdir') + '</button>' +
      '<button type="button" class="btn btn-sm btn-bad" data-act="pj-remove" data-arg="' + esc(p.id) + '">' + t('pj.rm') + '</button></div>';
    if (R.q.state === 'loading') return '<div class="view">' + head + skeleton(4) + '</div>';
    if (R.q.state === 'error') return '<div class="view">' + head + banner('err', '<b>' + t('pj.err.t') + '</b><p>' + t('pj.err.d') + '</p>', '<div class="acts"><button type="button" class="btn btn-sm" data-act="retry">' + t('off.retry') + '</button></div>') + '</div>';
    var gone = p.missing ? banner('', '<b>' + t('pj.missing.t') + '</b><p>' + t('pj.missing.d', '<code class="mono">' + esc(p.path) + '</code>') + '</p>', '<div class="acts"><button type="button" class="btn btn-sm" data-act="pj-relocate" data-arg="' + esc(p.id) + '">' + t('pj.rel') + '</button><button type="button" class="btn btn-sm btn-bad" data-act="pj-remove" data-arg="' + esc(p.id) + '">' + t('pj.rm') + '</button></div>') : '';
    if (!p.items.length || R.q.state === 'empty') return '<div class="view">' + head + gone + (p.missing ? '' : empty('folder', t('pj.empty.t'), t('pj.empty.d'), '<button type="button" class="btn btn-pri" data-act="pj-addto" data-arg="' + esc(p.id) + '">' + t('pj.addto') + '</button>')) + '</div>';
    var trust = !p.missing && p.codexUntrusted && A.detected('codex') && p.items.some(function (x) { return x.kind === 'mcp' && x.on.codex; }) ? banner('', '<b>' + t('pj.trust.t') + '</b><p>' + t('pj.trust.d') + '</p>') : '';
    return '<div class="view">' + head + gone + trust + '<p class="pj-hint">' + ic('info') + '<span>' + t(p.missing ? 'pj.missing.last' : 'pj.vcs') + '</span></p>' + pjSec(p, 'skill') + pjSec(p, 'mcp') + '</div>';
  }

  /* ---------- 设置 ---------- */
  var CLI = ['search [query] [--kind <skill|mcp|provider>]', 'install <id|slug> [--target <agent>] [--force]', 'uninstall <slug> [--force]', 'enable <slug> --for <agent> [--replace] [--force]', 'disable <slug> --for <agent> [--force]', 'config <slug>', 'sync [--for <agent>]', 'relay <start|stop|status>', 'usage [--days N] [--provider <slug>]', 'update [slug]', 'info <id|slug>', 'list [--for <agent>]', 'doctor', 'migrate'];
  function setRow(title, sub, right, cls) { return '<div class="set-r ' + (cls || '') + '"><div class="set-t"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + (right || '') + '</div>'; }
  function viewSettings() {
    var tab = R.arg || 'general', tabs = ['general', 'agents', 'data', 'account', 'cli', 'about'];
    var seg = tabs.map(function (k) { return '<button type="button" data-act="nav" data-arg="' + href('settings', k) + '" aria-pressed="' + (tab === k) + '">' + t('set.' + k) + '</button>'; }).join('');
    var body = '';
    if (tab === 'general') {
      body = '<div class="set">' +
        setRow(t('set.lang'), t('set.lang.d'), '<div class="seg" role="group" aria-label="' + t('set.lang') + '"><button type="button" data-act="lang" data-arg="zh" aria-pressed="' + (S.lang === 'zh') + '">简体中文</button><button type="button" data-act="lang" data-arg="en" aria-pressed="' + (S.lang === 'en') + '">English</button></div>') +
        setRow(t('set.theme'), t('set.theme.d'), '<span class="chip">' + t('set.theme.dark') + '</span>') +
        setRow(t('set.keys'), t('set.keys.d'), '<button type="button" class="btn btn-sm" data-act="dlg" data-arg="shortcuts">' + ic('kbd') + t('set.keys.btn') + '</button>') +
        setRow(t('set.sync') + ' <span class="chip dash">' + t('soon') + '</span>', t('set.sync.d'), '<button type="button" class="sw" role="switch" aria-checked="false" disabled aria-label="' + t('set.sync') + '"></button>', 'off') + '</div>' +
        '<div class="set">' + setRow(t('set.welcome'), t('set.welcome.d'), '<button type="button" class="btn btn-sm" data-act="rewelcome">' + t('set.welcome.btn') + '</button>') + '</div>';
    } else if (tab === 'agents') {
      body = '<p class="h4">' + t('set.agents.h') + '</p><div class="set">' + A.AGENTS.map(function (a) {
        var det = A.detected(a.id);
        return setRow('<span class="ag-ic" style="color:' + a.color + '">' + a.mark + '</span>' + a.name + ' <span class="chip ' + (det ? 'ok' : 'warn') + '">' + t(det ? 'ag.found' : 'ag.notfound') + '</span>',
          det ? t('set.agents.paths', '<code class="mono">' + a.skills + '</code>', '<code class="mono">' + a.mcp + '</code>', '<code class="mono">' + a.env + '</code>') : t('set.agents.missing', '<code class="mono">' + a.dir + '</code>'),
          det ? '<button type="button" class="btn btn-sm btn-ic" data-act="reveal-dir" data-arg="' + a.dir + '" aria-label="' + t('act.showdir') + '" title="' + t('act.showdir') + '">' + ic('folder') + '</button>' : '<button type="button" class="btn btn-sm" data-act="ext" data-arg="https://agent-store.example/docs/agents">' + t('set.agents.how') + '</button>');
      }).join('') + setRow('<span class="ag-ic soon">+</span>' + t('ag.soon'), t('ag.soon.d'), '', 'off') + '</div>' +
        '<div class="acts" style="margin:0 0 16px"><button type="button" class="btn btn-sm" data-act="redetect">' + ic('sync') + t('ag.redetect') + '</button><button type="button" class="btn btn-sm" data-act="doctor">' + t('set.doctor') + '</button></div>' +
        (U.doctor ? banner('info', '<b>' + t('set.doctor.t') + '</b><p>' + t('set.doctor.d') + '</p>') : '');
    } else if (tab === 'data') {
      body = '<div class="set">' +
        setRow(t('set.home'), t('set.home.d'), '<button type="button" class="btn btn-sm btn-ic" data-act="copy" data-arg="~/.agent-store" aria-label="' + t('copy') + '" title="' + t('copy') + '">' + ic('copy') + '</button><button type="button" class="btn btn-sm btn-ic" data-act="reveal-dir" data-arg="~/.agent-store" aria-label="' + t('act.showdir') + '" title="' + t('act.showdir') + '">' + ic('folder') + '</button>') +
        setRow(t('set.skills'), '<code class="mono">~/.agent-store/skills/</code> · ' + t('set.skills.d', ofKind('skill').length), '') +
        setRow(t('set.backups'), '<code class="mono">~/.agent-store/backups/</code> · ' + t('set.backups.d'), '') +
        setRow(t('set.exports'), '<code class="mono">~/.agent-store/exports/</code>', '') +
        (S.legacy ? setRow(t('set.legacy') + ' <span class="chip ok">' + t('set.legacy.done') + '</span>', t('set.legacy.d'), '<a class="btn btn-sm" href="' + href('welcome', '', { step: 2 }) + '">' + t('set.legacy.view') + '</a>') : '') + '</div>';
    } else if (tab === 'account') {
      body = '<div class="set">' + (S.signedIn
        ? setRow('<span class="avatar in">L</span> lin@example.com', t('acct.in.d'), '<button type="button" class="btn btn-sm" data-act="signout">' + t('acct.signout') + '</button>')
        : setRow('<span class="avatar">' + ic('user') + '</span> ' + t('acct.out'), t('acct.out.hint'), '<button type="button" class="btn btn-sm btn-pri" data-act="signin">' + t('acct.signin') + '</button>')) +
        setRow(t('plan.t') + ' <span class="chip ' + (A.isPro() ? 'pro' : '') + '">' + (A.isPro() ? 'Pro' : 'Free') + '</span>', t(A.isPro() ? 'plan.pro.d' : 'plan.free.d'), A.isPro() ? '<button type="button" class="btn btn-sm" data-act="manage">' + t('acct.manage') + ' ' + ic('ext') + '</button>' : '<button type="button" class="btn btn-sm btn-pri" data-act="upgrade">' + t('acct.upgrade') + ' ' + ic('ext') + '</button>') + '</div>' +
        '<p class="h4">' + t('plan.what') + '</p><div class="set">' + ['budget', 'routing', 'keys'].map(function (k) { return setRow(t('pro.' + k + '.t') + ' ' + pro(), t('pro.' + k + '.d'), '<span class="chip ' + (A.isPro() ? 'ok' : '') + '">' + t(A.isPro() ? 'plan.on' : 'plan.locked') + '</span>'); }).join('') + '</div>' +
        '<p class="sub" style="color:var(--fg3);font-size:12px">' + t('plan.free.keeps') + '</p>';
    } else if (tab === 'cli') {
      body = '<p style="color:var(--fg2);max-width:70ch;margin-bottom:12px">' + t('cli.d') + '</p>' + codeBlock('aas --help', 'mcp') +
        '<div class="card" style="margin-top:12px"><div class="cli">' + CLI.map(function (c) { var k = c.split(' ')[0]; return '<code class="mono">aas ' + esc(c) + '</code><span>' + t('cli.' + k) + '</span>'; }).join('') + '</div></div>';
    } else {
      body = '<div class="set">' +
        setRow('<span class="logo" aria-hidden="true"><i></i><i></i><i></i></span> Agent Store <span class="mono" style="font-weight:500;color:var(--fg3);font-size:12px">v0.2.2</span>', t('about.tag') + '<br>' + t('about.support'), '<button type="button" class="btn btn-sm" data-act="ext" data-arg="https://agent-store.example/download">' + t('about.download') + ' ' + ic('ext') + '</button>') +
        setRow(t('about.upd'), U.updMsg || t('about.upd.d'), '<button type="button" class="btn btn-sm" data-act="check">' + ic('sync') + t('upd.check') + '</button>') +
        setRow(t('about.docs'), '', '<button type="button" class="btn btn-sm" data-act="ext" data-arg="https://agent-store.example/docs">' + t('about.docs') + ' ' + ic('ext') + '</button><button type="button" class="btn btn-sm" data-act="ext" data-arg="https://github.com/awesome-agent-store">GitHub ' + ic('ext') + '</button>') + '</div>';
    }
    return '<div class="view"><div class="vh"><div><h1>' + t('nav.settings') + '</h1></div></div><div class="bar"><div class="seg" role="group" aria-label="' + t('nav.settings') + '" style="flex-wrap:wrap">' + seg + '</div></div>' + body + '</div>';
  }

  /* ---------- 首次启动 ---------- */
  function renderOb() {
    var ob = $('#ob');
    if (R.view !== 'welcome') { ob.hidden = true; ob.innerHTML = ''; return; }
    var step = Number(R.q.step || 1), total = S.legacy ? 3 : 2, last = step >= 3 || (!S.legacy && step >= 2), html;
    var bar = '<div class="ob-steps" aria-hidden="true">' + [1, 2, 3].slice(0, total).map(function (i) { return '<i class="' + (i <= Math.min(step, total) ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    if (step === 1) {
      var rows = A.AGENTS.map(function (a) {
        var det = A.detected(a.id);
        return '<div class="ag-r"><span class="ag-ic" style="color:' + a.color + '">' + a.mark + '</span><div class="ag-t"><b>' + a.name + '</b><small class="mono">' + (det ? a.dir + ' · ' + a.mcp : t('ob.notfound.d', a.dir)) + '</small></div><span class="chip ' + (det ? 'ok' : 'warn') + '">' + (det ? ic('check') : '') + t(det ? 'ag.found' : 'ag.notfound') + '</span></div>';
      }).join('') + '<div class="ag-r soon"><span class="ag-ic soon">+</span><div class="ag-t"><b>' + t('ag.soon') + '</b><small>' + t('ag.soon.d') + '</small></div></div>';
      html = bar + '<h1>' + t('ob.h1a') + '<span class="grad">' + t('ob.h1b') + '</span></h1><p class="lede">' + t('ob.lede') + '</p><div class="ag">' + rows + '</div>' +
        (S.agents === 'none' ? '<div style="margin-top:12px">' + banner('', '<b>' + t('ob.none.t') + '</b><p>' + t('ob.none.d') + '</p>') + '</div>' : '') +
        '<div class="acts"><a class="btn btn-pri" href="' + href('welcome', '', { step: 2 }) + '" id="ob-next">' + t(S.agents === 'none' ? 'ob.anyway' : 'ob.next') + '</a><button type="button" class="btn" data-act="redetect">' + ic('sync') + t('ag.redetect') + '</button></div>';
    } else if (!last) {
      html = bar + '<h1>' + t('ob.mig.h') + '</h1><p class="lede">' + t('ob.mig.lede') + '</p><ul class="prog">' +
        ['ob.mig.1', 'ob.mig.2', 'ob.mig.3', 'ob.mig.4'].map(function (k) { return '<li class="ok"><span class="st">' + ic('check') + '</span><span>' + t(k) + '</span></li>'; }).join('') +
        '<li class="skip"><span class="st"></span><span>' + t('ob.mig.5') + '</span></li></ul>' +
        '<div class="acts"><a class="btn btn-pri" href="' + href('welcome', '', { step: 3 }) + '" id="ob-next">' + t('ob.next') + '</a><a class="btn" href="' + href('welcome') + '">' + t('back') + '</a></div>';
    } else {
      html = bar + '<h1>' + t('ob.done.h') + '</h1><p class="lede">' + t('ob.done.lede', num(AS_CATALOG.mcp), num(AS_CATALOG.skill)) + '</p><div class="set">' +
        setRow(t('ob.tip1'), t('ob.tip1.d'), '<kbd class="kbd">' + (S.platform === 'mac' ? '⌘' : 'Ctrl') + ' K</kbd>') +
        setRow(t('ob.tip2'), t('ob.tip2.d'), '') + setRow(t('ob.tip3'), t('ob.tip3.d'), '') + '</div>' +
        '<div class="acts"><button type="button" class="btn btn-pri" data-act="start" id="ob-next">' + t('ob.start') + '</button><a class="btn" href="' + href('welcome', '', { step: S.legacy ? 2 : 1 }) + '">' + t('back') + '</a></div>';
    }
    ob.hidden = false; ob.innerHTML = '<div class="ob-card">' + html + '</div>';
  }

  /* ---------- 对话框 ---------- */
  function openDlg(d) { D = d; drawDlg(); var el = $('#dlg'); if (!el.open) el.showModal(); var f = $('[data-autofocus]', el); if (f) f.focus(); }
  function closeDlg() { var el = $('#dlg'); D = null; if (el.open) el.close(); render(); }
  function dlgItem(it, slug) { return '<div class="dl-item" data-kind="' + it.kind + '">' + tile(it.kind) + '<div><b>' + esc(it.name) + '</b><small>' + esc(it.id) + ' · ' + esc(ver(it.version)) + '</small></div></div>'; }
  function tgReason(it, a, vals, loc) {
    if (!A.detected(a.id)) return t('ag.missing', a.name);
    var b = A.blocker(it, a.id, vals || { apiKey: 1 });
    return b === 'incompatible' ? t('err.incompatible', a.name) : b === 'sse' ? t('err.codexSse') : '';
  }
  function dlgInstall() {
    var d = D, it = d.it, nd = A.needs(it), body = '', foot = '', el = $('#dlg');
    el.className = ''; el.dataset.kind = it.kind;
    var web = d.from === 'web' ? '<div class="web">' + ic('globe') + '<span>' + t('link.fromweb') + '</span></div>' : '';
    var cancel = '<button type="button" class="btn" data-act="d-close"' + (d.from === 'web' ? ' data-autofocus' : '') + '>' + t('cancel') + '</button>';
    if (d.step === 'loading') {
      body = '<h2>' + t('inst.confirm') + '</h2><p class="lede" role="status" style="display:flex;gap:10px;align-items:center;margin-top:12px"><span class="spin"></span>' + t('link.loading') + ' <code class="mono" style="font-size:12px;word-break:break-all">' + esc(d.ref) + '</code></p>';
      foot = cancel;
    } else if (d.step === 'targets') {
      var any = A.AGENTS.some(function (a) { return d.tg[a.id]; }), lp = d.loc ? A.project(d.loc) : null;
      var locSec = it.kind === 'provider' ? '' : '<div class="sec" style="margin-top:0"><h3><label for="d-loc">' + t('inst.loc') + '</label></h3><select class="inp" id="d-loc" style="width:100%"><option value="">' + t('inst.loc.global') + '</option>' + S.projects.map(function (p) {
        var why = p.missing ? t('pj.missing.chip') : projHas(p, it) ? t('st.installed') : A.projItem(p, projKey(it)) ? t('inst.loc.clash') : '';
        return '<option value="' + esc(p.id) + '"' + (why ? ' disabled' : '') + (d.loc === p.id ? ' selected' : '') + '>' + esc(t('inst.loc.proj', p.name) + ' · ' + p.path + (why ? ' · ' + why : '')) + '</option>';
      }).join('') + '<option value="__add">' + t('pj.add.more') + '</option></select>' + (lp ? '<p class="loc-note">' + t('inst.loc.vcs') + (it.kind === 'mcp' ? (S.lang === 'en' ? ' ' : '') + t('inst.loc.approve') : '') + '</p>' : '') + '</div>';
      body = '<h2>' + t(d.from === 'web' ? 'inst.confirm' : 'inst.h', it.name) + '</h2>' + dlgItem(it) + locSec +
        '<div class="sec"' + (locSec ? '' : ' style="margin-top:0"') + '><h3>' + t(it.kind === 'provider' ? 'inst.targets.prov' : 'inst.targets') + '</h3><div class="ag">' + A.AGENTS.map(function (a) {
          var why = tgReason(it, a, null, d.loc);
          return '<div class="ag-r"><span class="ag-ic" style="color:' + a.color + '">' + a.mark + '</span><div class="ag-t"><b>' + a.name + '</b><small class="wrap">' + esc(why || (lp ? lp.path + '/' + (it.kind === 'skill' ? PDIR[a.id] + '/' : PMCP[a.id]) : it.kind === 'skill' ? a.skills + '/' : it.kind === 'mcp' ? a.mcp : t('prov.via'))) + '</small></div><button type="button" class="sw" role="switch" data-kind="' + it.kind + '" aria-checked="' + !!d.tg[a.id] + '" data-act="tg" data-arg="' + a.id + '"' + (why ? ' disabled' : '') + ' aria-label="' + a.name + '"></button></div>';
        }).join('') + '<div class="ag-r soon"><span class="ag-ic soon">+</span><div class="ag-t"><b>' + t('ag.soon') + '</b><small>' + t('ag.soon.d') + '</small></div></div></div></div>' +
        '<div class="sec"><h3>' + t('sec.writes') + '</h3><ul class="steps">' + writes(it, d.slug, lp, d.tg).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' + web;
      foot = cancel + '<button type="button" class="btn btn-pri" data-act="d-next"' + (d.from === 'web' ? '' : ' data-autofocus') + (lp && !any ? ' disabled title="' + t('inst.loc.noagent') + '"' : '') + '>' + t(!any && it.kind !== 'provider' ? 'inst.only' : nd.length ? 'inst.next' : 'act.install') + '</button>';
    } else if (d.step === 'vars') {
      var full = nd.every(function (n) { return d.vals[n.key]; });
      body = '<h2>' + t('inst.vars') + '</h2><p class="lede">' + t(it.kind === 'provider' ? 'inst.vars.prov' : 'inst.vars.d') + '</p>' + nd.map(function (n, i) {
        return '<div class="fld"><label for="v-' + i + '">' + esc(n.key === 'apiKey' ? t('prov.key') : n.key) + ' <span class="req">*</span></label><input class="inp mono" id="v-' + i + '" type="password" autocomplete="off" data-val="' + esc(n.key) + '" value="' + esc(d.vals[n.key] || '') + '" placeholder="' + esc(n.key === 'apiKey' ? 'sk-…' : n.key) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + (n.bearer && d.tg.codex ? '<p class="hint">' + t('mcp.codexenv') + ' <code class="mono">export ' + esc(n.key) + '=…</code></p>' : '') + '</div>';
      }).join('') + '<p style="font-size:12px;color:var(--fg3)">' + (d.loc ? (d.tg.claude ? esc(t('inst.vars.pj', nd[0].key)) : t('inst.vars.pj.local')) : t('inst.vars.store')) + '</p>';
      foot = '<button type="button" class="btn" data-act="d-back">' + t('back') + '</button><span class="sp"></span><button type="button" class="btn" data-act="d-skip">' + t('inst.later') + '</button><button type="button" class="btn btn-pri" id="d-go" data-act="d-install"' + (full ? '' : ' disabled') + '>' + t('act.install') + '</button>';
    } else if (d.step === 'progress' || d.step === 'conflict' || d.step === 'failed') {
      body = '<h2>' + t(d.step === 'failed' ? 'inst.failed' : 'inst.running', it.name) + '</h2>' + dlgItem(it) + '<ul class="prog" data-kind="' + it.kind + '">' + d.prog.map(function (s) {
        return '<li class="' + (s.st || '') + '"><span class="st">' + (s.st === 'ok' ? ic('check') : '') + '</span><span><code class="mono">' + esc(s.text) + '</code>' + (s.note ? '<br>' + esc(s.note) : '') + '</span></li>';
      }).join('') + '</ul>';
      if (d.step === 'conflict') {
        body += '<div style="margin-top:14px">' + banner('', '<b>' + t('conf.t', 'Claude Code') + '</b><p>' + t('conf.d') + '</p>') + '</div>';
        foot = '<button type="button" class="btn" data-act="d-conflict" data-arg="skip" data-autofocus>' + t('conf.skip', 'Claude Code') + '</button><button type="button" class="btn btn-kind" data-kind="mcp" data-act="d-conflict" data-arg="replace">' + t('conf.replace') + '</button>';
      } else if (d.step === 'failed') {
        body += '<div style="margin-top:14px">' + banner('err', '<b>' + t('inst.failed.t') + '</b><p>' + esc(d.err) + '</p>') + '</div>';
        foot = '<button type="button" class="btn" data-act="d-close" data-autofocus>' + t('close') + '</button><button type="button" class="btn btn-pri" data-act="d-retry">' + t('off.retry') + '</button>';
      } else foot = '<span style="color:var(--fg3);font-size:12.5px" role="status">' + t('inst.wait') + '</span><span class="sp"></span><button type="button" class="btn" disabled>' + t('inst.installing') + '</button>';
    } else if (d.step === 'done') {
      var dp = d.loc ? A.project(d.loc) : null, e = dp ? A.projItem(dp, d.pkey) : A.entry(d.slug), on = A.AGENTS.filter(function (a) { return e.on[a.id]; });
      var needCfg = d.skip || (it.kind === 'provider');
      body = '<div class="done" data-kind="' + it.kind + '"><span class="ring">' + ic('check') + '</span><h2>' + t('inst.done', it.name) + '</h2><p>' + (dp ? t('inst.done.pj', esc(dp.name), on.map(function (a) { return a.name; }).join(S.lang === 'en' ? ' and ' : '、')) + (S.lang === 'en' ? ' ' : '') + t(projMiss(e) ? 'inst.done.pj.nokey' : 'inst.done.pj.commit') : on.length ? t('inst.done.on', on.map(function (a) { return a.name; }).join(S.lang === 'en' ? ' and ' : '、')) : t(d.skip ? 'inst.done.skip' : 'inst.done.off')) + '</p>' +
        '<div class="ag sum">' + A.AGENTS.map(function (a) {
          var why = e.on[a.id] ? '' : d.skipped === a.id ? t('conf.skipped') : tgReason(it, a, null, d.loc) || (d.skip && !dp ? t('mcp.fillfirst') : t('dep.none'));
          return '<div class="ag-r"><span class="ag-ic" style="color:' + a.color + '">' + a.mark + '</span><div class="ag-t"><b>' + a.name + '</b>' + (why ? '<small class="wrap">' + esc(why) + '</small>' : d.replaced === a.id ? '<small class="wrap">' + t('conf.replaced') + '</small>' : '') + '</div><span class="chip ' + (e.on[a.id] ? 'ok' : '') + '">' + t(dp ? (e.on[a.id] ? 'pj.st.on' : 'pj.st.off') : e.on[a.id] ? 'st.on' : 'st.off') + '</span></div>';
        }).join('') + '</div>' + (it.kind !== 'provider' && on.length ? '<p style="font-size:12px;color:var(--fg3);margin-top:10px">' + t('inst.restart') + '</p>' : '') + '</div>';
      foot = '<button type="button" class="btn" data-act="d-close">' + t('done') + '</button><button type="button" class="btn btn-pri" data-act="d-open" data-autofocus>' + t(dp ? 'pj.open' : needCfg ? 'inst.opencfg' : 'inst.view') + '</button>';
    }
    el.innerHTML = '<div class="dl-b">' + body + '</div><div class="dl-f">' + foot + '</div>';
  }
  var PICKS = ['~/code/agent-store', '~/code/docs-site', '~/work/api-server', '~/code/archive/old-site'];
  var REQS = [['12:41:07', 'claude', 'claude-sonnet-4-5', 'skyapi', 0, 1840, 200], ['12:40:52', 'codex', 'gpt-5-codex', 'openrouter', 0, 2210, 200], ['12:39:18', 'claude', 'claude-haiku-4-5', 'skyapi', 0, 640, 200], ['12:37:44', 'codex', 'gpt-5-codex', 'openrouter', 0, 30012, 529], ['12:37:44', 'codex', 'gpt-5-codex', 'yls', 1, 2630, 200], ['12:31:02', 'claude', 'claude-sonnet-4-5', 'skyapi', 0, 2105, 200]];
  function drawDlg() {
    var el = $('#dlg'), d = D; if (!d) return;
    if (d.type === 'install') { dlgInstall(); var f = $('[data-autofocus]', el); if (f && el.open && !el.contains(document.activeElement)) f.focus(); return; }
    el.className = ''; delete el.dataset.kind;
    var body = '', foot = '<button type="button" class="btn" data-act="d-close" data-autofocus>' + t('close') + '</button>';
    if (d.type === 'notice') {
      body = '<h2>' + t('link.' + d.reason + '.t') + '</h2><p class="lede">' + t('link.' + d.reason + '.d') + '</p>' + (d.ref ? '<div class="code" style="padding-right:11px">' + esc(d.ref) + '</div>' : '');
      if (d.reason === 'installed') foot += '<a class="btn btn-pri" href="' + libHref(A.entry(d.slug)) + '" data-act="d-go">' + t('link.view') + '</a>';
    } else if (d.type === 'uninstall') {
      var e = A.entry(d.slug), prov = e.kind === 'provider';
      var on = A.AGENTS.filter(function (a) { return e.on[a.id]; }).map(function (a) { return a.name; });
      var what = e.kind === 'skill' ? [t('un.skill.1', '~/.agent-store/skills/' + e.slug), on.length ? t('un.skill.2', on.join(S.lang === 'en' ? ', ' : '、')) : ''] : e.kind === 'mcp' ? [on.length ? t('un.mcp.1', on.join(S.lang === 'en' ? ', ' : '、')) : '', t('un.mcp.2')] : [t('un.prov.1'), on.length ? t('un.prov.2', on.join(S.lang === 'en' ? ', ' : '、')) : ''];
      body = '<h2>' + t(prov ? 'un.h.prov' : 'un.h', nameOf(e)) + '</h2><p class="lede">' + t('un.d') + '</p><ul class="steps">' + what.filter(Boolean).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + (e.replaced ? '<li>' + t('un.restore') + '</li>' : '') + '</ul>';
      foot = '<button type="button" class="btn" data-act="d-close" data-autofocus>' + t('cancel') + '</button><button type="button" class="btn btn-bad" data-act="un-confirm">' + t(prov ? 'act.delete' : 'act.uninstall') + '</button>';
    } else if (d.type === 'unfail') {
      body = '<h2>' + t('un.failed') + '</h2><div class="code" style="padding-right:11px;margin:10px 0">' + esc(d.slug) + '</div>' + banner('err', '<p style="color:var(--fg)">' + esc(d.msg) + '</p><details><summary>' + t('err.details') + '</summary><code class="mono">' + esc(d.detail) + '</code></details>') + '<p class="lede" style="margin:0">' + t('un.force.d') + '</p>';
      foot = '<button type="button" class="btn" data-act="d-close" data-autofocus>' + t('cancel') + '</button><button type="button" class="btn btn-bad" data-act="un-force">' + t('un.force') + '</button>';
    } else if (d.type === 'signin') {
      if (d.phase === 'wait') {
        body = '<div class="wait"><span class="spin"></span><h2>' + t('auth.wait.t') + '</h2><p class="lede" style="margin:0;max-width:40ch">' + t('auth.wait.d', d.provider) + '</p><button type="button" class="btn btn-sm" data-act="auth-done" style="border-style:dashed;border-color:rgba(255,184,107,.6);color:var(--warn);margin-top:8px">' + t('auth.sim') + '</button></div>';
        foot = '<button type="button" class="btn" data-act="d-close">' + t('cancel') + '</button><button type="button" class="btn" data-act="auth-reopen" data-autofocus>' + t('auth.reopen') + '</button>';
      } else {
        body = '<h2>' + t('auth.t') + '</h2><p class="lede">' + t('auth.d') + '</p><button type="button" class="auth-btn" data-act="auth" data-arg="GitHub" data-autofocus>' + ic('github') + t('auth.with', 'GitHub') + '</button><button type="button" class="auth-btn" data-act="auth" data-arg="Google">' + ic('google') + t('auth.with', 'Google') + '</button><p style="font-size:12px;color:var(--fg3);margin-top:8px">' + t('auth.note') + '</p>';
        foot = '<button type="button" class="btn" data-act="d-close">' + t('cancel') + '</button>';
      }
    } else if (d.type === 'reqlog') {
      el.className = 'wide';
      body = '<h2>' + t('relay.log.t') + ' <span class="chip sample" style="vertical-align:2px">' + t('sample') + '</span></h2><p class="lede">' + t('relay.log.d') + '</p>' + (S.usage === 'empty' ? '<div class="empty" style="padding:28px">' + '<b>' + t('use.empty.t') + '</b></div>' : '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + t('log.time') + '</th><th>Agent</th><th>' + t('use.model') + ' → ' + t('kind.provider') + '</th><th class="num">' + t('log.latency') + '</th><th class="num">' + t('log.status') + '</th></tr></thead><tbody>' + REQS.map(function (r) {
        return '<tr><td class="mono" style="font-size:12px">' + r[0] + '</td><td>' + agentName(r[1]) + '</td><td class="mono" style="font-size:12px">' + r[2] + ' → ' + r[3] + (r[4] ? ' <span class="chip warn">' + t('log.fallback') + '</span>' : '') + '</td><td class="num">' + num(r[5]) + ' ms</td><td class="num" style="color:var(--' + (r[6] < 400 ? 'provider' : 'bad') + ')">' + r[6] + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    } else if (d.type === 'activity') {
      el.className = 'wide';
      body = '<h2>' + t('log.title') + '</h2><p class="lede">' + t('log.d') + '</p>' + (S.log.length ? '<div class="code logl" style="padding-right:11px;max-height:320px;overflow:auto">' + S.log.map(function (l) { return '<span class="' + l[1] + '">' + esc(l[0]) + '</span>'; }).join('\n') + '</div>' : '<div class="empty" style="padding:28px"><b>' + t('log.none') + '</b><p>' + t('log.none.d') + '</p></div>');
      if (S.log.length) foot = '<button type="button" class="btn" data-act="clearlog">' + t('log.clear') + '</button><span class="sp"></span>' + foot;
    } else if (d.type === 'pj-new') {
      var rel = d.relocate ? A.project(d.relocate) : null;
      body = '<h2>' + (rel ? t('pj.rel.h', esc(rel.name)) : t('pj.new.h')) + '</h2><p class="lede">' + t(rel ? 'pj.rel.d' : 'pj.new.d') + '</p>' +
        '<div class="fld"><label for="pj-path">' + t('pj.new.path') + '</label><input class="inp mono' + (d.err ? ' bad' : '') + '" id="pj-path" autocomplete="off" spellcheck="false" value="' + esc(d.path || '') + '" placeholder="~/code/my-repo" data-autofocus' + (d.err ? ' aria-invalid="true" aria-describedby="pj-err"' : '') + '>' + (d.err ? '<p class="hint bad" id="pj-err" role="alert">' + d.err + '</p>' : '') + '</div>' +
        '<div class="fld" style="margin-bottom:0"><span class="lb">' + t('pj.new.pick') + '<span class="chip sample">' + t('pj.new.proto') + '</span></span><div class="picks">' + PICKS.map(function (x) { return '<button type="button" class="chip mono" data-act="pj-pick" data-arg="' + x + '" aria-pressed="' + (d.path === x) + '">' + x + '</button>'; }).join('') + '</div></div>';
      foot = '<button type="button" class="btn" data-act="' + (d.ret ? 'pj-back' : 'd-close') + '">' + t(d.ret ? 'back' : 'cancel') + '</button><button type="button" class="btn btn-pri" data-act="pj-save">' + t(rel ? 'pj.rel.go' : 'pj.add') + '</button>';
    } else if (d.type === 'pj-remove') {
      var rp = A.project(d.pid);
      body = '<h2>' + t('pj.rm.h', esc(rp.name)) + '</h2><p class="lede">' + t('pj.rm.d') + '</p><ul class="steps"><li>' + t('pj.rm.1') + '</li><li>' + esc(t('pj.rm.2', rp.path)) + '</li></ul>';
      foot = '<button type="button" class="btn" data-act="d-close" data-autofocus>' + t('cancel') + '</button><button type="button" class="btn btn-bad" data-act="pj-rm-go">' + t('pj.rm') + '</button>';
    } else if (d.type === 'pj-un') {
      var up = A.project(d.pid), ux = A.projItem(up, d.key), ul = [];
      if (ux.kind === 'skill') A.AGENTS.forEach(function (a) { if (ux.on[a.id]) ul.push(t('un.skill.1', up.path + '/' + PDIR[a.id] + '/' + ux.name)); });
      else { A.AGENTS.forEach(function (a) { if (ux.on[a.id]) ul.push(t('pj.un.mcp', up.path + '/' + PMCP[a.id])); }); if (Object.keys(ux.vars || {}).length) ul.push(t('pj.un.vars')); if (projOver(ux)) ul.push(t('pj.un.over', ux.name)); }
      body = '<h2>' + t('pj.un.h', esc(ux.name), esc(up.name)) + '</h2><p class="lede">' + t('un.d') + '</p><ul class="steps" data-kind="' + ux.kind + '">' + ul.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul><p class="loc-note">' + t('pj.un.vcs') + '</p>';
      foot = '<button type="button" class="btn" data-act="d-close" data-autofocus>' + t('cancel') + '</button><button type="button" class="btn btn-bad" data-act="pj-un-go">' + t('act.uninstall') + '</button>';
    } else if (d.type === 'pj-vars') {
      var vx = A.projItem(A.project(d.pid), d.key);
      body = '<h2>' + t('pj.vars.h', esc(vx.name)) + '</h2><p class="lede">' + t('pj.vars.d') + '</p>' + projNeeds(vx).map(function (k, i) {
        return '<div class="fld"><label for="pv-' + i + '">' + esc(k) + '</label><input class="inp mono" id="pv-' + i + '" type="password" autocomplete="off" data-pv="' + esc(k) + '" value="' + esc((vx.vars || {})[k] || '') + '" placeholder="' + esc(k) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + (vx.on.claude ? '<p class="hint">' + t('pj.vars.ref') + ' <code class="mono">${' + esc(k) + '}</code></p>' : '') + '</div>';
      }).join('');
      foot = '<button type="button" class="btn" data-act="d-close">' + t('cancel') + '</button><button type="button" class="btn btn-pri" data-act="pj-vars-save">' + t('save') + '</button>';
    } else if (d.type === 'shortcuts') {
      var m = S.platform === 'mac' ? '⌘' : 'Ctrl';
      body = '<h2>' + t('keys.t') + '</h2><table class="tbl" style="margin-top:8px"><tbody>' + [[m + ' K', 'keys.palette'], [m + ' 1 – 6', 'keys.nav'], [m + ' ,', 'keys.settings'], ['/', 'keys.search'], ['↑ ↓', 'keys.list'], ['Enter', 'keys.open'], ['Esc', 'keys.esc'], ['Tab', 'keys.tab'], ['?', 'keys.help']].map(function (k) { return '<tr><td><kbd class="kbd">' + k[0] + '</kbd></td><td>' + t(k[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    el.innerHTML = '<div class="dl-b">' + body + '</div><div class="dl-f">' + foot + '</div>';
  }

  /* ---------- 安装流程 ---------- */
  function openInstall(id, from) {
    var it = A.item(id); if (!it) return;
    var d = { type: 'install', it: it, from: from || 'app', ref: id, step: from === 'web' ? 'loading' : 'targets', tg: {}, vals: {}, slug: slugFor(it), prog: [] };
    var into = d.from === 'app' && it.kind !== 'provider' ? intoProj() : null;
    d.loc = into && !projHas(into, it) && !A.projItem(into, projKey(it)) ? into.id : '';
    initTg(d);
    openDlg(d);
    if (from === 'web') setTimeout(function () { if (D === d) { d.step = 'targets'; drawDlg(); var f = $('#dlg [data-autofocus]'); if (f) f.focus(); } }, 800);
  }
  function initTg(d) { A.AGENTS.forEach(function (a) { d.tg[a.id] = !tgReason(d.it, a, null, d.loc); }); }
  function runInstall() {
    var d = D, it = d.it, steps = [], lp = d.loc ? A.project(d.loc) : null;
    if (lp) {
      steps.push({ text: t('p.pj.fetch') + ' ' + it.id });
      if (it.kind === 'skill') A.AGENTS.forEach(function (a) { if (d.tg[a.id]) steps.push({ text: t('p.mcp.write') + ' ' + lp.path + '/' + PDIR[a.id] + '/' + it.name }); });
      else {
        A.AGENTS.forEach(function (a) { if (d.tg[a.id]) steps.push({ text: t('p.mcp.write') + ' ' + lp.path + '/' + PMCP[a.id] + ' › ' + PKEY[a.id] + '.' + d.slug }); });
        if (A.needs(it).length) steps.push(d.skip ? { text: t('p.pj.vars'), skip: true, note: t('p.pj.novars') } : { text: t('p.pj.vars') });
      }
      d.prog = steps; d.i = 0; d.step = 'progress'; d.resolved = false; d.skipped = d.replaced = null;
      log(t('log.pj.install', it.name, lp.path));
      return tick();
    }
    steps.push({ text: it.kind === 'skill' ? t('w.skill.fetch') + ' ~/.agent-store/skills/' + d.slug : t('p.record') + ' ~/.agent-store/' + (it.kind === 'mcp' ? 'mcps/' : 'providers/') + d.slug });
    A.AGENTS.forEach(function (a) {
      if (!d.tg[a.id]) return;
      var s = { agent: a.id, text: it.kind === 'skill' ? t('p.skill.link') + ' ' + a.skills + '/' + it.name : it.kind === 'mcp' ? t('p.mcp.write') + ' ' + a.mcp + ' › ' + a.mcpKey + '.' + d.slug : t('p.prov.wire', a.name) };
      if (d.skip) { s.skip = true; s.note = t('p.skipcfg'); }
      steps.push(s);
    });
    d.prog = steps; d.i = 0; d.step = 'progress'; d.resolved = false; d.skipped = d.replaced = null;
    log('$ aas install ' + it.id);
    tick();
  }
  function tick() {
    var d = D; if (!d || d.type !== 'install') return;
    if (d.i >= d.prog.length) return finish();
    var s = d.prog[d.i];
    if (S.offline) { s.st = 'bad'; d.step = 'failed'; d.err = t('err.catalogDown'); log('✗ CatalogUnavailableError', 'er'); return drawDlg(); }
    if (s.skip) { s.st = 'skip'; d.i++; return tick(); }
    if (!d.loc && s.agent === 'claude' && d.it.id.indexOf('front-end-checklist') > -1 && !d.resolved) { s.st = 'run'; d.step = 'conflict'; drawDlg(); var f = $('#dlg [data-autofocus]'); if (f) f.focus(); return; }
    s.st = 'run'; drawDlg();
    setTimeout(function () { if (D !== d) return; s.st = 'ok'; d.i++; tick(); }, 620);
  }
  function finish() {
    var d = D, it = d.it, on = {}, cfg = {};
    if (d.loc) {
      var lp = A.project(d.loc), x = { key: projKey(it), kind: it.kind, name: projKey(it), id: it.id, ours: true, version: it.version, on: {} };
      A.AGENTS.forEach(function (a) { x.on[a.id] = !!d.tg[a.id]; });
      if (it.kind === 'mcp') { x.vars = {}; if (!d.skip) Object.keys(d.vals).forEach(function (k) { if (d.vals[k]) x.vars[k] = d.vals[k]; }); }
      lp.items.push(x); d.pkey = x.key; A.save();
      log('✓ ' + t('log.pj.installed', x.name, lp.name), 'ok');
      d.step = 'done'; drawDlg(); renderBehind();
      var pf = $('#dlg [data-autofocus]'); if (pf) pf.focus();
      return;
    }
    A.AGENTS.forEach(function (a) { on[a.id] = !!d.tg[a.id] && !d.skip && d.skipped !== a.id; });
    Object.keys(d.vals).forEach(function (k) { if (d.vals[k]) cfg[k] = d.vals[k]; });
    var e = { slug: d.slug, id: it.id, kind: it.kind, version: it.version, on: on, cfg: cfg };
    if (it.kind === 'skill') e.deploy = it.name;
    if (it.kind === 'provider') { var base = A.entryFor(it.id); cfg.name = it.name + (base ? ' ' + (S.installed.filter(function (x) { return x.id === it.id; }).length + 1) : ''); cfg.level = it.level || 1; if (base) e.parent = base.slug; }
    if (d.replaced) e.replaced = d.replaced;
    S.installed.push(e); A.save();
    log('✓ ' + t('st.installed') + ' ' + e.slug + ' ' + ver(e.version), 'ok');
    d.step = 'done'; drawDlg(); renderBehind();
    var f = $('#dlg [data-autofocus]'); if (f) f.focus();
  }
  function renderBehind() { renderSide(); renderMain(); renderPane(); }

  /* ---------- 网页安装链接 ---------- */
  var LINKS = { skill: 'agent-store://install?id=github:mattpocock/skills/handoff', mcp: 'agent-store://install?id=mcp-registry:ai.admux/admux', conflict: 'agent-store://install?id=mcp-registry:io.github.thedaviddias/front-end-checklist', sse: 'agent-store://install?id=mcp-registry:io.github.humanjesse/textarttools-mcp', provider: 'agent-store://install?id=builtin:openrouter', installed: 'agent-store://install?id=mcp-registry:io.github.upstash/context7', unknown: 'agent-store://install?id=mcp-registry:io.github.example/not-in-catalog', malformed: 'agent-store://install?pkg=../../etc&run=1', mismatch: 'agent-store://install?id=github:mattpocock/skills/handoff&category=mcp' };
  function incoming(raw) {
    U.menu = false; U.pc = false;
    var m = /^agent-store(?:-dev)?:\/\/([a-z-]+)\/?(?:\?(.*))?$/.exec(raw || '');
    if (!m || m[1] !== 'install') return openDlg({ type: 'notice', reason: 'invalid', ref: raw });
    var p = new URLSearchParams(m[2] || ''), id = p.get('id'), cat = p.get('category');
    if (!id || !/^(mcp-registry|github|builtin):[A-Za-z0-9._~@/-]{1,300}$/.test(id) || (cat && ['provider', 'skill', 'mcp'].indexOf(cat) < 0)) return openDlg({ type: 'notice', reason: 'invalid', ref: raw });
    if (S.offline) return openDlg({ type: 'notice', reason: 'catalogError', ref: id });
    var it = A.item(id);
    if (!it) return openDlg({ type: 'notice', reason: 'notFound', ref: id });
    if (cat && cat !== it.kind) return openDlg({ type: 'notice', reason: 'mismatch', ref: id });
    var e = A.entryFor(id);
    if (e && it.kind !== 'provider') return openDlg({ type: 'notice', reason: 'installed', ref: id, slug: e.slug });
    if (R.view !== 'welcome') history.replaceState(null, '', href('discover', id)), render();
    openInstall(id, 'web');
  }

  /* ---------- 命令面板 ---------- */
  function palItems(q) {
    q = q.toLowerCase().trim();
    var out = [], hit = function (s) { return !q || s.toLowerCase().indexOf(q) > -1; };
    var mod = S.platform === 'mac' ? '⌘' : 'Ctrl';
    [['discover', 'discover'], ['skills', 'skill'], ['mcp', 'mcp'], ['providers', 'provider'], ['usage', 'usage'], ['settings', 'settings']].forEach(function (n, i) {
      if (hit(t('nav.' + n[0]) + ' ' + n[0])) out.push({ g: 'pal.go', icon: n[1], label: t('nav.' + n[0]), hint: mod + ' ' + (i + 1), run: function () { go(n[0]); } });
    });
    if (hit(t('nav.projects') + ' projects')) out.push({ g: 'pal.go', icon: 'folder', label: t('nav.projects'), run: function () { go('projects'); } });
    [['pj.add', 'plus', function () { act('pj-new'); }], ['upd.check', 'sync', function () { act('check'); }], [S.signedIn ? 'acct.signout' : 'acct.signin', 'user', function () { act(S.signedIn ? 'signout' : 'signin'); }], ['pal.lang', 'globe', function () { act('lang', S.lang === 'zh' ? 'en' : 'zh'); }], [S.relay ? 'relay.stop' : 'relay.start', 'provider', function () { act('relay'); }], ['log.title', 'term', function () { openDlg({ type: 'activity' }); }], ['relay.log', 'term', function () { openDlg({ type: 'reqlog' }); }], ['keys.t', 'kbd', function () { openDlg({ type: 'shortcuts' }); }], ['set.agents', 'settings', function () { go('settings', 'agents'); }]].forEach(function (a) {
      if (hit(t(a[0]))) out.push({ g: 'pal.act', icon: a[1], label: t(a[0]), run: a[2] });
    });
    if (q) {
      S.projects.forEach(function (p) {
        if (hit(p.name + ' ' + p.path)) out.push({ g: 'pal.proj', icon: 'folder', label: p.name, hint: p.path, run: function () { go('project', p.id); } });
        p.items.forEach(function (x) { if (hit(x.name)) out.push({ g: 'pal.proj', kind: x.kind, label: x.name, hint: t('pj.in', p.name), run: function () { go('project', p.id); } }); });
      });
      S.installed.forEach(function (e) { if (hit(nameOf(e) + ' ' + e.slug)) out.push({ g: 'pal.inst', kind: e.kind, label: nameOf(e), hint: t('kind.' + e.kind), run: function () { location.hash = libHref(e); } }); });
      AS_DATA.filter(function (it) { return hit(it.name + ' ' + (it.author || '')) || it.description.toLowerCase().indexOf(q) > -1; }).slice(0, 6).forEach(function (it) {
        out.push({ g: 'pal.cat', kind: it.kind, label: it.name, hint: (it.author || '') + (A.entryFor(it.id) ? ' · ' + t('st.installed') : ''), run: function () { go('discover', it.id); } });
      });
      out.push({ g: 'pal.cat', icon: 'search', label: t('pal.searchfor', q), run: function () { go('discover', '', { q: q }); } });
    }
    return out;
  }
  var PAL = [];
  function drawPalList() {
    var q = $('#pal-q').value; PAL = palItems(q);
    if (U.palSel >= PAL.length) U.palSel = Math.max(0, PAL.length - 1);
    var g = '', html = PAL.map(function (o, i) {
      var head = o.g !== g ? '<div class="pal-g">' + t(o.g) + '</div>' : ''; g = o.g;
      return head + '<button type="button" class="pal-o" role="option" id="po-' + i + '" aria-selected="' + (i === U.palSel) + '" data-pal="' + i + '"' + (o.kind ? ' data-kind="' + o.kind + '"' : '') + '>' + (o.kind ? tile(o.kind, 'sm') : ic(o.icon)) + '<span class="t">' + esc(o.label) + '</span>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</button>';
    }).join('');
    $('#pal-l').innerHTML = html || '<div class="pal-g">' + t('pal.none') + '</div>';
    $('#pal-q').setAttribute('aria-activedescendant', 'po-' + U.palSel);
    var sel = $('#po-' + U.palSel); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function openPal() {
    var el = $('#pal'); if (el.open) return el.close();
    if ($('#dlg').open) return;
    U.palSel = 0; U.menu = false;
    el.innerHTML = '<div class="pal-in">' + ic('search') + '<input id="pal-q" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="pal-l" placeholder="' + t('pal.ph') + '" aria-label="' + t('pal.ph') + '"><kbd class="kbd">Esc</kbd></div><div class="pal-l" id="pal-l" role="listbox"></div><div class="pal-f"><span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd>' + t('pal.move') + '</span><span><kbd class="kbd">Enter</kbd>' + t('pal.run') + '</span></div>';
    el.showModal(); drawPalList(); $('#pal-q').focus();
  }
  function runPal(i) { var o = PAL[i]; if (!o) return; $('#pal').close(); o.run(); }

  /* ---------- 原型控制 ---------- */
  function renderPc() {
    function seg(key, opts) { return '<div class="seg">' + opts.map(function (o) { return '<button type="button" data-act="pc" data-arg="' + key + '|' + o[0] + '" aria-pressed="' + (String(S[key]) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
    function row(label, html) { return '<div class="pc-r"><span>' + label + '</span>' + html + '</div>'; }
    var panel = !U.pc ? '' : '<div class="pc-panel" role="group" aria-label="' + t('pc.t') + '"><h4><span>' + t('pc.t') + '</span><a href="ux.html" style="color:var(--fg2);text-decoration:underline">' + t('pc.ux') + '</a></h4>' +
      row(t('pc.auth'), seg('signedIn', [[false, t('pc.out')], [true, t('pc.in')]])) +
      row(t('pc.plan'), seg('plan', [['free', 'Free'], ['pro', 'Pro']])) +
      row(t('pc.agents'), seg('agents', [['both', t('pc.both')], ['claude', t('pc.claude')], ['none', t('pc.none')]])) +
      row(t('pc.platform'), seg('platform', [['mac', 'macOS'], ['win', 'Windows'], ['linux', 'Linux']])) +
      row(t('pc.size'), seg('size', [['auto', t('pc.auto')], ['full', '1200×764'], ['narrow', '900×640']])) +
      row(t('pc.lang'), seg('lang', [['zh', '中文'], ['en', 'English']])) +
      row(t('pc.projects'), '<div class="seg">' + [['sample', t('pc.projects.sample')], ['none', t('pc.projects.none')]].map(function (o) { return '<button type="button" data-act="pc-projects" data-arg="' + o[0] + '" aria-pressed="' + ((S.projects.length ? 'sample' : 'none') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>') +
      row(t('pc.trust'), '<div class="seg">' + [['no', t('pc.trust.no')], ['yes', t('pc.trust.yes')]].map(function (o) { var tp = A.project('agent-store'); return '<button type="button" data-act="pc-trust" data-arg="' + o[0] + '"' + (tp ? '' : ' disabled') + ' aria-pressed="' + (!!tp && (tp.codexUntrusted ? 'no' : 'yes') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>') +
      row(t('pc.net'), seg('offline', [[false, t('pc.online')], [true, t('pc.offline')]])) +
      row(t('pc.link'), '<div class="fld-row"><select class="inp" id="sim" aria-label="' + t('pc.link') + '">' + Object.keys(LINKS).map(function (k) { return '<option value="' + k + '">' + t('pc.link.' + k) + '</option>'; }).join('') + '</select><button type="button" class="btn btn-sm" data-act="sim">' + t('pc.send') + '</button></div>') +
      '<div class="fld-row"><button type="button" class="btn btn-sm" data-act="rewelcome" style="flex:1">' + t('set.welcome.btn') + '</button><button type="button" class="btn btn-sm btn-bad" data-act="reset" style="flex:1">' + t('pc.reset') + '</button></div></div>';
    $('#pc').innerHTML = panel + '<button type="button" class="pc-btn" data-act="pc-toggle" aria-expanded="' + U.pc + '">' + ic('settings').replace('<svg', '<svg width="14" height="14"') + t('pc.btn') + '</button>';
  }

  /* ---------- 渲染 ---------- */
  var VIEWS = { discover: viewDiscover, skills: function () { return viewLib('skill'); }, mcp: function () { return viewLib('mcp'); }, providers: viewProviders, usage: viewUsage, settings: viewSettings, projects: viewProjects, project: viewProject, welcome: function () { return ''; } };
  function renderMain() { $('#main').innerHTML = (VIEWS[R.view] || function () { return '<div class="view">' + empty('mcp', t('nf.t'), t('nf.d'), '<a class="btn btn-pri" href="' + href('discover') + '">' + t('nav.discover') + '</a>') + '</div>'; })(); }
  function renderPane() {
    var p = $('#pane'), html = '';
    if (R.arg && R.view === 'discover') { var it = A.item(R.arg); html = it ? paneCatalog(it) : '<div class="pane-top"><span>' + esc(R.arg) + '</span><a class="btn btn-sm btn-ic" href="' + href('discover') + '" aria-label="' + t('close') + '">' + ic('x') + '</a></div><div class="pane-body">' + empty('mcp', t('link.notFound.t'), t('link.notFound.d')) + '</div>'; }
    else if (R.arg && /^(skills|mcp|providers)$/.test(R.view)) { var e = A.entry(R.arg); if (e) html = e.kind === 'skill' ? paneSkill(e) : e.kind === 'mcp' ? paneMcp(e) : paneProvider(e); }
    p.hidden = !html; p.innerHTML = html; $('#main').classList.toggle('has-pane', !!html);
  }
  function focusKey(el) { if (!el || el === document.body) return null; if (el.id) return '#' + el.id; if (el.dataset && el.dataset.act) return '[data-act="' + el.dataset.act + '"]' + (el.dataset.arg != null ? '[data-arg="' + CSS.escape(el.dataset.arg) + '"]' : ''); if (el.dataset && el.dataset.cfg) return '[data-cfg="' + CSS.escape(el.dataset.cfg) + '"]'; if (el.getAttribute && el.getAttribute('href')) return 'a[href="' + CSS.escape(el.getAttribute('href')) + '"]'; return null; }
  function render() {
    R = parse();
    if (!VIEWS[R.view] && !R.view) { location.replace(href(S.onboarded ? 'discover' : 'welcome')); return; }
    if (U.err && U.err.slug !== R.arg) U.err = null;
    document.documentElement.lang = S.lang === 'en' ? 'en' : 'zh-CN';
    document.title = t('title');
    var key = $('#dlg').open || $('#pal').open ? null : focusKey(document.activeElement);
    renderTb(); renderSide(); renderMain(); renderPane(); renderOb(); renderSb(); renderPc(); fit();
    if (key) { var el = $(key); if (el && !el.disabled) el.focus({ preventScroll: true }); }
    /* 可链接的浮层状态 */
    var q = R.q, strip = function () { var c = {}; Object.keys(q).forEach(function (k) { if (['do', 'link', 'dlg', 'palette'].indexOf(k) < 0) c[k] = q[k]; }); history.replaceState(null, '', href(R.view, R.arg, c)); R = parse(); };
    if (q.do === 'install' && R.arg) { strip(); openInstall(R.arg, 'app'); }
    else if (q.do === 'uninstall' && R.arg && A.entry(R.arg)) { strip(); openDlg({ type: 'uninstall', slug: R.arg }); }
    else if (q.link) { var l = q.link; strip(); incoming(LINKS[l] || l); }
    else if (q.dlg) { var x = q.dlg; strip(); openDlg(x === 'signin' ? { type: 'signin', phase: 'pick' } : x === 'waiting' ? { type: 'signin', phase: 'wait', provider: 'GitHub' } : { type: x }); }
    else if (q.palette) { strip(); openPal(); }
  }

  /* ---------- 动作 ---------- */
  function doToggle(slug, agent, force) {
    var e = A.entry(slug), it = A.item(e.id), on = !!e.on[agent], name = agentName(agent), view = e.kind === 'skill' ? 'skills' : e.kind === 'mcp' ? 'mcp' : 'providers';
    function fail(x) { x.slug = slug; U.err = x; if (R.arg === slug && R.view === view) render(); else go(view, slug); }
    U.err = null;
    if (!on) {
      var b = A.blocker(it, agent, e.cfg);
      if (b === 'needs-config' || b === 'no-key') { fail({ lead: t('err.enable', name), msg: t(b === 'no-key' ? 'err.noKey' : 'err.needsConfig') }); setTimeout(function () { var f = $('#pane input[type=password], #pane input[data-cfg$="apiKey"]'); if (f) f.focus(); }, 60); return; }
      if (e.kind === 'provider' && !S.relay && e.slug !== 'local') return fail({ lead: t('err.enable', name), msg: t('err.relayDown') });
      if (e.clash === agent && !force) return fail({ lead: t('err.enable', name), msg: t('err.deployRefused', name), detail: 'SkillDeployRefusedError (reason: not-ours, state: real-directory, tool: ' + agent + ')', force: 'toggle|' + slug + '|' + agent, forceLabel: t('act.forceenable') });
    } else if (e.changed === agent) return fail({ lead: t('err.disable', name), msg: t('err.changedOutside', name), detail: 'McpChangedOutsideError (tool: ' + agent + ')' });
    U.busy[slug + agent] = 1; render();
    setTimeout(function () {
      delete U.busy[slug + agent]; e.on[agent] = !on; if (force) delete e.clash; A.save();
      log('$ aas ' + (on ? 'disable' : 'enable') + ' ' + slug + ' --for ' + agent + (force ? ' --force' : ''));
      toast(t(on ? 'toast.disabled' : 'toast.enabled', nameOf(e), name)); render();
    }, 420);
  }
  function remove(slug, force) {
    var e = A.entry(slug), nm = nameOf(e), view = e.kind === 'skill' ? 'skills' : e.kind === 'mcp' ? 'mcp' : 'providers';
    S.installed = S.installed.filter(function (x) { return x.slug !== slug && x.parent !== slug; }); A.state = S; A.save();
    log('$ aas uninstall ' + slug + (force ? ' --force' : '')); log('✓ ' + t('toast.uninstalled', nm), 'ok');
    var el = $('#dlg'); D = null; if (el.open) el.close();
    toast(t('toast.uninstalled', nm)); go(view);
  }
  function update(slug, quiet) { var e = A.entry(slug); if (!e || !e.latest) return; e.version = e.latest; delete e.latest; A.save(); log('$ aas update ' + slug); log('✓ ' + slug + ' ' + ver(e.version), 'ok'); if (!quiet) { toast(t('toast.updated', nameOf(e), ver(e.version))); render(); } }
  function shut() { var el = $('#dlg'); D = null; if (el.open) el.close(); }
  function cfgOf(slug) { var e = A.entry(slug); e.cfg = e.cfg || {}; return e.cfg; }
  function flashSaved() { var s = $('#saved'); if (!s) return; s.classList.add('on'); clearTimeout(flashSaved.t); flashSaved.t = setTimeout(function () { s.classList.remove('on'); }, 1600); }

  function act(name, arg, el) {
    var p = (arg || '').split('|'), e, c;
    switch (name) {
      case 'win': toast(t('proto.win')); break;
      case 'palette': openPal(); break;
      case 'menu': U.menu = !U.menu; renderSide(); if (U.menu) { var f = $('.acct-menu button, .acct-menu a'); if (f) f.focus(); } else $('.acct').focus(); break;
      case 'signin': U.menu = false; openDlg({ type: 'signin', phase: 'pick' }); break;
      case 'signout': S.signedIn = false; S.plan = 'free'; U.menu = false; A.save(); toast(t('toast.signedout')); render(); break;
      case 'upgrade': U.menu = false; ext('agent-store.example/pricing'); renderSide(); break;
      case 'manage': U.menu = false; ext('agent-store.example/dashboard/subscription'); renderSide(); break;
      case 'dlg': openDlg({ type: arg }); break;
      case 'copy': copy(arg); break;
      case 'ext': ext(arg); break;
      case 'storepage': e = A.item(arg); ext('agent-store.example/store/' + e.kind + '/' + arg); break;
      case 'reveal-dir': toast(t('toast.showdir', arg)); break;
      case 'fav': c = S.favs.indexOf(arg); if (c > -1) S.favs.splice(c, 1); else S.favs.push(arg); A.save(); toast(t(c > -1 ? 'fav.removed' : 'fav.added')); render(); break;
      case 'install': openInstall(arg, 'app'); break;
      case 'update': update(arg); break;
      case 'updateall': c = ofKind(arg).filter(function (x) { return x.latest; }); c.forEach(function (x) { update(x.slug, true); }); toast(t('toast.updatedall', c.length)); render(); break;
      case 'check':
        if (S.offline) { U.updMsg = t('upd.failed'); toast(t('upd.failed'), { err: true }); render(); break; }
        U.updMsg = t('upd.checking'); render();
        setTimeout(function () { var n = updates().length; U.updMsg = n ? t('upd.n', n) : t('upd.none'); log('$ aas update --check'); toast(U.updMsg); render(); }, 700); break;
      case 'toggle': doToggle(p[0], p[1]); break;
      case 'force': if (p[0] === 'toggle') doToggle(p[1], p[2], true); break;
      case 'dismiss': U.err = null; render(); break;
      case 'kind': c = keepQ(); if (arg) c.kind = arg; else delete c.kind; go('discover', R.arg, c); break;
      case 'clearq': go('discover'); break;
      case 'more': toast(t('disc.more.proto')); break;
      case 'retry': if (S.offline) toast(t('off.still'), { err: true }); else go(R.view, R.arg, keepQ()); break;
      case 'libf': U.lib[p[0]].f = p[1]; render(); break;
      case 'libclear': U.lib[arg] = { q: '', f: 'all' }; render(); break;
      case 'reveal': U.reveal[p[0] + p[1]] = !U.reveal[p[0] + p[1]]; render(); break;
      case 'uninstall': openDlg({ type: 'uninstall', slug: arg }); break;
      case 'un-confirm':
        e = A.entry(D.slug);
        if (e.edited) openDlg({ type: 'unfail', slug: e.slug, msg: t('err.skillChanged'), detail: 'SkillConflictError (reason: changed)' });
        else if (e.changed) openDlg({ type: 'unfail', slug: e.slug, msg: t('err.changedOutsideUn', agentName(e.changed)), detail: 'McpChangedOutsideError (tool: ' + e.changed + ')' });
        else remove(e.slug);
        if (D && D.type === 'unfail') log('✗ aas uninstall ' + e.slug, 'er');
        break;
      case 'un-force': remove(D.slug, true); break;
      case 'dup':
        e = A.entry(arg); c = JSON.parse(JSON.stringify(e)); var n = 2; while (A.entry((e.parent || e.slug) + '-' + n)) n++;
        c.slug = (e.parent || e.slug) + '-' + n; c.parent = e.parent || e.slug; c.cfg.name = (A.item(e.id) || {}).name + ' ' + n; c.cfg.apiKey = ''; c.on = { claude: false, codex: false };
        S.installed.push(c); A.save(); log('$ aas install ' + e.id); toast(t('toast.dup', c.cfg.name)); go('providers', c.slug); break;
      case 'move':
        c = provs(); var i = c.findIndex(function (x) { return x.slug === p[0]; }), j = i + Number(p[1]);
        if (j < 0 || j >= c.length) break;
        var tmp = c[i]; c[i] = c[j]; c[j] = tmp; c.forEach(function (x, k) { x.cfg.level = k + 1; }); A.save();
        toast(t('toast.level', nameOf(tmp), tmp.cfg.level)); render(); break;
      case 'relay': S.relay = !S.relay; A.save(); log('$ aas relay ' + (S.relay ? 'start' : 'stop')); toast(t(S.relay ? 'toast.relay.on' : 'toast.relay.off')); render(); break;
      case 'recover': U.recovered = true; toast(t('toast.recovered')); render(); break;
      case 'addkey': c = cfgOf(arg); (c.apiKeys = c.apiKeys || []).push(''); A.save(); render(); break;
      case 'delkey': cfgOf(p[0]).apiKeys.splice(Number(p[1]), 1); A.save(); render(); break;
      case 'addwl': c = cfgOf(arg); var w = $('#wl').value.trim(); if (!w) { $('#wl').focus(); break; } (c.whitelist = c.whitelist || []).push(w); A.save(); render(); flashSaved(); break;
      case 'delwl': cfgOf(p[0]).whitelist.splice(Number(p[1]), 1); A.save(); render(); break;
      case 'addmap': c = cfgOf(arg); var mf = $('#mapf').value.trim(), mt = $('#mapt').value.trim(); if (!mf || !mt) { $(mf ? '#mapt' : '#mapf').focus(); break; } (c.modelMapping = c.modelMapping || {})[mf] = mt; A.save(); render(); flashSaved(); break;
      case 'delmap': delete cfgOf(p[0]).modelMapping[p[1]]; A.save(); render(); break;
      case 'cfgflag': c = cfgOf(p[0]); c[p[1]] = !c[p[1]]; A.save(); render(); flashSaved(); break;
      case 'usedata': S.usage = arg; A.save(); go('usage'); break;
      case 'period': U.period = arg; render(); break;
      case 'setbudget': c = Number($('#budget').value); S.budget = c > 0 ? c : null; A.save(); toast(t(S.budget ? 'toast.budget' : 'toast.budget.off')); render(); break;
      case 'export': toast(t('toast.export', '~/.agent-store/exports/usage-2026-11-13.' + arg)); log('✓ export usage-2026-11-13.' + arg, 'ok'); break;
      case 'nav': location.hash = arg; break;
      case 'lang': S.lang = arg; A.save(); render(); break;
      case 'rewelcome': S.onboarded = false; U.pc = false; A.save(); go('welcome'); break;
      case 'redetect': toast(t('toast.detect', (S.agents === 'both' ? 2 : S.agents === 'claude' ? 1 : 0))); break;
      case 'doctor': U.doctor = true; log('$ aas doctor'); render(); break;
      case 'start': S.onboarded = true; A.save(); go('discover'); break;
      case 'pc-toggle': U.pc = !U.pc; renderPc(); break;
      case 'pc': S[p[0]] = p[1] === 'true' ? true : p[1] === 'false' ? false : p[1]; if (p[0] === 'signedIn' && !S.signedIn) S.plan = 'free'; if (p[0] === 'plan' && p[1] === 'pro') S.signedIn = true; A.save(); render(); break;
      case 'sim': c = $('#sim') ? $('#sim').value : arg; U.pc = false; renderPc(); incoming(LINKS[c] || LINKS.skill); break;
      case 'reset': A.reset(); S = A.state; U = { menu: false, pc: false, loading: false, err: null, reveal: {}, lib: {}, period: '7', busy: {}, updMsg: '' }; toast(t('pc.reset.done')); go('welcome'); break;
      case 'pc-projects': S.projects = arg === 'none' ? [] : A.seedProjects(); A.save(); if (R.view === 'project' && !A.project(R.arg)) go('projects'); else render(); break;
      case 'pc-trust': e = A.project('agent-store'); if (e) { if (arg === 'no') e.codexUntrusted = true; else delete e.codexUntrusted; A.save(); render(); } break;
      /* 项目 */
      case 'pj-new': U.menu = false; openDlg({ type: 'pj-new', path: '' }); break;
      case 'pj-relocate': e = A.project(arg); openDlg({ type: 'pj-new', relocate: arg, path: e.path }); break;
      case 'pj-pick': D.path = arg; D.err = null; drawDlg(); $('#pj-path').focus(); break;
      case 'pj-back': D = D.ret; drawDlg(); c = $('#d-loc'); if (c) c.focus(); break;
      case 'pj-save':
        c = ($('#pj-path').value || '').trim().replace(/(.)\/+$/, '$1'); D.path = c; D.err = null;
        if (!/^(~\/|\/)[^\s]/.test(c)) D.err = t('pj.new.err.path');
        else { e = S.projects.filter(function (x) { return x.path === c && x.id !== D.relocate; })[0]; if (e) D.err = t('pj.new.err.dup', esc(e.name)) + ' <a class="lnk" href="' + href('project', e.id) + '" data-act="d-go">' + t('pj.new.err.open') + '</a>'; }
        if (D.err) { drawDlg(); $('#pj-path').focus(); break; }
        if (D.relocate) { e = A.project(D.relocate); e.path = c; delete e.missing; A.save(); shut(); toast(t('pj.rel.done', e.name)); render(); break; }
        var base = c.split('/').pop(), pid = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'project', k = 1; while (A.project(pid)) pid = pid.replace(/-\d+$/, '') + '-' + (++k);
        S.projects.push({ id: pid, name: base, path: c, items: [] }); A.save(); log('✓ ' + t('pj.new.done', base), 'ok'); toast(t('pj.new.done', base));
        if (D.ret) { e = D.ret; e.loc = pid; initTg(e); D = e; drawDlg(); renderBehind(); $('#d-loc').focus(); }
        else { shut(); go('project', pid); }
        break;
      case 'pj-remove': openDlg({ type: 'pj-remove', pid: arg }); break;
      case 'pj-rm-go': e = A.project(D.pid); S.projects = S.projects.filter(function (x) { return x.id !== e.id; }); A.save(); shut(); log('✓ ' + t('pj.rm.done', e.name), 'ok'); toast(t('pj.rm.done', e.name)); go('projects'); break;
      case 'pj-addto': go('discover', '', { into: arg }); break;
      case 'pj-into-clear': c = keepQ(); delete c.into; go('discover', R.arg, c); break;
      case 'pj-over': U.over = U.over === arg ? null : arg; render(); break;
      case 'pj-un': openDlg({ type: 'pj-un', pid: p[0], key: p[1] }); break;
      case 'pj-un-go': e = A.project(D.pid); c = A.projItem(e, D.key); e.items = e.items.filter(function (x) { return x !== c; }); A.save(); shut(); log('✓ ' + t('log.pj.uninstalled', c.name, e.name), 'ok'); toast(t('toast.uninstalled', c.name)); render(); break;
      case 'pj-vars': openDlg({ type: 'pj-vars', pid: p[0], key: p[1] }); break;
      case 'pj-vars-save': c = A.projItem(A.project(D.pid), D.key); c.vars = {}; $$('#dlg [data-pv]').forEach(function (i) { if (i.value.trim()) c.vars[i.dataset.pv] = i.value.trim(); }); A.save(); shut(); toast(t(projMiss(c) ? 'pj.vars.partial' : 'pj.vars.saved', c.name)); render(); break;
      /* 对话框内 */
      case 'd-close': closeDlg(); break;
      case 'd-go': D = null; $('#dlg').close(); break;
      case 'tg': D.tg[arg] = !D.tg[arg]; drawDlg(); $('#dlg [data-act="tg"][data-arg="' + arg + '"]').focus(); break;
      case 'd-next': if (A.needs(D.it).length && (A.AGENTS.some(function (a) { return D.tg[a.id]; }) || D.it.kind === 'provider')) { D.step = 'vars'; drawDlg(); $('#dlg [data-autofocus]').focus(); } else runInstall(); break;
      case 'd-back': D.step = 'targets'; drawDlg(); break;
      case 'd-skip': D.skip = true; D.vals = {}; runInstall(); break;
      case 'd-install': D.skip = false; runInstall(); break;
      case 'd-retry': if (S.offline) { toast(t('off.still'), { err: true }); break; } runInstall(); break;
      case 'd-conflict':
        c = D.prog[D.i];
        if (arg === 'skip') { c.st = 'skip'; c.note = t('conf.skipped'); D.skipped = 'claude'; D.i++; }
        else { c.note = t('conf.replaced'); D.replaced = 'claude'; log('$ aas enable ' + D.slug + ' --for claude --replace'); }
        D.resolved = true; D.step = 'progress'; tick(); break;
      case 'd-open': if (D.loc) { c = D.loc; shut(); go('project', c); break; } e = A.entry(D.slug); D = null; $('#dlg').close(); location.hash = libHref(e); render(); break;
      case 'auth': D.phase = 'wait'; D.provider = arg; ext('agent-store.example/auth/desktop?provider=' + arg.toLowerCase()); drawDlg(); $('#dlg [data-autofocus]').focus(); break;
      case 'auth-reopen': ext('agent-store.example/auth/desktop?provider=' + D.provider.toLowerCase()); break;
      case 'auth-done': S.signedIn = true; A.save(); closeDlg(); toast(t('toast.signedin', 'lin@example.com')); break;
      case 'clearlog': S.log = []; A.save(); drawDlg(); renderSb(); break;
    }
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (ev) {
    var pal = ev.target.closest('[data-pal]'); if (pal) return runPal(Number(pal.dataset.pal));
    var el = ev.target.closest('[data-act]');
    if (U.menu && !ev.target.closest('.acct-menu') && !(el && el.dataset.act === 'menu')) { U.menu = false; renderSide(); }
    if (U.menu && ev.target.closest('.acct-menu a')) { U.menu = false; }
    if (U.pc && !ev.target.closest('#pc')) { U.pc = false; renderPc(); }
    if (el && !el.disabled) { if (el.tagName !== 'A') ev.preventDefault(); act(el.dataset.act, el.dataset.arg, el); }
  });
  var qTimer, cfgTimer;
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.id === 'q') {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        var q = keepQ(); if (el.value.trim()) q.q = el.value.trim(); else delete q.q;
        history.replaceState(null, '', href('discover', R.arg, q)); R = parse();
        U.loading = true; $('#list').innerHTML = listHtml();
        setTimeout(function () { U.loading = false; var l = $('#list'); if (l) l.innerHTML = listHtml(); }, 320);
      }, 250);
    } else if (el.id === 'lq') {
      U.lib[el.dataset.kind].q = el.value; renderMain(); var n = $('#lq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
    } else if (el.id === 'pal-q') { U.palSel = 0; drawPalList(); }
    else if (el.dataset.cfg) {
      var p = el.dataset.cfg.split('|'), c = cfgOf(p[0]); c[p[1]] = p[1] === 'level' ? Number(el.value) : el.value; A.save(); flashSaved(); if (U.err && U.err.slug === p[0]) U.err = null;
      clearTimeout(cfgTimer);
      if (el.tagName === 'SELECT') render();
    } else if (el.dataset.keyI) { cfgOf(el.dataset.slug).apiKeys[Number(el.dataset.keyI)] = el.value; A.save(); flashSaved(); }
    else if (el.id === 'pj-path' && D) D.path = el.value;
    else if (el.dataset.val && D) { D.vals[el.dataset.val] = el.value.trim(); var go2 = $('#d-go'); if (go2) go2.disabled = !A.needs(D.it).every(function (n) { return D.vals[n.key]; }); }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.id === 'd-loc' && D) {
      if (el.value === '__add') openDlg({ type: 'pj-new', path: '', ret: D });
      else { D.loc = el.value; initTg(D); drawDlg(); $('#d-loc').focus(); }
    } else if (el.id === 'sort') { var q = keepQ(); if (el.value) q.sort = el.value; else delete q.sort; go('discover', R.arg, q); }
    else if (el.dataset.cfg && el.tagName !== 'SELECT') { clearTimeout(cfgTimer); cfgTimer = setTimeout(function () { if (!$('#dlg').open) render(); }, 220); }
  });
  document.addEventListener('toggle', function (ev) { var k = ev.target.dataset && ev.target.dataset.fold; if (k) U[k] = ev.target.open; }, true);
  document.addEventListener('keydown', function (ev) {
    var mod = ev.metaKey || ev.ctrlKey, el = document.activeElement, typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (mod && ev.key.toLowerCase() === 'k') { ev.preventDefault(); return openPal(); }
    if ($('#pal').open) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); U.palSel = (U.palSel + (ev.key === 'ArrowDown' ? 1 : -1) + PAL.length) % (PAL.length || 1); drawPalList(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); runPal(U.palSel); }
      return;
    }
    if ($('#dlg').open) {
      if (ev.key === 'Enter' && el && el.dataset.val && $('#d-go') && !$('#d-go').disabled) act('d-install');
      else if (ev.key === 'Enter' && el && el.id === 'pj-path') { ev.preventDefault(); act('pj-save'); }
      else if (ev.key === 'Enter' && el && el.dataset.pv) { ev.preventDefault(); act('pj-vars-save'); }
      return;
    }
    if (R.view === 'welcome') return;
    if (mod && /^[1-6]$/.test(ev.key)) { ev.preventDefault(); return go(['discover', 'skills', 'mcp', 'providers', 'usage', 'settings'][Number(ev.key) - 1]); }
    if (mod && ev.key === ',') { ev.preventDefault(); return go('settings'); }
    if (ev.key === 'Escape') {
      if (U.menu) { U.menu = false; renderSide(); $('.acct').focus(); }
      else if (U.pc) { U.pc = false; renderPc(); }
      else if (typing && el.value && (el.id === 'q' || el.id === 'lq')) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (U.over) { U.over = null; render(); }
      else if (R.arg && R.view !== 'settings' && R.view !== 'project') { var sel = href(R.view, R.arg, keepQ()); go(R.view, '', keepQ()); setTimeout(function () { var r = $('.row-main[href="' + CSS.escape(sel) + '"]') || $('.row-main'); if (r) r.focus(); }, 0); }
      return;
    }
    if (ev.key === 'ArrowDown' && typing && (el.id === 'q' || el.id === 'lq')) { var first = $('#rows .row-main'); if (first) { ev.preventDefault(); first.focus(); } return; }
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && el && el.classList.contains('row-main')) {
      var rows = $$('#rows .row-main'), i = rows.indexOf(el) + (ev.key === 'ArrowDown' ? 1 : -1);
      ev.preventDefault(); if (i < 0) { var s = $('#q') || $('#lq'); if (s) s.focus(); } else if (rows[i]) rows[i].focus(); return;
    }
    if (typing || mod) return;
    if (ev.key === '/') { var s2 = $('#q') || $('#lq'); if (s2) { ev.preventDefault(); s2.focus(); s2.select(); } }
    else if (ev.key === '?') openDlg({ type: 'shortcuts' });
  });
  $('#dlg').addEventListener('cancel', function (ev) { if (D && D.type === 'install' && D.step === 'progress') ev.preventDefault(); });
  $('#dlg').addEventListener('close', function () { if (D) { D = null; render(); } });
  $('#dlg').addEventListener('click', function (ev) { if (ev.target === this && !(D && D.type === 'install' && /progress|conflict/.test(D.step))) closeDlg(); });
  $('#pal').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
  window.addEventListener('hashchange', render);
  window.addEventListener('resize', fit);
  render();
})();
