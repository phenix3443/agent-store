# 桌面客户端功能盘点

盘点基于 `agent-store` 仓库 main 分支 `f7deb96`（2026-11-13 阅读源码得出，没有运行客户端）。路径相对仓库根目录。

「把握」一列的口径：

- **CI 实跑**：`test/desktop-linux/shots.sh` 在真实窗口里走过这条流程，并在磁盘上核对结果。
- **有单测**：对应组件或引擎模块有 `__tests__`，我只确认了测试文件存在，没有运行。
- **仅代码**：代码里有，没找到对应测试，或界面没有入口。
- **没有**：代码里不存在，原型里是新设计。

## 一、支持的 agent

| 事实 | 位置 | 把握 |
|---|---|---|
| 只支持 Claude Code 与 Codex（`ToolTarget = 'claude' \| 'codex'`） | `packages/types/src/engine.ts`、`apps/cli-gui/src/state/AppState.tsx` | CI 实跑 |
| Claude Code 写 `~/.claude/skills/<name>` 与 `~/.claude.json` 的 `mcpServers`；`CLAUDE_CONFIG_DIR` 可改位置 | `apps/client-core/src/paths.ts`、`config/claude-mcp.ts` | CI 实跑 |
| Codex 写 `~/.codex/skills/<name>` 与 `~/.codex/config.toml` 的 `[mcp_servers.<name>]`；`CODEX_HOME` 可改位置 | `paths.ts`、`config/codex-mcp.ts` | CI 实跑 |
| 界面里没有「检测是否装了某个 agent」这一步。引擎找不到 `claude` / `codex` 可执行文件时改为直接改配置文件 | `config/cli-runner.ts`、`docs/global-skills-mcp.md` §5 | 仅代码 |

## 二、目录与发现

| 功能 | 位置 | 把握 |
|---|---|---|
| 搜索目录（250ms 防抖，每页 50 条，「加载更多」） | `components/ResourceList.tsx` → RPC `search` | CI 实跑（步骤 3 搜 playwright） |
| 按类别筛选：供应商 / 技能 / MCP | `components/IconRail.tsx`、`ResourceList.tsx` | 有单测 |
| 排序：默认、安装量、最近更新；「精选」= 默认顺序里 `verified` 的条目 | `lib/catalog.ts` `sortForFilter` | 有单测 |
| 状态筛选：已安装、可更新、已启用、已禁用（按当前「目标应用」算） | `lib/resources.ts` | 有单测 |
| 目录取不到时显示上次缓存的第一页，并提示 | `client-core/src/catalog-cache.ts`、`ResourceList.tsx` `offline` | 有单测 |
| 详情：名称、作者、安装量、星标、说明、安装步骤、运行方式、来源、版本、复制 `aas install` 命令、打开网站上的 Store 页面 | `components/DetailPanel.tsx`、`InfoSidebar.tsx`、`lib/detailContent.ts` | 有单测；CI 截图 02 |
| 收藏（只存在内存里，重启即失） | `state/AppState.tsx` `favoriteSlugs` | 仅代码 |
| 「暂不能安装」：目录条目没有引擎能运行的安装方式 | `DetailPanel.tsx` `installError`、`McpNotInstallableError` | 有单测 |
| 补充搜索（#152） | API 侧，默认关闭 | 不在客户端里，原型不出现 |

## 三、安装、启用、停用、卸载、更新

| 功能 | 位置 | 把握 |
|---|---|---|
| 安装并对所有兼容的 agent 启用（`installAndEnable`），没有「先选 agent」这一步 | `DetailPanel.tsx`、`ResourceList.tsx`、`client-core/src/engine.ts` | CI 实跑 |
| 引擎支持只对一个 agent 安装（`InstallOptions.target`，CLI `--target`） | `packages/types/src/engine.ts`、`apps/cli/src/commands/install.ts` | 有单测；界面没用到 |
| 必填项没填时：装上但不启用，自动打开配置页（`needs-config` / `no-key`） | `lib/installPolicy.ts` `needsSetup` | CI 实跑（步骤 6、8） |
| 按 agent 启用 / 停用技能，各自一份部署（软链接，失败时复制） | `components/SkillTargets.tsx`、`client-core/src/skills/deploy.ts` | CI 实跑（步骤 4） |
| 技能目录里已有同名内容且不是 Agent Store 放的 → 拒绝，可「强制启用」 | `SkillDeployRefusedError`、`SkillTargets.tsx` | 有单测 |
| Codex 已能看到另一个同名技能 → 拒绝（`name-clash`），可强制 | `SkillConflictError` | 有单测 |
| MCP：agent 配置里已有同名条目且不是 Agent Store 写的 → 冲突，不写入 | `McpConflictError`、`config/mcp-ownership.ts` | 有单测 |
| MCP 冲突时「替换并接管」，停用或卸载时写回原条目（`EnableOptions.replace`，CLI `--replace`） | `engine.ts`、`apps/cli/src/commands/enable.ts` | 有单测；**界面没有这个按钮**，现在的提示是让用户自己去改名或删除 |
| MCP 条目在 Agent Store 之外被改过 → 停用、卸载、改配置都拒绝；卸载可「强制卸载」 | `McpChangedOutsideError`、`components/UninstallFailedDialog.tsx` | 有单测 |
| 技能文件在本地被改过 → 普通卸载拒绝，可强制 | `SkillConflictError`、`UninstallFailedDialog.tsx` | 有单测 |
| 卸载：列表里的 × 直接卸载，没有确认框 | `ResourceList.tsx` `uninstall` | 有单测 |
| 检查更新、单项更新 | `Overview.tsx`、`client-core/src/updater/index.ts` | 有单测 |
| 全部更新（`aas update` 不带参数） | `apps/cli/src/commands/update.ts` | 有单测；界面没有入口 |
| 操作记录（`$ aas install …` 一类的行） | `state/TerminalLog.tsx` | 仅代码：只有状态，没有显示它的组件 |

## 四、从网页安装（`agent-store://`）

| 功能 | 位置 | 把握 |
|---|---|---|
| `agent-store://install?id=<目录 id>`（或旧的 `slug=`）在任何界面上弹出确认框；链接只带标识，其余参数丢弃 | `lib/deepLinkRoute.ts`、`components/InstallLinkDialog.tsx` | CI 实跑（步骤 2、5–8） |
| 确认框：名称、id、版本、发布者、类别、「安装时会执行 / 写入」、来自网页的提醒；初始焦点在「取消」 | `InstallLinkDialog.tsx` `ConfirmBody` | CI 实跑 |
| 提示：链接无法识别 / 没有找到这个包 / 目录暂时取不到 / 已经安装过了（带「查看」）/ 链接与目录类别不一致 / 安装失败 | `InstallLinkDialog.tsx` `NoticeReason` | 有单测；「已经安装过了」CI 实跑（步骤 4、9） |
| 供应商永远不算「已安装」：每次安装是多一份配置 | `InstallLinkDialog.tsx` `lookup` | 有单测 |
| 应用由链接启动时也处理这条链接 | `lib/deepLink.ts` `getLaunchDeepLinks` | CI 实跑 |

## 五、技能库

| 功能 | 位置 | 把握 |
|---|---|---|
| 技能整个目录存在 `~/.agent-store/skills/<slug>/`，带 `.agent-store.json` 标记 | `client-core/src/skills/store.ts` | CI 实跑 |
| 每个 agent 一份部署，记录路径、方式（链接 / 复制）、来源哈希 | `skills/deploy.ts`、registry `deployments.<tool>` | CI 实跑 |
| 在界面里显示库路径、打开所在文件夹 | — | 没有 |
| 批量启用 / 停用 | — | 没有（引擎和界面都没有） |

## 六、MCP

| 功能 | 位置 | 把握 |
|---|---|---|
| 运行方式由客户端从目录数据算出：npm → `npx -y`，PyPI → `uvx`，OCI → `docker run -i --rm`，否则远程地址（streamable-http 优先于 SSE） | `client-core/src/catalog/mcp-plan.ts` | 有单测；npx 一条 CI 实跑 |
| 配置页：必填项带 *，500ms 自动保存，密钥字段遮蔽（`x-secret`） | `components/McpConfigPanel.tsx` | 有单测；CI 截图 09 |
| Bearer 令牌：Claude Code 写进请求头；Codex 从环境变量读，界面提示 `export <变量>=…` | `McpConfigPanel.tsx`、`config/codex-mcp.ts` | 有单测 |
| 只有 SSE 的远程服务器只能对 Claude Code 启用；需要 Bearer 以外请求头的也是 | `CodexMcpUnsupportedError` | CI 实跑（步骤 7） |
| 提示：必填项没填 / 没对任何 agent 启用 | `McpConfigPanel.tsx` | 有单测 |

## 七、供应商与本地中转

| 功能 | 位置 | 把握 |
|---|---|---|
| 内置供应商 `local`（本地中转）置顶；其余供应商每次「配置」多一份配置（`duplicateProvider`），挂在原条目下 | `lib/catalog.ts` `pinLocalFirst`、`ResourceList.tsx` | 有单测；CI 截图 12 |
| 供应商配置：名称、适用 agent、API 密钥（**明文输入框**）、API 地址、官网、端点、上游协议、认证方式（Bearer / X-API-Key / 自定义请求头）、图标、优先级 Level 1–10 | `components/ProviderConfigPanel.tsx` | 有单测 |
| 高级：模型白名单、模型映射、可用性监控开关 | `ProviderConfigPanel.tsx`、`relay/model-whitelist.ts`、`relay/model-mapping.ts` | 有单测 |
| 中转按 Level 从小到大转发，失败换下一个 | `relay/provider-order.ts`、`relay/forward.ts`、`relay/server.ts` | 有单测 |
| Free：最多 2 个上游的基础降级（`FREE_MAX_UPSTREAMS = 2`） | `relay/server.ts` | 有单测 |
| Pro「智能路由」：跳过冷却中的供应商，恢复后切回；健康卡片与「立即恢复」 | `relay/server.ts`、`usage/provider-health.ts`、`components/ProviderHealthCard.tsx` | 有单测 |
| Pro「多 Key 轮换」 | `relay/server.ts` `selectApiKey`、`ProviderConfigPanel.tsx` `MultiKeyEditor` | 有单测 |
| 中转状态（运行中 / 已停止）、监听地址 `127.0.0.1:18100`、今日请求数与成功率 | `components/Overview.tsx` | 有单测 |
| 在界面里启动 / 停止中转 | CLI `aas relay start\|stop\|status`；RPC 有 `toggleLocalConfig` 但界面没调用 | 仅代码 |
| 请求日志（最近请求、是否降级、延迟、状态码） | `components/ProxyLogModal.tsx` | 有单测 |
| 拖动调整优先级 | — | 没有：只有每个供应商一个 Level 数字 |
| 测试连接 | — | 没有 |

## 八、用量

| 功能 | 位置 | 把握 |
|---|---|---|
| 趋势图与四个汇总数（费用、Tokens、请求数、模型数），今日 / 近 7 天 / 近 30 天 | `Overview.tsx`、`components/UsageTrendChart.tsx` | 有单测 |
| 按供应商、按模型、按 agent 的明细：数据行里有这些字段，CLI `aas usage --provider --for` 能筛 | `client-core/src/usage/queries.ts`、`apps/cli/src/commands/usage.ts` | 有单测；界面只画了汇总 |
| Pro：月度预算、月末预测、接近 / 超出提醒 | `components/BudgetCard.tsx`、`usage/budget.ts` | 有单测 |
| Pro：导出近 30 天账单（CSV / JSON，写到 `~/.agent-store/exports/`） | `components/UsageExport.tsx`、`usage/export.ts` | 有单测 |
| 没有数据时显示「暂无用量数据」 | `UsageTrendChart.tsx` | 有单测 |

## 九、账号与方案

| 功能 | 位置 | 把握 |
|---|---|---|
| 用 GitHub 或 Google 登录：打开系统浏览器到网站的 `/auth/desktop`，完成后经 `agent-store://auth-callback?token=…` 回到客户端 | `state/Auth.tsx`、`lib/storeAuth.ts` | 有单测 |
| 等待浏览器回跳的中间状态 | — | 没有：点完按钮界面不变 |
| 登录状态只在内存里，重启要重新登录 | `state/Auth.tsx`（`useState`） | 仅代码（我读到的是这样，未运行确认） |
| Pro 开放三项：预算与导出（`advancedUsageAnalytics`）、智能路由（`smartRouting`）、多 Key 轮换（`keyRotation`）；方案缓存在 `~/.agent-store/entitlement.json`，离线可用 | `client-core/src/entitlement/index.ts`、`components/ProGate.tsx` | 有单测 |
| 升级：`createCheckout('monthly')` 拿到结账地址，在浏览器打开 | `components/SettingsModal.tsx` | 有单测 |

## 十、设置

| 功能 | 位置 | 把握 |
|---|---|---|
| 界面语言：中文 / English | `i18n/index.tsx`、`SettingsModal.tsx` | 有单测 |
| 主题：暗色 / 亮色切换 | `SettingsModal.tsx`、`globals.css` | 有单测 |
| 「默认目标应用」只显示，不能在设置里改（在列表筛选菜单里切） | `SettingsModal.tsx` | 有单测 |
| 关于：版本号（`tauri.conf.json` 为 0.2.2）、文档、GitHub | `SettingsModal.tsx` | 有单测 |
| 「检查更新」检查的是**已安装资源**有没有新版本，不是客户端自身 | `SettingsModal.tsx` `checkForUpdates` → RPC `checkUpdates` | 有单测 |
| 客户端自动更新 | Tauri 配置里没有 updater 插件 | 没有 |
| 数据位置 `~/.agent-store/`（`AS_HOME` 可改） | `paths.ts`、`docs/global-skills-mcp.md` §0 | CI 实跑 |
| 跨设备同步 | 只出现在账号页的说明文字里 | 没有（规划中） |

## 十一、首次启动与迁移

| 功能 | 位置 | 把握 |
|---|---|---|
| 升级后第一次调用引擎时，把旧目录 `~/.agents` 里 Agent Store 的文件搬到 `~/.agent-store`，带标记的技能补上每个 agent 的部署，别的工具的内容不动 | `client-core/src/home-migrate.ts`、`apps/cli/src/startup.ts` | CI 实跑（步骤 0、1） |
| 这一步是自动、无界面的 | — | 界面上没有任何提示 |
| 引导流程、检测已装的 agent、导入用户自己已有的技能或 MCP 配置 | — | 没有 |

## 十二、命令行 `aas`

`search`、`install`、`uninstall`、`enable`、`disable`、`config`、`sync`、`relay start|stop|status`、`usage`、`update`、`migrate`、`info`、`doctor`、`list`。位置 `apps/cli/src/index.ts` 与 `apps/cli/src/commands/`，每条命令有单测；`disable`、`search`、`info`、`enable`、`list`、`doctor` 在 CI 里实跑。

界面没有对应入口的：`sync`、`doctor`、`migrate`、`relay start|stop`、不带参数的 `update`。

## 十三、原型相对现有代码新增的设计

以下在原型里出现，代码里没有，需要拍板：

1. 首次启动引导（检测 agent、迁移报告）。
2. 安装前选择 agent（引擎已支持单个 `target`，多选需要界面逐个调用）。
3. MCP 冲突时的「替换现有条目」按钮（引擎已支持 `replace`）。
4. 卸载确认框。
5. 命令面板与全局快捷键。
6. 登录的等待状态。
7. 技能库路径显示、在文件管理器中显示。
8. 供应商上移 / 下移（改写 Level 数字）；界面里的中转开关。
9. 用量按供应商 / 模型的明细表（数据已有）。
10. 密钥输入框遮蔽与显示切换。
11. 操作记录面板（状态已有，缺显示）。
12. 「全部更新」按钮（CLI 已有）。

## 十四、不出现在原型里的

- 安装前的安全预览承诺、安全审核标记、逐字节还原承诺、评分评论、发布。
- `verified` 标记：目录数据里有，含义没有查实，原型不显示，避免被读成审核结论。
- 测试连接：代码里没有。
- 亮色主题：代码里有，原型只做深色。
- 客户端自动更新：代码里没有，原型只给「去官网下载」。
- 跨设备同步：只作为设置里一条禁用的「即将推出」。
