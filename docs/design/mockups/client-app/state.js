/* 原型状态：存在 sessionStorage，键与网站原型分开。已安装列表是演示用的本机状态，不是实测数据。 */
(function () {
  var KEY = 'as-client-proto';
  var AGENTS = [
    { id: 'claude', name: 'Claude Code', mark: 'Cc', dir: '~/.claude', skills: '~/.claude/skills', mcp: '~/.claude.json', mcpKey: 'mcpServers', env: 'CLAUDE_CONFIG_DIR', color: '#e0906f' },
    { id: 'codex', name: 'Codex', mark: 'Cx', dir: '~/.codex', skills: '~/.codex/skills', mcp: '~/.codex/config.toml', mcpKey: 'mcp_servers', env: 'CODEX_HOME', color: '#5fd6a4' }
  ];

  /* 项目示例：old-site 的目录已不存在；admux 模拟队友提交、本机还没填密钥的情形；agent-store 还没被 Codex 信任。 */
  function seedProjects() {
    return [
      { id: 'agent-store', name: 'agent-store', path: '~/code/agent-store', codexUntrusted: true, items: [
        { key: 'handoff', kind: 'skill', name: 'handoff', id: 'github:mattpocock/skills/handoff', ours: true, version: '9b1d44e07c21', on: { claude: true, codex: true } },
        { key: 'release-checklist', kind: 'skill', name: 'release-checklist', id: null, ours: false, on: { claude: true, codex: false } },
        { key: 'context7', kind: 'mcp', name: 'context7', id: 'mcp-registry:io.github.upstash/context7', ours: true, version: '4.7.0', on: { claude: true, codex: true }, vars: { CONTEXT7_API_KEY: 'ctx7sk-88d0c3a917f2' } },
        { key: 'admux', kind: 'mcp', name: 'admux', id: null, ours: false, on: { claude: true, codex: false }, needs: ['ADMUX_API_KEY'], vars: {} }
      ] },
      { id: 'blog', name: 'blog', path: '~/code/blog', items: [] },
      { id: 'old-site', name: 'old-site', path: '~/code/old-site', missing: true, items: [
        { key: 'tdd', kind: 'skill', name: 'tdd', id: 'github:mattpocock/skills/tdd', ours: true, version: '41c0be7d92aa', on: { claude: true, codex: false } }
      ] }
    ];
  }

  function seed() {
    return {
      projects: seedProjects(),
      lang: /^zh/i.test(navigator.language || '') ? 'zh' : 'en',
      signedIn: false, plan: 'free', agents: 'both', platform: 'mac', offline: false, size: 'auto',
      onboarded: false, legacy: true, usage: 'sample', relay: true, budget: null, favs: [], log: [],
      installed: [
        { slug: 'skills-find-skills', id: 'github:vercel-labs/skills/find-skills', kind: 'skill', deploy: 'find-skills', version: '76a98a285cb0', on: { claude: true, codex: true }, edited: true },
        { slug: 'skills-grill-me', id: 'github:mattpocock/skills/grill-me', kind: 'skill', deploy: 'grill-me', version: '3df14e2d3a89', on: { claude: true, codex: false }, clash: 'codex' },
        { slug: 'skills-tdd', id: 'github:mattpocock/skills/tdd', kind: 'skill', deploy: 'tdd', version: '41c0be7d92aa', latest: '667dbdd00c09', on: { claude: true, codex: true } },
        { slug: 'legacy-skill', id: null, kind: 'skill', name: 'legacy-skill', deploy: 'legacy-skill', version: '—', on: { claude: true, codex: true }, migrated: true },
        { slug: 'context7', id: 'mcp-registry:io.github.upstash/context7', kind: 'mcp', version: '4.6.2', latest: '4.7.0', on: { claude: true, codex: true }, cfg: { CONTEXT7_API_KEY: 'ctx7sk-2f9a71c04be8' } },
        { slug: 'mcp-server', id: 'mcp-registry:io.github.netdata/mcp-server', kind: 'mcp', version: '2.12.3', on: { claude: true, codex: false }, cfg: {}, changed: 'claude' },
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
  if (!S.projects) S.projects = seedProjects();
  var ql = /[?&]lang=(zh|en)/.exec(location.search); if (ql) S.lang = ql[1];

  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function reset() { var lang = S.lang; S = seed(); S.lang = lang; window.AS.state = S; save(); }

  function item(id) { for (var i = 0; i < AS_DATA.length; i++) if (AS_DATA[i].id === id) return AS_DATA[i]; return null; }
  function entry(slug) { for (var i = 0; i < S.installed.length; i++) if (S.installed[i].slug === slug) return S.installed[i]; return null; }
  function entryFor(id) { for (var i = 0; i < S.installed.length; i++) if (S.installed[i].id === id && !S.installed[i].parent) return S.installed[i]; return null; }
  function project(id) { for (var i = 0; i < S.projects.length; i++) if (S.projects[i].id === id) return S.projects[i]; return null; }
  function projItem(p, key) { for (var i = 0; p && i < p.items.length; i++) if (p.items[i].key === key) return p.items[i]; return null; }
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

  window.AS = { state: S, AGENTS: AGENTS, save: save, reset: reset, item: item, entry: entry, entryFor: entryFor, detected: detected, isPro: isPro, transport: transport, needs: needs, blocker: blocker, project: project, projItem: projItem, seedProjects: seedProjects };
})();
