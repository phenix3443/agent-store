// Desktop UI translations. Each locale mirrors the same nested key structure;
// missing keys fall back to Chinese (see resolve() in ./index.tsx). Grown
// incrementally as components are externalized.

export const LOCALES = ['zh', 'en'] as const
export type Locale = (typeof LOCALES)[number]

type Dict = Record<string, unknown>

const zh: Dict = {
  installLink: {"confirmTitle": "确认安装", "loading": "正在从目录获取", "publisher": "发布者", "category": "类别", "steps": "安装时会执行 / 写入", "providerNext": "安装后会打开配置页，密钥在那里填写。", "fromWeb": "这次安装由网页链接发起。安装后 agent 可以执行其中的内容，请确认来源可信再继续。", "confirm": "确认安装", "installing": "安装中…", "view": "查看", "close": "关闭", "invalidTitle": "无法识别的链接", "invalidBody": "这个链接的格式不对，已忽略。安装链接只接受包标识，形如 install?slug=<包标识>。", "notFoundTitle": "没有找到这个包", "notFoundBody": "目录里没有这个标识的包，可能已下架，或链接有误。", "catalogErrorTitle": "目录暂时取不到", "catalogErrorBody": "无法从目录获取这个包的信息，没有安装任何东西。请检查网络后重新点击链接。", "installedTitle": "已经安装过了", "installedBody": "这个包已安装，无需重复安装。", "mismatchTitle": "链接与目录不一致", "mismatchBody": "链接声明的类别和目录里这个包的类别不一致，没有安装任何东西。", "failedTitle": "安装失败", "failedBody": "安装没有完成，详情见下方和终端日志。"},
  tier: {"official": "官方", "verified": "已验证", "community": "社区"},
  status: {"published": "已发布", "pending": "审核中", "rejected": "已拒绝"},
  readme: {"overview": "概述", "install": "安装", "steps": "安装步骤", "useCases": "适用场景", "useCaseProvider": "安装后作为可切换的 API 端点预设，一键切换即可对全部会话生效。", "useCaseSkill": "安装后 agent 会在相关任务中自动加载该技能，无需额外配置。", "useCaseMcp": "安装后自动注册为 MCP 服务器，agent 可直接调用其暴露的工具。", "writeConfig": "写入配置", "skillDownloadTo": "下载 skill 内容到", "skillRegister": "注册到已启用的工具目录", "mcpBuild": "拉取并构建服务器二进制", "writeMcp": "写入", "remoteEndpoint": "远程端点", "writeEndpointPreset": "写入端点预设", "syncToCli": "同步到 Claude 与 Codex 配置", "factModels": "支持的模型：", "factTransport": "传输方式：", "factStartCommand": "启动命令：", "factServiceUrl": "服务地址：", "factDownloadUrl": "下载地址：", "footType": "类型：", "footMaintainer": "维护者：", "footVersion": "当前版本："},
  cfg: {"multiKeyTitle": "额外密钥（按请求轮换）", "addKey": "+ 添加密钥", "warnNoTargets": "尚未选择适用客户端，此配置已保存但不会对任何 CLI 生效", "warnNoApiKey": "尚未填写 API 密钥，此配置已保存但暂时无法使用", "namePlaceholder": "给这份配置起个名字", "nameRequired": "请先填写配置名称", "autoSaving": "自动保存中…", "autoSaved": "已自动保存", "applicableClients": "适用客户端", "apiUrl": "API 地址", "apiKey": "API 密钥", "moreSettings": "更多设置", "moreSettingsHint": "API 地址 · 端点 · 协议 · 认证 · 图标 · 优先级 —— 均有默认值，可不填", "providerName": "供应商名称", "readonly": "（不可修改）", "readonlyTip": "供应商名称由资源本身决定，不可修改", "homepage": "官网地址", "apiEndpoint": "API 端点", "endpointPlaceholder": "留空使用默认，如 /v1/chat/completions", "upstreamProtocol": "上游协议", "autoDetect": "自动检测", "authType": "认证方式", "custom": "自定义", "customHeaderLabel": "自定义 Header 名称", "customHeaderPlaceholder": "如 Authorization、X-Custom-Key", "icon": "图标", "default": "默认", "priorityGroup": "优先级分组", "advancedSettings": "高级设置", "advancedHint": "模型白名单 · 模型映射 · CLI 覆盖 · 可用性监控", "whitelist": "模型白名单", "whitelistPlaceholder": "输入模型名称，如 claude-*", "add": "添加", "modelMapping": "模型映射", "mapFromPlaceholder": "CLI 模型（如 claude-*）", "mapToPlaceholder": "供应商模型（如 kimi-k2）", "addMapping": "添加映射", "healthCheck": "可用性监控", "healthCheckHint": "启用后会定期健康检查，监控此供应商的可用性", "helpTargets": "这份配置对哪些 CLI 生效，可多选。至少选择一个。", "helpBaseUrl": "上游供应商的真实地址，留空使用默认。Claude / Codex 始终指向本地代理，代理再按 Level 顺序把请求转发到这里。", "helpEndpoint": "覆盖平台默认端点。留空使用默认（claude: /v1/messages，codex: /responses）。GLM 模型请使用 /v1/chat/completions", "helpUpstreamProtocol": "指定上游 API 的协议类型。自动检测时根据端点判断；openai_chat 时自动转换请求与响应格式", "helpAuthType": "默认使用 Bearer。Anthropic 官方 API 请选择 X-API-Key。", "helpLevel": "数字越小优先级越高，Level 1 会被优先尝试，失败后依次尝试 Level 2、Level 3 等", "helpLocalBaseUrl": "本地代理的监听地址。把 Claude Code / Codex 的 API 地址指向这里即可。"},
  policy: { enableFailed: '启用失败', disableFailed: '停用失败', saveFailed: '保存失败，配置保持为上次保存的内容', installFailed: '安装失败', configure: '配置', warnNeedsConfig: '填写带 * 的必填项后才能对客户端启用', warnNoTargets: '尚未对任何客户端启用，此 MCP 已安装但不会生效', noConfig: '这个 MCP 不需要配置，选择客户端即可启用。', unsupported: '不支持该客户端', fillFirst: '先填写必填项', codexEnv: 'Codex 从环境变量读取这个值，启动 Codex 前先执行', uninstallFailed: '卸载失败', forceHint: '这些内容在 Agent Store 之外被改动过。强制卸载会把它们一并删除。', forceUninstall: '强制卸载', close: '关闭' },
  filters: { featured: '精选', popular: '最热门', recent: '最近发布', recommended: '推荐', installed: '已安装', updates: '可更新', enabled: '已启用', disabled: '已禁用' },
  resList: { searchPlaceholder: '搜索，或用 @ 过滤…', clear: '清除', filter: '筛选过滤', discover: '发现', status: '状态', targetApp: '目标应用', configured: '已配置', recommended: '推荐', configure: '配置', uninstalledPrefix: '已卸载', childAddedPrefix: '已新增子配置', addChildAria: '新增子配置', uninstallAria: '卸载', deleteAria: '删除' },
  info: { installInfo: '安装信息', id: '标识', version: '版本', updatedAt: '更新时间', market: '市场', published: '发布', lastPublished: '最近发布', category: '分类', resources: '资源', storePage: 'Store 页面', source: '源码 (SKILL.md)' },
  extra: { upgradeCta: '升级到 Pro', noUsageData: '暂无用量数据' },
  detail: { selectHint: '从左侧选择一个资源查看详情', installedPrefix: '已安装', favorite: '收藏', unfavorite: '取消收藏', copyCmd: '复制安装命令', configCountSuffix: '份配置 · 在左侧列表展开该条目即可管理', quality: '质量', tabReview: '审查', tabVersion: '版本', qualityScore: '质量评分', reviewPoints: '审查要点', autoReviewNote: '由自动质量与安全审查生成 · 用户评价系统尚未上线', noReview: '暂无自动审查记录', userReviews: '用户评价', anon: '匿名', reviewOnWeb: '在网页版商店可发表评价', currentVersion: '当前版本', riskLow: '低风险', riskMedium: '中等风险', riskHigh: '高风险' },
  health: { title: '供应商健康', coolingSuffix: '冷却中', cooldown: '冷却', recoverNow: '立即恢复', healthy: '正常', minutes: '分钟', seconds: '秒', errAuth: '认证失败', errRate: '被限流', errOverload: '过载', errServer: '服务端错误', errNetwork: '网络错误' },
  budget: { title: '本月预算', sub: '消费预算与告警', edit: '编辑', placeholder: '设置月度预算，留空表示不限', ariaLabel: '月度预算', projected: '预计月末', overBudget: '已超出预算', nearLimit: '接近预算上限' },
  usage: { exported: '已导出到', exportFailed: '导出失败', exportLabel: '导出近 30 天用量账单' },
  proxyLog: { title: '本地代理 · 请求日志', sub: '按 Level 顺序转发，失败自动降级', fallback: '降级' },
  overview: { trend: '消耗趋势', trendSub: '用量数据统计', today: '今日', last7: '近 7 天', last30: '近 30 天', totalCost: '总费用', totalTokens: '总 Tokens', totalRequests: '总请求数', modelCount: '模型分布', running: '运行中', stopped: '已停止', listenAddr: '监听地址', todayRequests: '今日请求', successRate: '成功率', recentRequests: '最近请求', viewAll: '查看全部', fallback: '（降级）', updatesAvailable: '可更新', all: '全部', update: '更新' },
  pro: {
    budget: { title: '预算与超支告警', desc: '设置月度消费预算，实时追踪本月花费、月末预测与超支提醒，并可导出账单。' },
    smartRouting: { title: '智能路由', desc: '多上游自动故障转移，主动避开正在冷却/限流的供应商，健康恢复后自动切回。Free 版为最多两路的基础降级。' },
    keyRotation: { title: '多 Key 轮换', desc: '为同一供应商配置多把密钥，Pro 会在请求之间轮换使用以分摊限流。' },
  },
  common: { install: '安装', installed: '已安装', cancel: '取消', save: '保存', saving: '保存中…', saved: '已保存', currentPrefix: '当前：' },
  nav: { store: '商店', overview: '概览', settings: '设置' },
  categories: { provider: '供应商', skill: '技能', mcp: 'MCP' },
  window: { close: '关闭', minimize: '最小化', maximize: '最大化' },
  settings: {
    title: '设置',
    close: '关闭',
    tabs: { account: '账户', general: '通用', about: '关于' },
    account: {
      notSignedIn: '未登录',
      signedIn: '已登录',
      disconnected: '未连接',
      logout: '退出登录',
      signInGithub: '使用 GitHub 登录',
      signInGoogle: '使用 Google 登录',
      plan: '订阅计划',
      planPro: 'Pro · 无限私有资源 + 高级用量分析',
      planFree: 'Free · 升级解锁预算告警等 Pro 功能',
      upgrade: '升级 Pro',
      notConfigured: '登录暂不可用：未配置商店中转地址（VITE_STORE_URL）。',
      hint: '登录后可发布私有资源、跨设备同步已安装的技能 / MCP / 供应商 / 插件，并接收更新推送。',
    },
    general: { theme: '主题', dark: '暗色', light: '亮色', toggle: '切换', targetApp: '默认目标应用', language: '界面语言', languageSub: '选择界面显示语言' },
    about: { subtitle: 'registry client', docs: '文档', github: 'GitHub', checkUpdates: '检查更新', checking: '检查中…', upToDate: '已是最新', updatesSuffix: '个可更新', checkFailed: '检查失败' },
  },
}

const en: Dict = {
  installLink: {"confirmTitle": "Confirm install", "loading": "Fetching from the catalog:", "publisher": "Publisher", "category": "Category", "steps": "Installing will run / write", "providerNext": "The configuration page opens after install; enter your key there.", "fromWeb": "This install was started by a web link. Agents can execute what this package contains, so continue only if you trust the source.", "confirm": "Install", "installing": "Installing…", "view": "View", "close": "Close", "invalidTitle": "Unrecognized link", "invalidBody": "This link is malformed and was ignored. Install links carry only a package ID, like install?slug=<package-id>.", "notFoundTitle": "Package not found", "notFoundBody": "The catalog has no package with this ID. It may have been removed, or the link is wrong.", "catalogErrorTitle": "Catalog unavailable", "catalogErrorBody": "The package details could not be fetched and nothing was installed. Check your network and open the link again.", "installedTitle": "Already installed", "installedBody": "This package is already installed.", "mismatchTitle": "Link does not match the catalog", "mismatchBody": "The category in the link differs from this package's category in the catalog. Nothing was installed.", "failedTitle": "Install failed", "failedBody": "The install did not finish. See the details below and the terminal log."},
  tier: {"official": "Official", "verified": "Verified", "community": "Community"},
  status: {"published": "Published", "pending": "In review", "rejected": "Rejected"},
  readme: {"overview": "Overview", "install": "Install", "steps": "Install steps", "useCases": "Use cases", "useCaseProvider": "Installs as a switchable API endpoint preset — one click applies it to all sessions.", "useCaseSkill": "Once installed, the agent auto-loads this skill for relevant tasks, with no extra config.", "useCaseMcp": "Installs and registers as an MCP server; the agent can call its exposed tools directly.", "writeConfig": "write config", "skillDownloadTo": "download skill content to", "skillRegister": "register to the enabled tools directory", "mcpBuild": "fetch and build the server binary", "writeMcp": "write", "remoteEndpoint": "remote endpoint", "writeEndpointPreset": "write endpoint preset", "syncToCli": "sync to Claude & Codex config", "factModels": "Supported models: ", "factTransport": "Transport: ", "factStartCommand": "Start command: ", "factServiceUrl": "Service URL: ", "factDownloadUrl": "Download URL: ", "footType": "Type: ", "footMaintainer": "Maintainer: ", "footVersion": "Current version: "},
  cfg: {"multiKeyTitle": "Extra keys (rotated per request)", "addKey": "+ Add key", "warnNoTargets": "No client selected yet — this config is saved but won't apply to any CLI", "warnNoApiKey": "No API key set — this config is saved but not usable", "namePlaceholder": "Name this config", "nameRequired": "Please enter a config name", "autoSaving": "Auto-saving…", "autoSaved": "Auto-saved", "applicableClients": "Applies to", "apiUrl": "API URL", "apiKey": "API key", "moreSettings": "More settings", "moreSettingsHint": "API URL · endpoint · protocol · auth · icon · priority — all optional, with defaults", "providerName": "Provider name", "readonly": "(read-only)", "readonlyTip": "The provider name is set by the resource and can't be changed", "homepage": "Website", "apiEndpoint": "API endpoint", "endpointPlaceholder": "Blank for default, e.g. /v1/chat/completions", "upstreamProtocol": "Upstream protocol", "autoDetect": "Auto-detect", "authType": "Auth type", "custom": "Custom", "customHeaderLabel": "Custom header name", "customHeaderPlaceholder": "e.g. Authorization, X-Custom-Key", "icon": "Icon", "default": "Default", "priorityGroup": "Priority group", "advancedSettings": "Advanced", "advancedHint": "Model whitelist · model mapping · CLI overrides · availability monitoring", "whitelist": "Model whitelist", "whitelistPlaceholder": "Enter a model name, e.g. claude-*", "add": "Add", "modelMapping": "Model mapping", "mapFromPlaceholder": "CLI model (e.g. claude-*)", "mapToPlaceholder": "Provider model (e.g. kimi-k2)", "addMapping": "Add mapping", "healthCheck": "Availability monitoring", "healthCheckHint": "When on, runs periodic health checks to monitor this provider", "helpTargets": "Which CLIs this config applies to (multi-select). Pick at least one.", "helpBaseUrl": "The real upstream provider URL; blank uses the default. Claude/Codex always point at the local relay, which forwards here in Level order.", "helpEndpoint": "Override the platform default endpoint. Blank uses the default (claude: /v1/messages, codex: /responses). For GLM models use /v1/chat/completions", "helpUpstreamProtocol": "Set the upstream API protocol. Auto-detect infers from the endpoint; openai_chat auto-converts request/response formats.", "helpAuthType": "Defaults to Bearer. For the official Anthropic API choose X-API-Key.", "helpLevel": "Lower numbers mean higher priority: Level 1 is tried first, then Level 2, Level 3, and so on.", "helpLocalBaseUrl": "The local relay's listen address. Point Claude Code / Codex's API URL here."},
  policy: { enableFailed: "Couldn't enable", disableFailed: "Couldn't disable", saveFailed: "Couldn't save; the last saved config is kept", installFailed: 'Install failed', configure: 'Configure', warnNeedsConfig: 'Fill in the required fields (*) before enabling a client', warnNoTargets: 'Not enabled for any client yet — this MCP is installed but inactive', noConfig: 'This MCP needs no configuration; pick a client to enable it.', unsupported: "This client isn't supported", fillFirst: 'Fill in the required fields first', codexEnv: 'Codex reads this value from the environment; before starting Codex run', uninstallFailed: 'Uninstall failed', forceHint: 'These were changed outside Agent Store. Force uninstall removes them anyway.', forceUninstall: 'Force uninstall', close: 'Close' },
  filters: { featured: 'Featured', popular: 'Most popular', recent: 'Recent', recommended: 'Recommended', installed: 'Installed', updates: 'Updatable', enabled: 'Enabled', disabled: 'Disabled' },
  resList: { searchPlaceholder: 'Search, or filter with @…', clear: 'Clear', filter: 'Filter', discover: 'Discover', status: 'Status', targetApp: 'Target app', configured: 'Configured', recommended: 'Recommended', configure: 'Configure', uninstalledPrefix: 'Uninstalled', childAddedPrefix: 'Added sub-config', addChildAria: 'Add sub-config', uninstallAria: 'Uninstall', deleteAria: 'Delete' },
  info: { installInfo: 'Install info', id: 'ID', version: 'Version', updatedAt: 'Updated', market: 'Marketplace', published: 'Published', lastPublished: 'Last published', category: 'Category', resources: 'Resources', storePage: 'Store page', source: 'Source (SKILL.md)' },
  extra: { upgradeCta: 'Upgrade to Pro', noUsageData: 'No usage data' },
  detail: { selectHint: 'Select an item on the left to view details', installedPrefix: 'Installed', favorite: 'Favorite', unfavorite: 'Unfavorite', copyCmd: 'Copy install command', configCountSuffix: 'config(s) · expand this item in the left list to manage', quality: 'Quality', tabReview: 'Review', tabVersion: 'Versions', qualityScore: 'Quality score', reviewPoints: 'Review notes', autoReviewNote: 'Generated by automated quality & safety review · user reviews coming soon', noReview: 'No automated review yet', userReviews: 'User reviews', anon: 'Anonymous', reviewOnWeb: 'Post a review on the web store', currentVersion: 'Current version', riskLow: 'Low risk', riskMedium: 'Medium risk', riskHigh: 'High risk' },
  health: { title: 'Provider health', coolingSuffix: 'cooling', cooldown: 'Cooldown', recoverNow: 'Recover now', healthy: 'Healthy', minutes: 'min', seconds: 's', errAuth: 'Auth failed', errRate: 'Rate limited', errOverload: 'Overloaded', errServer: 'Server error', errNetwork: 'Network error' },
  budget: { title: "This month's budget", sub: 'spending budget & alerts', edit: 'Edit', placeholder: 'Set a monthly budget, leave blank for unlimited', ariaLabel: 'Monthly budget', projected: 'Projected month-end', overBudget: 'Over budget', nearLimit: 'Near budget limit' },
  usage: { exported: 'Exported to', exportFailed: 'Export failed', exportLabel: 'Export the last 30 days of usage' },
  proxyLog: { title: 'Local relay · request log', sub: 'Forwards in Level order, auto-fallback on failure', fallback: 'Fallback' },
  overview: { trend: 'Usage trend', trendSub: 'Usage statistics', today: 'Today', last7: 'Last 7 days', last30: 'Last 30 days', totalCost: 'Total cost', totalTokens: 'Total tokens', totalRequests: 'Total requests', modelCount: 'Models', running: 'Running', stopped: 'Stopped', listenAddr: 'Listen address', todayRequests: "Today's requests", successRate: 'Success rate', recentRequests: 'Recent requests', viewAll: 'View all', fallback: ' (fallback)', updatesAvailable: 'Updates', all: 'All', update: 'Update' },
  pro: {
    budget: { title: 'Budget & overspend alerts', desc: 'Set a monthly spend budget with real-time tracking, month-end forecasts, overspend alerts, and billing export.' },
    smartRouting: { title: 'Smart routing', desc: 'Automatic failover across upstreams, proactively avoiding cooling/rate-limited providers and switching back when healthy. Free offers basic failover across up to two upstreams.' },
    keyRotation: { title: 'Key rotation', desc: 'Configure multiple keys per provider; Pro rotates across them per request to spread rate limits.' },
  },
  common: { install: 'Install', installed: 'Installed', cancel: 'Cancel', save: 'Save', saving: 'Saving…', saved: 'Saved', currentPrefix: 'Current: ' },
  nav: { store: 'Store', overview: 'Overview', settings: 'Settings' },
  categories: { provider: 'Providers', skill: 'Skills', mcp: 'MCP' },
  window: { close: 'Close', minimize: 'Minimize', maximize: 'Maximize' },
  settings: {
    title: 'Settings',
    close: 'Close',
    tabs: { account: 'Account', general: 'General', about: 'About' },
    account: {
      notSignedIn: 'Not signed in',
      signedIn: 'Signed in',
      disconnected: 'Disconnected',
      logout: 'Log out',
      signInGithub: 'Sign in with GitHub',
      signInGoogle: 'Sign in with Google',
      plan: 'Subscription',
      planPro: 'Pro · unlimited private items + advanced analytics',
      planFree: 'Free · upgrade to unlock budget alerts and more',
      upgrade: 'Upgrade to Pro',
      notConfigured: 'Sign-in unavailable: store relay URL not configured (VITE_STORE_URL).',
      hint: 'Sign in to publish private items, sync your installed skills / MCP / providers / plugins across devices, and get update notifications.',
    },
    general: { theme: 'Theme', dark: 'Dark', light: 'Light', toggle: 'Toggle', targetApp: 'Default target app', language: 'Language', languageSub: 'Choose the interface language' },
    about: { subtitle: 'registry client', docs: 'Docs', github: 'GitHub', checkUpdates: 'Check for updates', checking: 'Checking…', upToDate: 'Up to date', updatesSuffix: 'update(s) available', checkFailed: 'Check failed' },
  },
}

export const messages: Record<Locale, Dict> = { zh, en }
