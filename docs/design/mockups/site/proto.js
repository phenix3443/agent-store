/* Agent Store 原型的共享脚本：导航、页脚、语言切换、全局搜索、登录、安装流程、收藏、提示、原型控制。
   文案都在 i18n.js，这里只取键。 */
(function () {
  'use strict';
  var S = window.AS_STATE, DATA = window.AS_DATA || [], t = window.t;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    skill: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    mcp: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.5 6h7M7 8.3l4 7.4M17 8.3l-4 7.4"/>',
    provider: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
    usage: '<path d="M5 20V11M11 20V5M17 20v-7M2 20h20"/>',
    heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9Z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/>',
    two: '<rect x="3" y="5" width="11" height="11" rx="2"/><rect x="10" y="9" width="11" height="11" rx="2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
    click: '<path d="M9 9l10 4-4.5 1.5L13 19 9 9Z"/><path d="M5 5l1.5 1.5M9 3v2M3 9h2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    sync: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>'; }
  function K(kind) { return t('kind.' + kind); }
  var TOOL = { claude: 'Claude Code', codex: 'Codex' };
  function fmt(n) {
    if (n == null) return '—';
    if (window.AS_LANG === 'en') return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, '') + ' 万';
    return n.toLocaleString('zh-CN');
  }
  function byId(id) { for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i]; return null; }
  function href(id) { return 'detail.html#id=' + encodeURIComponent(id); }
  function hash() { return new URLSearchParams(location.hash.replace(/^#/, '')); }
  function search(q, list) {
    q = q.trim().toLowerCase(); if (!q) return (list || DATA).slice();
    return (list || DATA).filter(function (d) { return (d.name + ' ' + d.description + ' ' + (d.author || '') + ' ' + K(d.kind)).toLowerCase().indexOf(q) > -1; });
  }
  function needs(item) {
    var out = [];
    (item.runs || []).forEach(function (r) { if (r[0] === 'needs') r[1].split(', ').forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); }); });
    return out;
  }
  function supports(item, tool) { return !item.compatible || item.compatible.indexOf(tool) > -1; }
  function author(d) { return esc(d.author || t('unknown.author')); }
  /* 每个工具里这条配置落在哪，纯参考信息 */
  function writes(item) {
    var n = item.kind === 'mcp' ? item.mcpName : item.name, w;
    if (item.kind === 'skill') w = [['claude', '~/.claude/skills/' + n], ['codex', '~/.codex/skills/' + n]];
    else if (item.kind === 'mcp') w = [['claude', '~/.claude.json → mcpServers.' + n], ['codex', '~/.codex/config.toml → [mcp_servers.' + n + ']']];
    else w = [['claude', 'ANTHROPIC_BASE_URL'], ['codex', '~/.codex/config.toml → model_providers']];
    return w.map(function (x) { return { key: x[0], tool: TOOL[x[0]], path: x[1], off: !supports(item, x[0]) }; });
  }
  function runsHTML(item) {
    if (item.id === 'builtin:local') return '<p class="muted" style="font-size:14px">' + t('d.local') + '</p>';
    if (!item.runs || !item.runs.length) return '<p class="muted" style="font-size:14px">' + t('d.none') + '</p>';
    return '<dl class="runs">' + item.runs.map(function (r) {
      return '<div class="run"><dt>' + t('run.' + r[0]) + '</dt><dd' + (r[0] === 'needs' ? ' class="k"' : '') + '>' + esc(r[1]) + '</dd></div>';
    }).join('') + '</dl>';
  }
  function writesHTML(item) {
    return '<div class="writes">' + writes(item).map(function (w) {
      return '<div class="write' + (w.off ? ' off' : '') + '"><span class="label">' + w.tool + '</span><br>' + (w.off ? '<span class="faint" style="font-size:13.5px">' + t('d.unsupported', { tool: w.tool }) + '</span>' : '<code>' + esc(w.path) + '</code>') + '</div>';
    }).join('') + '</div>';
  }
  function codeHTML(text, extra) {
    return '<div class="code has-copy wrapline ' + (extra || '') + '"><pre>' + esc(text) + '</pre><button class="copy" type="button" data-copy="' + esc(text) + '">' + t('copy') + '</button></div>';
  }
  function tile(kind, cls) { return '<span class="tile ' + (cls || '') + '" data-kind="' + kind + '">' + ic(kind) + '</span>'; }
  function heart(id) { return '<button class="heart" type="button" data-fav="' + esc(id) + '" aria-pressed="false" aria-label="' + t('fav.add') + '">' + ic('heart') + '</button>'; }
  function link(s, a, b) { return s.replace('{a}', a).replace('{/a}', '</a>').replace('{b}', b || '').replace('{/b}', '</a>'); }

  /* ---------- 提示与横幅 ---------- */
  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); }
    toastEl.textContent = msg;
    /* 打开的 <dialog> 在顶层，提示要跟进去才看得见 */
    ($$('dialog[open]').pop() || document.body).appendChild(toastEl);
    requestAnimationFrame(function () { toastEl.classList.add('on'); });
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2800);
  }
  var bannerEl;
  function banner(on) {
    if (!bannerEl) {
      bannerEl = document.createElement('div'); bannerEl.className = 'banner'; bannerEl.setAttribute('role', 'alert'); bannerEl.hidden = true;
      bannerEl.innerHTML = '<span>' + t('banner.offline') + '</span><button type="button" class="btn btn-ghost btn-sm">' + t('retry') + '</button>';
      document.body.insertBefore(bannerEl, document.body.firstChild);
      $('button', bannerEl).addEventListener('click', function () { if (navigator.onLine) { banner(false); toast(t('banner.back')); } else toast(t('banner.still')); });
    }
    bannerEl.hidden = !on;
  }
  window.addEventListener('offline', function () { banner(true); });
  window.addEventListener('online', function () { banner(false); });

  function copy(text, btn) {
    function done(ok) {
      if (btn) { var old = btn.textContent; btn.textContent = ok ? t('copied') : t('copy'); btn.classList.toggle('ok', ok); setTimeout(function () { btn.textContent = old; btn.classList.remove('ok'); }, 1600); }
      toast(ok ? t('copied') : t('copy.fail'));
    }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      ($$('dialog[open]').pop() || document.body).appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback); else fallback();
  }

  /* ---------- 对话框 ---------- */
  function dialog(cls, label) {
    var d = document.createElement('dialog'); d.className = cls; d.setAttribute('aria-label', label);
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    document.body.appendChild(d); return d;
  }
  function closeBtn() { return '<button class="x" type="button" data-close aria-label="' + t('close') + '">' + ic('x') + '</button>'; }

  /* ---------- 登录 ---------- */
  var authDlg, authNext;
  function openAuth(next, reason) {
    authNext = next || null;
    if (!authDlg) authDlg = dialog('dlg auth', t('nav.login'));
    authDlg.innerHTML = '<div class="dlg-body center">' + closeBtn() +
      '<span class="logo big"><i></i><i></i><i></i></span><h2>' + t('auth.h') + '</h2><p class="muted">' + (reason || t('auth.p')) + '</p>' +
      '<div class="auth-btns"><button class="btn btn-pri" type="button" data-provider="GitHub">' + t('auth.github') + '</button>' +
      '<button class="btn btn-ghost" type="button" data-provider="Google">' + t('auth.google') + '</button></div>' +
      '<p class="fine">' + link(t('auth.consent'), '<a href="terms.html">', '<a href="privacy.html">') + '<br>' + t('auth.proto') + '</p></div>';
    $$('[data-provider]', authDlg).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-provider]', authDlg).forEach(function (x) { x.disabled = true; });
        b.textContent = t('auth.ing', { p: b.dataset.provider });
        setTimeout(function () {
          var next = authNext; authNext = null;
          S.set({ signedIn: true }); authDlg.close(); toast(t('auth.ok'));
          if (next) next();
        }, reduce ? 0 : 700);
      });
    });
    if (!authDlg.open) authDlg.showModal();
  }
  function requireAuth(fn, reason) { if (S.get().signedIn) fn(); else openAuth(fn, reason); }
  function signOut() { S.set({ signedIn: false }); toast(t('auth.out')); }
  function toggleFav(id) { requireAuth(function () { toast(S.toggle('favorites', id) ? t('fav.on') : t('fav.off')); }, t('auth.fav')); }

  /* ---------- 安装 ---------- */
  var instDlg;
  function install(id, btn) {
    var item = byId(id); if (!item) return;
    if (!instDlg) instDlg = dialog('dlg install', t('inst.label'));
    if (S.has('installed', id)) return installedView(item);
    if (S.get().clientInstalled) return confirmView(item);
    var label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = t('inst.launch'); }
    setTimeout(function () { if (btn) { btn.disabled = false; btn.innerHTML = label; } missingView(item); }, reduce ? 0 : 650);
  }
  function show(html, kind) { instDlg.dataset.kind = kind; instDlg.innerHTML = html; if (!instDlg.open) instDlg.showModal(); }
  function head(item, title, sub) { return '<div class="inst-head">' + tile(item.kind) + '<div><h2 tabindex="-1">' + title + '</h2><p class="muted">' + sub + '</p></div></div>'; }
  function missingView(item) {
    show('<div class="dlg-body">' + closeBtn() + '<span class="tile warn">' + ic('box') + '</span><h2>' + t('inst.missing.h') + '</h2><p class="muted">' + t('inst.missing.p') + '</p>' + codeHTML(item.command) +
      '<div class="dlg-actions"><button class="btn btn-ghost" type="button" data-copy="' + esc(item.command) + '">' + t('inst.copycmd') + '</button>' +
      '<a class="btn btn-pri" href="download.html#from=' + encodeURIComponent(item.id) + '">' + ic('download') + t('inst.get') + '</a></div></div>', item.kind);
  }
  function confirmView(item) {
    var ns = needs(item);
    show('<div class="win"><div class="win-bar"><span class="win-dots"><i></i><i></i><i></i></span><span class="win-title">' + t('inst.win') + '</span>' + closeBtn() + '</div>' +
      '<form class="win-body inst" method="dialog">' + head(item, esc(item.name), K(item.kind) + ' · ' + author(item)) +
      '<h3>' + t('inst.tools') + '</h3><div class="inst-tools">' + writes(item).map(function (w) {
        return '<label class="pick' + (w.off ? ' off' : '') + '"><input type="checkbox" name="tool" value="' + w.key + '"' + (w.off ? ' disabled' : ' checked') + '><span><b>' + w.tool + '</b>' + (w.off ? '<small>' + t('d.unsupported', { tool: w.tool }) + '</small>' : '') + '</span></label>';
      }).join('') + '</div>' +
      (ns.length ? '<h3>' + t('inst.fill') + '</h3>' + ns.map(function (n) { return '<div class="field"><label for="env-' + esc(n) + '">' + esc(n) + '</label><input class="inp-real" id="env-' + esc(n) + '" type="password" autocomplete="off" placeholder="' + t('inst.later') + '"></div>'; }).join('') : '') +
      '<div class="dlg-actions"><button class="btn btn-ghost" type="button" data-close>' + t('inst.cancel') + '</button><button class="btn btn-pri" type="submit">' + t('inst.go') + '</button></div></form></div>', item.kind);
    $('form', instDlg).addEventListener('submit', function (e) {
      e.preventDefault();
      progressView(item, $$('input[name=tool]:checked', instDlg).map(function (i) { return i.value; }));
    });
  }
  function progressView(item, tools) {
    var steps = [t('inst.s.dl')];
    if (tools.indexOf('claude') > -1) steps.push(t('inst.s.claude'));
    if (tools.indexOf('codex') > -1) steps.push(t('inst.s.codex'));
    if (!tools.length) steps.push(t('inst.s.none'));
    show('<div class="win"><div class="win-bar"><span class="win-dots"><i></i><i></i><i></i></span><span class="win-title">' + t('inst.win.ing') + '</span></div>' +
      '<div class="win-body inst">' + head(item, t('inst.ing', { name: esc(item.name) }), '<span aria-live="polite" id="instStatus">' + t('inst.ready') + '</span>') +
      '<div class="bar"><i></i></div><ol class="inst-steps">' + steps.map(function (s) { return '<li>' + ic('check') + '<span>' + s + '</span></li>'; }).join('') + '</ol></div></div>', item.kind);
    var lis = $$('.inst-steps li', instDlg), bar = $('.bar i', instDlg), i = 0;
    $('h2', instDlg).focus();
    (function next() {
      if (i >= lis.length) { S.toggle('installed', item.id, true); return setTimeout(function () { doneView(item, tools); }, reduce ? 0 : 350); }
      lis[i].classList.add('doing'); $('#instStatus', instDlg).textContent = lis[i].textContent + '…';
      setTimeout(function () { lis[i].classList.remove('doing'); lis[i].classList.add('done'); i++; bar.style.width = (i / lis.length * 100) + '%'; next(); }, reduce ? 0 : 620);
    })();
  }
  function doneView(item, tools) {
    var names = tools.map(function (x) { return TOOL[x]; }).join(t('and'));
    show('<div class="dlg-body center">' + closeBtn() + '<span class="tile ok big-ok">' + ic('check') + '</span><h2>' + t('inst.done.h', { name: esc(item.name) }) + '</h2>' +
      '<p class="muted">' + (names ? t('inst.done.p', { tools: names }) : t('inst.done.none')) + '</p>' +
      '<div class="dlg-actions center"><button class="btn btn-pri" type="button" data-close>' + t('inst.done.btn') + '</button></div><p class="fine">' + t('inst.sim') + '</p></div>', item.kind);
  }
  function installedView(item) {
    show('<div class="dlg-body">' + closeBtn() + tile(item.kind) + '<h2>' + t('inst.done.h', { name: esc(item.name) }) + '</h2><p class="muted">' + t('inst.have.p') + '</p>' +
      '<div class="dlg-actions"><button class="btn btn-ghost" type="button" id="uninst">' + t('inst.uninstall') + '</button><button class="btn btn-pri" type="button" data-close>' + t('inst.ok') + '</button></div></div>', item.kind);
    $('#uninst', instDlg).addEventListener('click', function () { S.toggle('installed', item.id, false); instDlg.close(); toast(t('inst.uninstalled', { name: item.name })); });
  }

  /* ---------- 快速查看 ---------- */
  var quickDlg;
  function quick(id) {
    var d = byId(id); if (!d) return;
    if (!quickDlg) quickDlg = dialog('sheet right quick', t('q.label'));
    quickDlg.dataset.kind = d.kind;
    quickDlg.innerHTML = '<div class="sheet-head"><a class="btn btn-ghost btn-sm" href="' + href(d.id) + '">' + t('q.expand') + '</a>' + closeBtn() + '</div>' +
      '<div class="sheet-body">' + head(d, esc(d.name), author(d)) + '<p class="q-desc">' + esc(d.description) + '</p>' +
      '<dl class="q-stats"><div><dt>' + t('d.kind') + '</dt><dd><span class="kind">' + K(d.kind) + '</span></dd></div><div><dt>' + t('d.installs') + '</dt><dd>' + fmt(d.installs) + '</dd></div><div><dt>' + t('d.stars') + '</dt><dd>' + fmt(d.stars) + '</dd></div><div><dt>' + t('d.updated') + '</dt><dd>' + esc(d.updated || '—') + '</dd></div></dl>' +
      '<div class="q-actions"><button class="btn btn-pri" type="button" data-install="' + esc(d.id) + '">' + t('d.install') + '</button>' + heart(d.id) + '</div>' +
      '<h3>' + t('d.cmd') + '</h3>' + codeHTML(d.command) + '<h3>' + t('d.content') + '</h3>' + runsHTML(d) + '<h3>' + t('d.where') + '</h3>' + writesHTML(d) + '</div>';
    sync(quickDlg);
    if (!quickDlg.open) quickDlg.showModal();
    $('.sheet-body', quickDlg).scrollTop = 0;
  }

  /* ---------- 全局搜索 ---------- */
  var palDlg, palT = [], palIdx = 0;
  var PAGES = ['store', 'client', 'docs', 'pricing', 'download', 'dashboard'].map(function (p) { return [t(p === 'download' ? 'nav.download' : p === 'dashboard' ? 'nav.dashboard' : 'nav.' + p), p + '.html', t('pal.p.' + p)]; });
  function palOpt(d) { return '<a class="pal-opt" role="option" data-kind="' + d.kind + '" href="' + href(d.id) + '">' + tile(d.kind, 'sm') + '<span><b>' + esc(d.name) + '</b><small>' + author(d) + ' · ' + esc(d.description) + '</small></span><em class="kind">' + K(d.kind) + '</em></a>'; }
  function palPage(p) { return '<a class="pal-opt" role="option" href="' + p[1] + '"><span class="tile sm plain">' + ic('arrow') + '</span><span><b>' + p[0] + '</b><small>' + p[2] + '</small></span><em class="faint">' + t('pal.page') + '</em></a>'; }
  function palGroup(title, html) { return html ? '<div class="pal-g" role="group" aria-label="' + title + '"><div class="pal-gl">' + title + '</div>' + html + '</div>' : ''; }
  function palRender(q) {
    var body = $('.pal-list', palDlg), html = ''; palT.forEach(clearTimeout); palT = [];
    q = q.trim();
    if (!q) {
      var rec = S.get().recent.map(byId).filter(Boolean).slice(0, 3);
      html = palGroup(t('pal.recent'), rec.map(palOpt).join('')) +
        palGroup(t('pal.start'), ['skill', 'mcp', 'provider'].map(function (k) { return DATA.filter(function (d) { return d.kind === k && rec.indexOf(d) < 0; })[0]; }).filter(Boolean).map(palOpt).join('')) +
        palGroup(t('pal.pages'), PAGES.slice(0, 5).map(palPage).join(''));
    } else {
      var res = search(q), ql = q.toLowerCase();
      html = ['skill', 'mcp', 'provider'].map(function (k) { return palGroup(t('kinds.' + k), res.filter(function (d) { return d.kind === k; }).slice(0, 5).map(palOpt).join('')); }).join('') +
        palGroup(t('pal.pages'), PAGES.filter(function (p) { return (p[0] + p[2]).toLowerCase().indexOf(ql) > -1; }).map(palPage).join(''));
      if (!html) {
        html = '<div class="pal-empty" role="status"><b>' + t('pal.empty', { q: esc(q) }) + '</b></div>';
        palT.push(setTimeout(function () { body.innerHTML = '<div class="pal-empty" role="status"><span class="spin"></span><b>' + t('pal.pending') + '</b><span>' + t('pal.pending.s') + '</span></div>'; }, 450));
        palT.push(setTimeout(function () { body.innerHTML = '<div class="pal-empty" role="status"><b>' + t('pal.nf', { q: esc(q) }) + '</b><span>' + t('pal.nf.s') + '</span><a class="link pal-opt" role="option" href="store.html">' + t('pal.browse') + '</a></div>'; palIdx = 0; palMark(); }, 1900));
      }
    }
    body.innerHTML = html; palIdx = 0; palMark();
  }
  function palMark() {
    var opts = $$('.pal-opt', palDlg), input = $('input', palDlg);
    opts.forEach(function (o, i) { o.id = 'pal-o' + i; o.setAttribute('aria-selected', i === palIdx ? 'true' : 'false'); });
    if (opts[palIdx]) { input.setAttribute('aria-activedescendant', opts[palIdx].id); opts[palIdx].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function openPalette(q) {
    if (!palDlg) {
      palDlg = dialog('dlg palette', t('nav.search'));
      palDlg.innerHTML = '<div class="pal-in">' + ic('search') + '<input type="text" role="combobox" aria-expanded="true" aria-controls="palList" aria-autocomplete="list" aria-label="' + t('v.search') + '" placeholder="' + t('v.search') + '" autocomplete="off" spellcheck="false"><button class="kbd" type="button" data-close>Esc</button></div>' +
        '<div class="pal-list" id="palList" role="listbox" aria-label="' + t('pal.results') + '"></div>' +
        '<div class="pal-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> ' + t('pal.select') + '</span><span><span class="kbd">↵</span> ' + t('pal.open') + '</span><span class="grow"></span><span>' + t('pal.samples', { n: DATA.length }) + '</span></div>';
      var input = $('input', palDlg);
      input.addEventListener('input', function () { palRender(input.value); });
      input.addEventListener('keydown', function (e) {
        var opts = $$('.pal-opt', palDlg);
        if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(opts.length - 1, palIdx + 1); palMark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); palMark(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (opts[palIdx]) opts[palIdx].click(); else if (input.value.trim()) location.href = 'store.html#q=' + encodeURIComponent(input.value.trim()); }
      });
      palDlg.addEventListener('click', function (e) { if (e.target.closest('a.pal-opt')) setTimeout(function () { palDlg.close(); }, 0); });
    }
    var inp = $('input', palDlg); inp.value = q || ''; palRender(inp.value);
    if (!palDlg.open) palDlg.showModal(); inp.focus();
  }

  /* ---------- 导航与页脚 ---------- */
  var LINKS = ['store', 'client', 'docs', 'pricing'];
  var menuDlg, EN = window.AS_LANG === 'en';
  function langBtn(cls) { return '<button class="' + cls + '" type="button" data-lang="' + (EN ? 'zh' : 'en') + '" aria-label="' + t('nav.lang') + '：' + (EN ? '中文' : 'English') + '" lang="' + (EN ? 'zh-CN' : 'en') + '">' + (EN ? '中文' : 'EN') + '</button>'; }
  function renderNav() {
    var nav = $('#nav'); if (!nav) return;
    var page = document.body.dataset.page, s = S.get(), mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var acct = s.signedIn
      ? '<details class="menu"><summary class="avatar" aria-label="' + t('nav.account') + '">d' + (S.isPro() ? '<i>Pro</i>' : '') + '</summary><div class="menu-pop"><div class="menu-who"><b>demo</b><small>demo@example.com · ' + (S.isPro() ? 'Pro' : 'Free') + '</small></div><a href="dashboard.html#tab=account">' + t('nav.dashboard') + '</a><a href="dashboard.html#tab=favorites">' + t('nav.favorites') + '</a><a href="dashboard.html#tab=subscription">' + t('nav.subscription') + '</a><button type="button" data-signout>' + t('nav.signout') + '</button></div></details>'
      : '<button class="nav-login" type="button" data-open="login">' + t('nav.login') + '</button>';
    nav.innerHTML = '<div class="nav-bar"><a class="brand" href="index.html"><span class="logo"><i></i><i></i><i></i></span>Agent Store</a>' +
      '<nav class="nav-links" aria-label="' + t('nav.main') + '">' + LINKS.map(function (l) { return '<a href="' + l + '.html"' + (l === page ? ' aria-current="page"' : '') + '>' + t('nav.' + l) + '</a>'; }).join('') + '</nav>' +
      '<div class="nav-right"><button class="nav-search" type="button" data-open="palette" aria-label="' + t('nav.search') + '">' + ic('search') + '<span>' + t('nav.search') + '</span><span class="kbd">' + (mac ? '⌘K' : 'Ctrl K') + '</span></button>' + langBtn('nav-lang') + acct +
      '<a class="btn btn-pri btn-sm" href="download.html">' + t('nav.download') + '</a><button class="nav-burger" type="button" aria-label="' + t('nav.menu') + '" data-open="menu"><span></span></button></div></div>';
  }
  function openMenu() {
    if (!menuDlg) menuDlg = dialog('sheet top menu-sheet', t('nav.menu'));
    var s = S.get(), page = document.body.dataset.page;
    menuDlg.innerHTML = '<div class="sheet-head"><a class="brand" href="index.html"><span class="logo"><i></i><i></i><i></i></span>Agent Store</a>' + closeBtn() + '</div><nav class="sheet-body" aria-label="' + t('nav.main') + '">' +
      '<button type="button" class="m-link" data-open="palette">' + t('nav.search') + '<span class="kbd">/</span></button>' +
      LINKS.map(function (l) { return '<a class="m-link" href="' + l + '.html"' + (l === page ? ' aria-current="page"' : '') + '>' + t('nav.' + l) + '</a>'; }).join('') + '<div class="sep"></div>' +
      (s.signedIn ? '<a class="m-link" href="dashboard.html#tab=account">' + t('nav.dashboard') + '<small>demo · ' + (S.isPro() ? 'Pro' : 'Free') + '</small></a><a class="m-link" href="dashboard.html#tab=favorites">' + t('nav.favorites') + '</a><a class="m-link" href="dashboard.html#tab=subscription">' + t('nav.subscription') + '</a><button type="button" class="m-link" data-signout>' + t('nav.signout') + '</button>'
        : '<button type="button" class="m-link" data-open="login">' + t('nav.login') + '</button>') +
      '<div class="m-link" style="font-weight:500;font-size:15px">' + t('nav.lang') + langBtn('nav-lang') + '</div>' +
      '<a class="btn btn-pri" href="download.html" style="margin-top:12px">' + t('nav.dl.long') + '</a></nav>';
    menuDlg.showModal();
  }
  function renderFooter() {
    var f = $('#footer'); if (!f) return;
    function li(h, k, extra) { return '<li><a href="' + h + '">' + t(k) + '</a>' + (extra || '') + '</li>'; }
    f.innerHTML = '<div class="wrap"><div class="footer-grid"><div><a class="brand" href="index.html"><span class="logo"><i></i><i></i><i></i></span>Agent Store</a><p>' + t('footer.tag') + '</p></div>' +
      '<div><h4>' + t('footer.product') + '</h4><ul>' + li('store.html', 'nav.store') + li('client.html', 'nav.client') + li('pricing.html', 'nav.pricing') + li('download.html', 'nav.download') + '</ul></div>' +
      '<div><h4>' + t('footer.resources') + '</h4><ul>' + li('docs.html', 'nav.docs') + li('docs-article.html#a=cli', 'footer.cli') + li('download.html#releases', 'footer.releases') + li('dashboard.html', 'nav.dashboard') + '</ul></div>' +
      '<div><h4>' + t('footer.legal') + '</h4><ul>' + li('privacy.html', 'footer.privacy') + li('terms.html', 'footer.terms') + li('ux.html', 'footer.ux', '<small>' + t('footer.proto') + '</small>') + '</ul></div></div>' +
      '<div class="footer-base"><span>© 2026 Agent Store</span><span>' + t('footer.base') + '</span></div></div><div class="footer-word" aria-hidden="true">Agent Store</div>';
  }

  /* ---------- 原型控制 ---------- */
  function renderPC() {
    var pc = $('#pc'), s = S.get(), open = pc ? pc.open : false;
    if (!pc) { pc = document.createElement('details'); pc.id = 'pc'; pc.className = 'pc'; document.body.appendChild(pc); }
    pc.innerHTML = '<summary>' + ic('toggle') + t('pc.title') + '</summary><div class="pc-body"><p>' + t('pc.desc') + '</p>' +
      '<label><input type="checkbox" data-pc="signedIn"' + (s.signedIn ? ' checked' : '') + '>' + t('pc.signed') + '</label>' +
      '<label title="' + t('pc.client.tip') + '"><input type="checkbox" data-pc="clientInstalled"' + (s.clientInstalled ? ' checked' : '') + '>' + t('pc.client') + '<small>' + t('pc.sim') + '</small></label>' +
      '<label><input type="checkbox" data-pc="pro"' + (S.isPro() ? ' checked' : '') + '>' + t('pc.pro') + '</label>' +
      '<div class="pc-row"><button type="button" class="btn btn-ghost btn-sm" data-pc-act="offline">' + t('pc.offline') + '</button><button type="button" class="btn btn-ghost btn-sm" data-pc-act="reset">' + t('pc.reset') + '</button></div>' +
      '<a class="link" href="ux.html">' + t('footer.ux') + '</a></div>';
    pc.open = open;
  }

  /* ---------- 状态同步到界面 ---------- */
  function sync(root) {
    var s = S.get();
    $$('[data-fav]', root).forEach(function (b) { var on = s.signedIn && S.has('favorites', b.dataset.fav); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? t('fav.remove') : t('fav.add')); });
    $$('[data-install]', root).forEach(function (b) {
      var on = S.has('installed', b.dataset.install);
      b.classList.toggle('is-installed', on);
      if (!b.dataset.label) b.dataset.label = b.innerHTML;
      b.innerHTML = on ? ic('check') + t('installed') : b.dataset.label;
    });
    $$('[data-installed-badge]', root).forEach(function (b) { b.hidden = !S.has('installed', b.dataset.installedBadge); });
  }
  document.addEventListener('as:state', function () { renderNav(); renderPC(); sync(); });

  /* ---------- 全局事件 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-close],[data-open],[data-copy],[data-fav],[data-install],[data-quick],[data-signout],[data-pc-act],[data-lang],.switch,[data-tab]');
    $$('details.menu[open]').forEach(function (m) { if (!m.contains(e.target)) m.open = false; });
    if (!el) return;
    if (el.matches('[data-close]')) { var d = el.closest('dialog'); if (d) d.close(); return; }
    if (el.matches('[data-open]')) {
      var w = el.dataset.open, host = el.closest('dialog.menu-sheet'); if (host) host.close();
      if (w === 'palette') openPalette(); else if (w === 'login') openAuth(); else if (w === 'menu') openMenu(); return;
    }
    if (el.matches('[data-lang]')) { S.set({ lang: el.dataset.lang }); location.reload(); return; }
    if (el.matches('[data-copy]')) { copy(el.dataset.copy, el.classList.contains('copy') ? el : null); return; }
    if (el.matches('[data-fav]')) { e.preventDefault(); e.stopPropagation(); toggleFav(el.dataset.fav); return; }
    if (el.matches('[data-install]')) { e.preventDefault(); install(el.dataset.install, el); return; }
    if (el.matches('[data-quick]')) { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); quick(el.dataset.quick); return; }
    if (el.matches('[data-signout]')) { var h = el.closest('dialog'); if (h) h.close(); signOut(); return; }
    if (el.matches('[data-pc-act]')) { if (el.dataset.pcAct === 'reset') { S.reset(); banner(false); toast(t('pc.resetted')); } else banner(bannerEl ? bannerEl.hidden : true); return; }
    if (el.matches('.switch')) { if (el.disabled) return; el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); el.dispatchEvent(new CustomEvent('as:switch', { bubbles: true })); return; }
    if (el.matches('[data-tab]')) {
      var scope = el.closest('[data-tabscope]') || document, name = el.dataset.tab;
      $$('[data-tab]', el.parentNode).forEach(function (b) { b.setAttribute('aria-selected', b === el ? 'true' : 'false'); });
      $$('[data-panel]', scope).forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el.matches || !el.matches('[data-pc]')) return;
    var k = el.dataset.pc;
    if (k === 'pro') S.set({ plan: el.checked ? { tier: 'pro', period: 'monthly', since: Date.now(), cancel: false } : { tier: 'free', period: null, since: null, cancel: false } });
    else { var p = {}; p[k] = el.checked; S.set(p); }
    toast(t('pc.changed'));
  });
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !typing && !$('dialog[open]')) {
      e.preventDefault();
      var local = $('[data-slash]'); if (local) { local.focus(); local.select && local.select(); } else openPalette();
    } else if (e.key === 'Escape') $$('details.menu[open]').forEach(function (m) { m.open = false; $('summary', m).focus(); });
  });

  /* 跟随指针的光 */
  var raf = 0, last;
  document.addEventListener('pointermove', function (e) {
    last = e; if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0; var el = last.target.closest && last.target.closest('.spot'); if (!el) return;
      var group = el.closest('[data-spot-group]'), list = group ? $$('.spot', group) : [el];
      list.forEach(function (c) { var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (last.clientX - r.left) + 'px'); c.style.setProperty('--my', (last.clientY - r.top) + 'px'); });
    });
  }, { passive: true });

  function reveal(root) {
    if (reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal]', root).forEach(function (el) { io.observe(el); });
  }

  /* ---------- 客户端窗口里的视图（首页演示和客户端页共用） ---------- */
  function sw(on, label, kind, off) { return '<span class="tool-sw"><button type="button" class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '" data-kind="' + kind + '"' + (off ? ' disabled' : '') + '></button></span>'; }
  function rowSw(d, a, b) {
    return '<div class="v-item" data-kind="' + d.kind + '">' + tile(d.kind, 'sm') + '<div><b>' + esc(d.name) + '</b><small>' + K(d.kind) + ' · ' + author(d) + '</small></div>' +
      sw(a && supports(d, 'claude'), t('v.enable.for', { tool: 'Claude Code', name: d.name }), d.kind, !supports(d, 'claude')) + sw(b && supports(d, 'codex'), t('v.enable.for', { tool: 'Codex', name: d.name }), d.kind, !supports(d, 'codex')) + '</div>';
  }
  function colhead() { return '<div class="v-colhead"><span>' + t('v.col.installed') + '</span><span>Claude Code</span><span>Codex</span></div>'; }
  var skills = DATA.filter(function (d) { return d.kind === 'skill'; }), mcps = DATA.filter(function (d) { return d.kind === 'mcp'; }), provs = DATA.filter(function (d) { return d.kind === 'provider'; });
  var provOrder = ['A', 'B', 'C'];
  function provName(x) { return t('v.prov.name', { x: x }); }
  function provRows() {
    return provOrder.map(function (x, i) {
      var n = provName(x);
      return '<div class="prov"><span class="lvl">Level ' + (i + 1) + '</span><div><b>' + n + '</b><small>' + t(i === 0 ? 'v.prov.first' : 'v.prov.next') + '</small></div><span class="updown"><button type="button" class="ud" data-move="-1" data-i="' + i + '" aria-label="' + t('v.prov.up', { name: n }) + '"' + (i === 0 ? ' disabled' : '') + '>' + ic('up') + '</button><button type="button" class="ud" data-move="1" data-i="' + i + '" aria-label="' + t('v.prov.down', { name: n }) + '"' + (i === provOrder.length - 1 ? ' disabled' : '') + '>' + ic('down') + '</button></span></div>';
    }).join('');
  }
  var views = {
    preview: function () {
      return '<div class="v-search"><span>' + ic('search') + '</span><input type="text" aria-label="' + t('v.search') + '" placeholder="' + t('v.search') + '" autocomplete="off" spellcheck="false"><span class="kbd">↵</span></div>' +
        '<div class="v-cols"><div class="v-results" role="list"></div><div class="v-pane" aria-live="polite"></div></div>';
    },
    skills: function () {
      return '<div class="app-h"><h4>' + t('v.skills.h') + '</h4><span class="chip">' + ic('two').replace('<svg', '<svg width="13" height="13"') + t('v.skills.chip') + '</span></div><div>' + colhead() + '<div class="v-list">' +
        [skills[1], skills[6], skills[7], skills[0]].map(function (d, i) { return rowSw(d, true, i % 2 === 0); }).join('') + '</div></div><div class="v-path" data-kind="skill">' + t('v.skills.foot') + '</div>';
    },
    installed: function () {
      return '<div>' + colhead() + '<div class="v-list">' + [[skills[6], 1, 1], [mcps[7], 1, 0], [skills[1], 1, 0], [mcps[0], 0, 1], [provs[1], 0, 1], [skills[7], 0, 0]].map(function (r) { return rowSw(r[0], r[1], r[2]); }).join('') + '</div></div>';
    },
    mcp: function () {
      var c = byId('mcp-registry:io.github.upstash/context7');
      function line(tool, on) { return '<div class="v-item" style="grid-template-columns:minmax(0,1fr) auto"><div><b>' + tool + '</b></div>' + sw(on, t('v.enable.for', { tool: tool, name: c.name }), 'mcp') + '</div>'; }
      return '<div class="app-h"><h4>' + t('v.mcp.h', { name: esc(c.name) }) + '</h4><span class="kind" data-kind="mcp">MCP · ' + esc(c.version) + '</span></div>' +
        '<div class="field"><label>' + t('v.mcp.cmd') + '</label><div class="inp">' + esc(c.launch) + '</div></div>' +
        '<div class="field"><label>CONTEXT7_API_KEY · ' + t('v.mcp.opt') + '</label><div class="inp">' + t('v.mcp.later') + '</div></div>' +
        '<div class="v-list" data-kind="mcp" style="margin-top:4px">' + line('Claude Code', true) + line('Codex', false) + '</div><div class="v-path" data-kind="mcp">' + t('v.mcp.foot') + '</div>';
    },
    providers: function () {
      return '<div class="app-h"><h4>' + t('v.prov.h') + '</h4><span class="kind" data-kind="provider">' + t('kinds.provider') + '</span></div>' +
        '<div class="relay-card"><span class="pulse"></span><b>' + t('v.prov.run') + '</b><code>127.0.0.1:18780</code></div><div class="prov-list">' + provRows() + '</div><div class="v-path" data-kind="provider">' + t('v.prov.foot') + '</div>';
    },
    usage: function () {
      var hs = [38, 52, 30, 64, 46, 72, 58, 44, 80, 62, 50, 68, 90, 56];
      return '<div class="app-h"><h4>' + t('v.usage.h') + '</h4><div class="seg" role="tablist" aria-label="' + t('v.usage.range') + '"><button type="button" role="tab" data-tab="d1" aria-selected="false">' + t('v.usage.d1') + '</button><button type="button" role="tab" data-tab="d7" aria-selected="true">' + t('v.usage.d7') + '</button><button type="button" role="tab" data-tab="d30" aria-selected="false">' + t('v.usage.d30') + '</button></div></div>' +
        '<div class="u-tiles">' + ['cost', 'tok', 'req', 'models'].map(function (k) { return '<div class="u-tile">' + t('v.usage.' + k) + '<i></i></div>'; }).join('') + '</div>' +
        '<div class="u-chart" role="img" aria-label="' + t('v.usage.alt') + '">' + hs.map(function (h, i) { return '<i style="height:' + h + '%;--i:' + i + '"></i>'; }).join('') + '</div><div class="v-path" data-kind="provider">' + t('v.usage.foot') + '</div>';
    }
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.ud'); if (!b) return;
    var i = +b.dataset.i, j = i + (+b.dataset.move), tmp = provOrder[i], list = b.closest('.prov-list'); provOrder[i] = provOrder[j]; provOrder[j] = tmp;
    $$('.prov-list').forEach(function (l) { l.innerHTML = provRows(); });
    var again = list && $$('.ud', list).filter(function (x) { return +x.dataset.i === j && !x.disabled; })[0];
    if (again) again.focus();
    document.dispatchEvent(new CustomEvent('as:provorder'));
    toast(t('v.prov.toast', { name: provName(provOrder[0]) }));
  });
  function paneHTML(d) {
    return '<h5><span>' + esc(d.name) + '</span><span class="kind" data-kind="' + d.kind + '">' + K(d.kind) + '</span></h5><p class="faint" style="font-size:13px;margin-top:-4px">' + author(d) + '</p>' +
      '<p class="label" style="margin-top:6px">' + t('v.to') + '</p><div class="v-list" data-kind="' + d.kind + '">' + ['claude', 'codex'].map(function (k) {
        var ok = supports(d, k);
        return '<div class="v-item" style="grid-template-columns:minmax(0,1fr) auto;padding:9px 2px"><div><b>' + TOOL[k] + '</b>' + (ok ? '' : '<small>' + t('v.na') + '</small>') + '</div>' + sw(ok, TOOL[k], d.kind, !ok) + '</div>';
      }).join('') + '</div><div style="margin-top:auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn btn-pri btn-sm" type="button" data-install="' + esc(d.id) + '">' + t('v.install') + '</button><a class="link" style="font-size:13.5px" href="' + href(d.id) + '">' + t('v.detail') + '</a></div>';
  }
  function mountPreview(root) {
    var input = $('input', root), list = $('.v-results', root), pane = $('.v-pane', root), timer = [], stopped = false;
    function setPane(d) { pane.dataset.kind = d ? d.kind : ''; pane.innerHTML = d ? paneHTML(d) : '<p class="v-empty">' + t('v.empty2') + '</p>'; sync(pane); }
    function render(q) {
      var res = search(q).slice(0, 5);
      list.innerHTML = res.length ? res.map(function (d, i) { return '<button type="button" class="v-res" role="listitem" style="--i:' + i + '" data-kind="' + d.kind + '" data-id="' + esc(d.id) + '" aria-selected="' + (i === 0) + '">' + tile(d.kind, 'sm') + '<span><b>' + esc(d.name) + '</b><small>' + author(d) + '</small></span><span class="kind">' + K(d.kind) + '</span></button>'; }).join('') : '<p class="v-empty">' + t('v.empty') + '</p>';
      setPane(res[0]);
    }
    list.addEventListener('click', function (e) { var b = e.target.closest('.v-res'); if (!b) return; stop(); $$('.v-res', list).forEach(function (x) { x.setAttribute('aria-selected', x === b); }); setPane(byId(b.dataset.id)); });
    pane.addEventListener('click', stop);
    function stop() { stopped = true; timer.forEach(clearTimeout); }
    input.addEventListener('focus', function () { if (!stopped) { stop(); input.value = ''; render(''); } });
    input.addEventListener('input', function () { stop(); render(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && input.value.trim()) location.href = 'store.html#q=' + encodeURIComponent(input.value.trim()); });
    var qs = ['context7', 'browser', 'tdd', 'openrouter', 'docs'], qi = 0;
    if (reduce) { input.value = qs[0]; render(qs[0]); return stop; }
    render('');
    (function loop() {
      if (stopped || !root.isConnected) return;
      var q = qs[qi++ % qs.length], i = 0; input.value = '';
      (function type() {
        if (stopped) return;
        if (i < q.length) { input.value = q.slice(0, ++i); render(input.value); timer.push(setTimeout(type, 90 + Math.random() * 70)); }
        else timer.push(setTimeout(loop, 3400));
      })();
    })();
    return stop;
  }
  function mountView(root, name) {
    if (root._stop) { root._stop(); root._stop = null; }
    root.innerHTML = '<div class="app-view" data-view="' + name + '">' + views[name]() + '</div>';
    if (name === 'preview') root._stop = mountPreview(root);
  }

  window.AS = { $: $, $$: $$, esc: esc, ic: ic, fmt: fmt, K: K, TOOL: TOOL, DATA: DATA, S: S, byId: byId, href: href, hash: hash, search: search, needs: needs, writes: writes, runsHTML: runsHTML, writesHTML: writesHTML, codeHTML: codeHTML, tile: tile, heart: heart, author: author, link: link, toast: toast, banner: banner, copy: copy, dialog: dialog, closeBtn: closeBtn, openAuth: openAuth, requireAuth: requireAuth, signOut: signOut, install: install, quick: quick, openPalette: openPalette, sync: sync, reveal: reveal, mountView: mountView, reduce: reduce, provRows: provRows, provNames: function () { return provOrder.map(provName); } };

  window.AS_I18N.apply();
  var page = document.body.dataset.page, tk = 'title.' + page;
  if (window.AS_I18N.dict[tk] && page !== 'detail') document.title = t(tk);
  renderNav(); renderFooter(); renderPC();
  document.documentElement.classList.remove('i18n-pending');
  document.addEventListener('DOMContentLoaded', function () {
    sync(); reveal();
    var q = new URLSearchParams(location.search).get('open');
    if (q === 'palette') openPalette(); else if (q === 'login') openAuth(); else if (q === 'offline') banner(true);
  });
})();
