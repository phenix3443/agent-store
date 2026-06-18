# AI Agent Store — 设计文档

**日期**：2026-06-18  
**状态**：已批准  
**范围**：monorepo 整体架构，market 网站，client-core 引擎，CLI 工具

---

## 1. 背景与目标

建立 `ai-agents-store` GitHub 组织，开发两个互相配合的系统：

1. **market**：类 Raycast Store 风格的在线市场，管理优质 provider、skill、MCP 等 AI 工具
2. **client（CLI 优先，Tauri GUI 后续）**：本地工具，连接 market，管理用户本地 Claude/Codex 配置

**核心设计原则**：
- AI 亲和：TypeScript 统一语言，强类型，成熟框架，方便 AI 开发与调试
- 引擎与前端分离：client-core 为独立引擎，CLI 和 Tauri GUI 都是其消费者
- 中央仓库：`~/.agents/` 作为单一事实来源，各工具配置从此派生

---

## 2. 内容范围（当前版本）

支持三种内容类型，**plugin 留待后续迭代**：

| 类型 | 描述 |
|------|------|
| **Provider** | AI 模型提供商配置（API key、endpoint、支持的模型） |
| **Skill** | AI 工作流技能文件（Markdown/YAML，复制到工具配置目录） |
| **MCP** | Model Context Protocol 服务端（脚本/二进制 + 配置） |

发布者分层（参考 Docker Hub + VS Code Marketplace）：

| 层级 | 说明 |
|------|------|
| `official` | 组织官方维护 |
| `verified` | 申请认证的知名开发者，显示认证徽章 |
| `community` | 任何人提交，需经审核后发布 |

---

## 3. 数据模型

### 3.1 共享基础 Schema

```typescript
// packages/types
interface Publisher {
  id: string
  slug: string                              // 发布者唯一标识
  name: string
  avatarUrl: string
  tier: 'official' | 'verified' | 'community'
  bio?: string
}

interface BaseItem {
  id: string
  slug: string                              // 全局唯一标识，如 "openai-provider"
  name: string
  description: string
  readmeUrl: string                         // Supabase Storage URL，内容为 Markdown（文档用）
  icon: string                              // Supabase Storage URL
  category: 'provider' | 'skill' | 'mcp'
  version: string                           // semver
  publisher: Publisher                      // publisherTier 直接从 publisher.tier 读取，不单独存
  compatibleWith: ('claude' | 'codex')[]   // 支持的工具
  tags: string[]
  downloads: number
  // rating 字段预留，MVP 阶段始终为 0，评分功能后续迭代实现
  rating: number
  status: 'published' | 'pending' | 'rejected'
  installHook: InstallHook
  createdAt: string
  updatedAt: string
}

interface InstallHook {
  steps: Array<
    | { type: 'script'; command: string }   // ⚠️ 安全注意：MVP 阶段信任所有脚本，后续需引入签名验证
    | { type: 'config'; patch: Record<string, unknown> }
    | { type: 'file'; url: string; dest: string }
  >
}
// 示例：MCP 安装需要 file + config 两步
// steps: [
//   { type: 'file', url: '...', dest: 'server' },
//   { type: 'config', patch: { transport: 'stdio', serverCommand: './server' } }
// ]
//
// 两层安装模型说明：
// - installHook（服务端定义）：负责"下载什么文件、执行什么脚本、写什么初始配置模板"
// - client-core/installer/<type>.ts（客户端硬编码）：负责"把 ~/.agents/ 中的内容
//   翻译成各工具（Claude/Codex）能理解的具体配置格式"
// installHook 不感知工具差异，工具差异由 client-core 的 config/ 模块处理
```

### 3.2 各类型扩展字段

**Provider**：
```typescript
interface ProviderItem extends BaseItem {
  category: 'provider'
  configSchema: JsonSchema     // API key、endpoint 等必填项定义（JSON Schema draft-07）
  supportedModels: string[]
}
```

**Skill**：
```typescript
interface SkillItem extends BaseItem {
  category: 'skill'
  contentUrl: string           // skill 可安装文件的下载地址（区别于 readmeUrl 文档）
}
```

**MCP**：
```typescript
interface MCPItem extends BaseItem {
  category: 'mcp'
  transport: 'stdio' | 'sse' | 'http'
  // serverCommand：安装完成后启动 MCP server 的运行时命令（如 "./server"、"node server.js"）
  // 区别于 installHook（安装过程），serverCommand 是安装后写入工具配置的运行命令
  serverCommand: string
  configSchema: JsonSchema     // 用户需要填写的配置项（JSON Schema draft-07）
}

// JsonSchema 使用轻量内联类型，不引入外部依赖
type JsonSchema = Record<string, unknown>
```

---

## 4. 仓库结构

**单一 monorepo**：`ai-agents-store/platform`，Turborepo + pnpm workspaces

```
platform/
├── apps/
│   ├── market/          # Next.js 14 App Router + Supabase + Vercel
│   ├── client-core/     # TypeScript 引擎库，Bun 编译为二进制
│   └── cli/             # CLI 包装器，调用 client-core
│
├── packages/
│   ├── types/           # 共享 TypeScript 类型（所有 schema 定义）
│   └── sdk/             # market REST API 的类型化客户端
│
└── docs/
    └── superpowers/specs/
```

---

## 5. Market 架构

**技术栈**：Next.js 14 App Router · Supabase (PostgreSQL + Auth + Storage) · Tailwind CSS · Vercel

### 5.1 页面结构

```
/                          # 首页：Featured、Trending、New
/store                     # 全量浏览，支持 category 筛选 + 搜索
/store/[category]          # 分类页（providers / skills / mcps）
/store/[category]/[slug]   # 详情页：readme、版本历史、安装命令（评分 MVP 阶段不显示）
/publisher/[name]          # 发布者主页
/submit                    # 提交新条目（认证用户）
/dashboard                 # 用户仪表盘：已收藏（云端）、已发布、待审核
```

> **"已安装"与"已收藏"的区分**：market 是 web 应用，无法感知用户本地安装状态。dashboard 展示的是用户登录后保存的**云端收藏（bookmark）**，而非本地安装状态。本地实际安装状态由 client-core 的 `~/.agents/registry.json` 独立管理。两者可以独立存在：用户可以只收藏不安装，也可以离线安装不登录。

### 5.2 数据流

```
Supabase DB (items, versions, publishers)   # reviews 表 MVP 阶段不建
    ↑↓
Next.js API Routes (/api/*)
    ↑↓
market 前端页面 ←──── packages/sdk ←──── client-core
```

### 5.3 Supabase 职责

| 功能 | 用途 |
|------|------|
| PostgreSQL | 条目、版本、发布者数据（rating 列存在但始终为 0，评分系统后续迭代） |
| Auth | GitHub OAuth（开发者登录） |
| Storage | icon 文件、skill 内容文件 |

### 5.4 审核流程

- 社区提交 → `status: pending` → 管理员审核 → `published` / `rejected`
- `verified` / `official` 发布者可配置为自动发布

---

## 6. Client Core 架构

### 6.1 本地目录结构

`~/.agents/` 为**中央仓库（下载缓存 + 状态）**，各工具目录为**激活内容**。

**版本策略（MVP）**：每个 slug 只保留当前安装版本，更新时直接覆盖，不支持回滚。版本历史由 market 服务端管理，本地只保存当前版本号用于更新检查。

```
~/.agents/
├── providers/
│   └── openai/
│       ├── manifest.json      # 元数据、版本、configSchema、compatibleWith
│       └── config.json        # 用户实际配置（API key 等，明文存储，MVP 阶段不加密）
├── skills/
│   └── my-skill/
│       ├── manifest.json
│       └── skill.md           # skill 源文件
├── mcps/
│   └── filesystem-mcp/
│       ├── manifest.json
│       ├── server               # MCP server 可执行文件（任意格式，manifest 定义入口）
│       └── config.json
└── registry.json              # 已安装条目索引 + per-tool 启用状态
```

### 6.2 Registry 数据结构

```json
{
  "installed": [
    {
      "slug": "my-skill",
      "category": "skill",
      "version": "1.0.0",
      "installedAt": "2026-06-18T10:00:00Z",
      "compatibleWith": ["claude", "codex"],
      "enabledFor": {
        "claude": true,
        "codex": false
      }
    },
    {
      "slug": "filesystem-mcp",
      "category": "mcp",
      "version": "0.3.1",
      "installedAt": "2026-06-18T11:00:00Z",
      "compatibleWith": ["claude"],
      "enabledFor": {
        "claude": true
      }
    }
  ]
}
```

### 6.3 安装流程（两阶段）

install 命令自动执行两个阶段，Phase 2 也可通过 `aas sync` 手动触发（如工具配置被意外覆盖时）。

**幂等性**：对已安装的条目再次执行 `aas install <slug>` 等同于 `aas update <slug>`（更新到最新版本）。MVP 阶段 `install` 只安装最新版本，不支持指定版本号。

**默认 `enabledFor` 行为**：安装时对 `compatibleWith` 中的所有工具默认设为 `true`（全部启用）。用户可随后通过 `aas disable` 按需关闭。

```
aas install <slug>
    │
    ├── Phase 1：下载到 ~/.agents/<category>/<slug>/
    │           执行 installHook.steps（下载文件、执行脚本、写初始配置模板）
    │           Provider/MCP：写入空 config.json，install 完成后提示用户运行 aas config <slug>
    │           registry.json 中 enabledFor 默认所有 compatibleWith 工具为 true
    │
    └── Phase 2：sync（自动触发，对 enabledFor === true 的工具执行）
                │
                ├── Provider → 写入工具的 providers 配置段，提示用户填写 configSchema 必填项
                ├── Skill    → 复制 skill.md 到工具的 skills 目录，写入配置引用
                └── MCP      → 复制 server 文件，写入工具的 mcp_servers 配置段
```

### 6.4 Sync 规则

| 条件 | 行为 |
|------|------|
| `enabledFor.<tool>: true` | 复制文件到工具目录，写入工具配置 |
| `enabledFor.<tool>: false` | 从工具目录删除文件，移除工具配置引用 |
| `compatibleWith` 不含某工具 | 该工具的 enable 选项不可用 |

### 6.5 Engine API

```typescript
class AASEngine {
  search(query: string, options?: SearchOptions): Promise<Item[]>
  install(slug: string): Promise<InstallResult>
  uninstall(slug: string): Promise<void>
  enable(slug: string, target: 'claude' | 'codex'): Promise<void>
  disable(slug: string, target: 'claude' | 'codex'): Promise<void>
  // getConfigSchema：返回条目的 configSchema 和当前已填值，供 CLI/GUI 渲染表单
  getConfigSchema(slug: string): Promise<{ schema: JsonSchema; current: Record<string, unknown> }>
  // setConfig：接收填写好的配置值，写入 ~/.agents/<category>/<slug>/config.json 并触发 sync
  setConfig(slug: string, values: Record<string, unknown>): Promise<void>
  sync(targets?: ('claude' | 'codex')[]): Promise<SyncResult>
  // checkUpdates：对比本地 registry 版本与 market 最新版本，返回可更新列表
  checkUpdates(slugs?: string[]): Promise<UpdateAvailable[]>
  update(slug?: string): Promise<UpdateResult[]>
  list(options?: ListOptions): Promise<InstalledItem[]>
  info(slug: string): Promise<ItemDetail>
}
```

> **层职责边界**：engine 层只处理数据（返回 schema、保存 values），不做终端 I/O。交互式提示（问用户"请输入 API key"）由 CLI 层在拿到 schema 后自行渲染，GUI 层则渲染为表单组件。

### 6.6 Source 目录结构

```
apps/client-core/src/
├── index.ts           # 公共导出入口（export { AASEngine }，CLI 和 GUI 都从这里 import）
├── engine.ts          # AASEngine 实现
├── api/               # market API 客户端（调用 packages/sdk）
├── registry/          # ~/.agents/registry.json 读写
├── installer/         # install hook 执行器
│   ├── hook-runner.ts # 通用步骤执行器（file / script / config 三种 step 类型）
│   ├── provider.ts    # Provider 特有逻辑：installHook 后写入空 config.json（配置由 setConfig 填充）
│   ├── skill.ts       # Skill 特有逻辑：目前仅 file 步骤，无额外处理（留作扩展点）
│   └── mcp.ts         # MCP 特有逻辑：installHook 后对 server 文件执行 chmod +x
├── config/            # sync 逻辑：将 ~/.agents/ 内容**合并写入**各工具配置（不覆盖已有配置）
│   ├── claude.ts      # 深度合并 ~/.claude/settings.json；复制到 skills/；写入 mcp_servers.json
│   └── codex.ts       # 深度合并 ~/.codex/config.yaml；复制到 skills/
├── updater/           # 版本检查与更新
└── server.ts          # 本地 HTTP server（供 Tauri sidecar 调用，端口 37420）
```

> `apps/cli/` 有自己独立的 `src/index.ts` 作为入口，import AASEngine from `client-core`，不在 client-core 内部放 CLI 逻辑。

---

## 7. CLI

**技术栈**：TypeScript + Bun compile（产出单一二进制，无需 Node.js 运行时）

### 7.1 命令

```bash
aas search <query>                       # 搜索 market
aas install <slug>                       # 安装条目（已安装则更新到最新版本）
aas uninstall <slug>                     # 卸载
aas enable <slug> --for <claude|codex>   # 为指定工具启用
aas disable <slug> --for <claude|codex>  # 为指定工具禁用
aas config <slug>                        # 重新填写条目的 configSchema 必填项（Provider/MCP）
aas sync [--for <claude|codex>]          # 手动同步到工具配置
aas update [slug]                        # 显式检查并更新（不传则检查全部）
aas list [--for <claude|codex>]          # 查看已安装/已启用条目
aas info <slug>                          # 查看条目详情
```

---

## 8. Tauri GUI（未来）

**已确认**：未来 GUI 使用 Tauri（WebView + Rust 外壳）。

**Sidecar 模式**：client-core 编译为独立二进制，作为 Tauri sidecar 嵌入应用包。Tauri GUI（React + Tailwind）通过本地 HTTP 调用 `server.ts` 暴露的接口。默认端口 **`37420`**（可通过环境变量 `AAS_CORE_PORT` 覆盖），端口占用时自动递增查找可用端口并写入 `~/.agents/.port` 供 GUI 读取。

```
Tauri 应用包
├── GUI (WebView: React + Tailwind)   # 调用 localhost HTTP
└── sidecar: aas-core                 # client-core + server.ts 的编译产物
```

client-core **无需重写为 Rust**，TypeScript 实现直接复用。

---

## 9. 开发顺序

1. **monorepo 脚手架**：Turborepo + pnpm workspaces + packages/types（先定义所有共享类型）
2. **apps/market**：Next.js + Supabase，完成 store 核心页面及 API Routes
3. **packages/sdk**：从 market API 派生的类型化客户端（market API 稳定后实现）
4. **apps/client-core**：AASEngine 实现，`~/.agents/` 管理
5. **apps/cli**：CLI 命令，Bun 编译
6. **apps/tauri-gui**（后续）：GUI + sidecar 集成

---

## 10. 暂不实现

- Plugin 类型（后续迭代）
- Tauri GUI（CLI 完成后实现）
- 付费/订阅功能
- 评分/评论系统（market MVP 可暂缓）
