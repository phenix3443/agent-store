/* 原型状态：存在 sessionStorage，键与网站原型分开。已安装列表是演示用的本机状态，不是实测数据。 */
(function () {
  var KEY = 'as-client-proto';
  var AGENTS = [
    { id: 'claude', name: 'Claude Code', dir: '~/.claude', skills: '~/.claude/skills', mcp: '~/.claude.json', mcpKey: 'mcpServers', env: 'CLAUDE_CONFIG_DIR', color: '#e0906f' },
    { id: 'codex', name: 'Codex', dir: '~/.codex', skills: '~/.codex/skills', mcp: '~/.codex/config.toml', mcpKey: 'mcp_servers', env: 'CODEX_HOME', color: '#5fd6a4' }
  ];

  function seed() {
    return {
      lang: /^zh/i.test(navigator.language || '') ? 'zh' : 'en',
      signedIn: false, plan: 'free', agents: 'both', platform: 'mac', offline: false, size: 'auto',
      onboarded: false, legacy: true, usage: 'sample', relay: true, budget: null, favs: [], log: [],
      installed: [
        { slug: 'skills-find-skills', id: 'github:vercel-labs/skills/find-skills', kind: 'skill', deploy: 'find-skills', version: '76a98a285cb0', on: { claude: true, codex: true } },
        { slug: 'skills-grill-me', id: 'github:mattpocock/skills/grill-me', kind: 'skill', deploy: 'grill-me', version: '3df14e2d3a89', on: { claude: true, codex: false } },
        { slug: 'skills-tdd', id: 'github:mattpocock/skills/tdd', kind: 'skill', deploy: 'tdd', version: '41c0be7d92aa', latest: '667dbdd00c09', on: { claude: true, codex: true }, edited: true },
        { slug: 'legacy-skill', id: null, kind: 'skill', name: 'legacy-skill', deploy: 'legacy-skill', version: '—', on: { claude: true, codex: true }, migrated: true },
        { slug: 'context7', id: 'mcp-registry:io.github.upstash/context7', kind: 'mcp', version: '4.6.2', latest: '4.7.0', on: { claude: true, codex: true }, cfg: { CONTEXT7_API_KEY: 'ctx7sk-2f9a71c04be8' } },
        { slug: 'mcp-server', id: 'mcp-registry:io.github.netdata/mcp-server', kind: 'mcp', version: '2.12.3', on: { claude: true, codex: false }, cfg: {}, changed: 'claude' },
        { slug: 'textarttools-mcp', id: 'mcp-registry:io.github.humanjesse/textarttools-mcp', kind: 'mcp', version: '1.0.0', on: { claude: true, codex: false }, cfg: {} },
        { slug: 'local', id: 'builtin:local', kind: 'provider', version: '1.0.0', on: { claude: true, codex: true }, cfg: { name: 'local', baseUrl: 'http://127.0.0.1:18100' } },
        { slug: 'skyapi', id: 'builtin:skyapi', kind: 'provider', version: '1.0.0', on: { claude: true, codex: false }, cfg: { name: 'SkyAPI', apiKey: 'sk-sky-4c81d09e27aa51f3', level: 1 } },
        { slug: 'openrouter', id: 'builtin:openrouter', kind: 'provider', version: '1.0.0', on: { claude: false, codex: true }, cfg: { name: 'OpenRouter', apiKey: 'sk-or-v1-93be5d1c7740a2e8', level: 1 } },
        { slug: 'yls', id: 'builtin:yls', kind: 'provider', version: '1.0.0', on: { claude: false, codex: false }, cfg: { name: 'YLS', apiKey: '', level: 2 } }
      ]
    };
  }

  var S;
  try { S = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.installed) S = seed();

  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function reset() { var lang = S.lang; S = seed(); S.lang = lang; window.AS.state = S; save(); }

  function item(id) { for (var i = 0; i < AS_DATA.length; i++) if (AS_DATA[i].id === id) return AS_DATA[i]; return null; }
  function entry(slug) { for (var i = 0; i < S.installed.length; i++) if (S.installed[i].slug === slug) return S.installed[i]; return null; }
  function entryFor(id) { for (var i = 0; i < S.installed.length; i++) if (S.installed[i].id === id && !S.installed[i].parent) return S.installed[i]; return null; }
  function detected(agent) { return S.agents === 'both' || (S.agents === 'claude' && agent === 'claude'); }
  function isPro() { return S.plan === 'pro'; }

  /* MCP 的运行方式。规则同 client-core/catalog/mcp-plan.ts：先看包（npm→npx，PyPI→uvx，OCI→docker），再看远程地址。 */
  function transport(it) {
    if (!it || it.kind !== 'mcp') return null;
    if (it.launch) { var c = it.launch.split(' ')[0]; return { type: c === 'docker' ? 'docker' : c === 'uvx' ? 'uvx' : 'npx', text: it.launch, remote: false }; }
    return { type: it.sse ? 'sse' : 'http', text: it.remote, remote: true };
  }
  /* 必填项：安装后要在配置页填的环境变量或令牌。 */
  function needs(it) {
    if (!it) return [];
    if (it.kind === 'provider') return it.id === 'builtin:local' ? [] : [{ key: 'apiKey', secret: true, required: true }];
    var tr = transport(it), out = [], seen = {};
    (it.runs || []).forEach(function (r, i) {
      if (r[0] !== 'needs') return;
      /* 只取与所选运行方式相邻的那组 needs */
      var prev = it.runs[i - 1] || [];
      var forRemote = prev[0] === 'connect';
      if (tr && tr.remote !== forRemote) return;
      r[1].split(',').forEach(function (k) {
        k = k.trim(); if (!k || seen[k]) return; seen[k] = 1;
        var bearer = k === 'Authorization';
        out.push({ key: bearer ? 'API_KEY' : k, secret: true, required: true, bearer: bearer });
      });
    });
    return out;
  }
  /* 某个 agent 能不能启用这一项；不能时给出引擎里的原因代码。 */
  function blocker(it, agent, cfg) {
    if (!it) return null;
    if (it.compatible && it.compatible.indexOf(agent) < 0) return 'incompatible';
    if (it.kind === 'mcp' && agent === 'codex' && it.sse) return 'sse';
    var miss = needs(it).some(function (n) { return n.required && !(cfg && cfg[n.key]); });
    if (miss) return it.kind === 'provider' ? 'no-key' : 'needs-config';
    return null;
  }

  window.AS = { state: S, AGENTS: AGENTS, save: save, reset: reset, item: item, entry: entry, entryFor: entryFor, detected: detected, isPro: isPro, transport: transport, needs: needs, blocker: blocker };
})();
