/* 原型的模拟状态：登录、方案、是否装了客户端、收藏、已安装。存在 sessionStorage，读写失败时退回内存。 */
(function () {
  var KEY = 'as-proto-state';
  var DEFAULTS = { signedIn: false, user: { name: 'demo', email: 'demo@example.com' }, plan: { tier: 'free', period: null, since: null, cancel: false }, clientInstalled: false, favorites: [], installed: [], recent: [], lang: null };
  var mem = null;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function read() {
    if (mem) return mem;
    var s = clone(DEFAULTS);
    try { var raw = sessionStorage.getItem(KEY); if (raw) Object.assign(s, JSON.parse(raw)); } catch (e) {}
    mem = s; return s;
  }
  function write() {
    try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('as:state'));
  }
  var S = {
    get: function () { return read(); },
    set: function (patch) { Object.assign(read(), patch); write(); },
    reset: function () { var l = read().lang; mem = clone(DEFAULTS); mem.lang = l; write(); },
    has: function (list, id) { return read()[list].indexOf(id) > -1; },
    toggle: function (list, id, on) {
      var a = read()[list], i = a.indexOf(id);
      if (on === undefined) on = i < 0;
      if (on && i < 0) a.unshift(id); else if (!on && i > -1) a.splice(i, 1);
      write(); return on;
    },
    isPro: function () { return read().plan.tier === 'pro'; }
  };
  /* ?set=in,client,pro 让交互说明页能直接链到某个状态；应用后从地址里去掉。 */
  try {
    var q = new URLSearchParams(location.search), set = q.get('set'), lg = q.get('lang');
    if (lg === 'zh' || lg === 'en') { read().lang = lg; if (!set) set = 'keep'; }
    if (set) {
      var s = read();
      set.split(',').forEach(function (k) {
        if (k === 'in') s.signedIn = true;
        if (k === 'out') s.signedIn = false;
        if (k === 'client') s.clientInstalled = true;
        if (k === 'noclient') s.clientInstalled = false;
        if (k === 'free') s.plan = clone(DEFAULTS.plan);
        if (k === 'pro') s.plan = { tier: 'pro', period: 'monthly', since: Date.now(), cancel: false };
        if (k === 'reset') { var l = s.lang; mem = clone(DEFAULTS); mem.lang = l; s = mem; }
      });
      try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {}
      q.delete('set'); q.delete('lang');
      var rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  } catch (e) {}
  window.AS_STATE = S;
})();
