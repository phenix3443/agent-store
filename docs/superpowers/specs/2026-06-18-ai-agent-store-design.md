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
interface BaseItem {
  id: string
  slug: string                              // 全局唯一标识，如 "openai-provider"
  name: string
  description: string
  readme: string                            // Markdown 内容
  icon: string                              // URL
  category: 'provider' | 'skill' | 'mcp'
  version: string                           // semver
  publisher: Publisher
  publisherTier: 'official' | 'verified' | 'community'
  compatibleWith: ('claude' | 'codex')[]   // 支持的工具
  tags: string[]
  downloads: number
  rating: number
  status: 'published' | 'pending' | 'rejected'
  installHook: InstallHook
  createdAt: string
  updatedAt: string
}

interface InstallHook {
  type: 'script' | 'config' | 'file'
  command?: string
  configPatch?: Record<string, unknown>
  files?: { url: string; dest: string }[]
}
```

### 3.2 各类型扩展字段

**Provider**：
```typescript
interface ProviderItem extends BaseItem {
  category: 'provider'
  configSchema: JSONSchema     // API key、endpoint 等必填项定义
  supportedModels: string[]
}
```

**Skill**：
```typescript
interface SkillItem extends BaseItem {
  category: 'skill'
  contentUrl: string           // skill 文件下载地址
}
```

**MCP**：
```typescript
interface MCPItem extends BaseItem {
  category: 'mcp'
  transport: 'stdio' | 'sse' | 'http'
  serverCommand: string        // 启动 MCP server 的命令
  configSchema: JSONSchema     // 用户需要填写的配置项
}
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
/store/[category]/[slug]   # 详情页：readme、版本历史、安装按钮、评分
/publisher/[name]          # 发布者主页
/submit                    # 提交新条目（认证用户）
/dashboard                 # 用户仪表盘：已安装、已发布、待审核
```

### 5.2 数据流

```
Supabase DB (items, versions, publishers, reviews)
    ↑↓
Next.js API Routes (/api/*)
    ↑↓
market 前端页面 ←──── packages/sdk ←──── client-core
```

### 5.3 Supabase 职责

| 功能 | 用途 |
|------|------|
| PostgreSQL | 条目、版本、评分、发布者数据 |
| Auth | GitHub OAuth（开发者登录） |
| Storage | icon 文件、skill 内容文件 |

### 5.4 审核流程

- 社区提交 → `status: pending` → 管理员审核 → `published` / `rejected`
- `verified` / `official` 发布者可配置为自动发布

---

## 6. Client Core 架构

### 6.1 本地目录结构

`~/.agents/` 为**中央仓库（下载缓存 + 状态）**，各工具目录为**激活内容**：

```
~/.agents/
├── providers/
│   └── openai/
│       ├── manifest.json      # 元数据、版本、configSchema、compatibleWith
│       └── config.json        # 用户实际配置（API key 等）
├── skills/
│   └── my-skill/
│       ├── manifest.json
│       └── skill.md           # skill 源文件
├── mcps/
│   └── filesystem-mcp/
│       ├── manifest.json
│       ├── server.js          # MCP server 脚本
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
      "compatibleWith": ["claude", "codex"],
      "enabledFor": {
        "claude": true,
        "codex": false
      }
    },
    {
      "slug": "filesystem-mcp",
      "category": "mcp",
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

```
aas install <slug>
    │
    ├── Phase 1：下载到 ~/.agents/<category>/<slug>/
    │           执行 installHook（下载文件、写配置模板）
    │
    └── Phase 2：sync（自动触发）
                ├── enabledFor.claude === true
                │     → 复制 skill.md 到 ~/.claude/skills/
                │     → 写入 ~/.claude/settings.json
                │     → 写入 ~/.claude/mcp_servers.json
                └── enabledFor.codex === true
                      → 复制 skill.md 到 ~/.codex/skills/
                      → 写入 ~/.codex/config.yaml
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
  sync(targets?: ('claude' | 'codex')[]): Promise<SyncResult>
  update(slug?: string): Promise<UpdateResult[]>
  list(options?: ListOptions): Promise<InstalledItem[]>
  info(slug: string): Promise<ItemDetail>
}
```

### 6.6 Source 目录结构

```
apps/client-core/src/
├── engine.ts          # AASEngine 入口
├── api/               # market API 客户端（调用 packages/sdk）
├── registry/          # ~/.agents/registry.json 读写
├── installer/         # install hook 执行器
│   ├── provider.ts
│   ├── skill.ts
│   └── mcp.ts
├── config/            # sync 逻辑：写入 Claude/Codex 配置
│   ├── claude.ts
│   └── codex.ts
├── updater/           # 版本检查与更新
├── server.ts          # 本地 HTTP server（供 Tauri sidecar 调用）
└── cli-entry.ts       # CLI 直接调用入口
```

---

## 7. CLI

**技术栈**：TypeScript + Bun compile（产出单一二进制，无需 Node.js 运行时）

### 7.1 命令

```bash
aas search <query>                    # 搜索 market
aas install <slug>                    # 安装条目
aas uninstall <slug>                  # 卸载
aas enable <slug> --for <claude|codex>   # 为指定工具启用
aas disable <slug> --for <claude|codex>  # 为指定工具禁用
aas sync [--for <claude|codex>]       # 手动同步到工具配置
aas update [slug]                     # 更新（不传则更新全部）
aas list [--for <claude|codex>]       # 查看已安装/已启用条目
aas info <slug>                       # 查看条目详情
```

---

## 8. Tauri GUI（未来）

**已确认**：未来 GUI 使用 Tauri（WebView + Rust 外壳）。

**Sidecar 模式**：client-core 编译为独立二进制，作为 Tauri sidecar 嵌入应用包。Tauri GUI（React + Tailwind）通过本地 HTTP 调用 `server.ts` 暴露的接口。

```
Tauri 应用包
├── GUI (WebView: React + Tailwind)   # 调用 localhost HTTP
└── sidecar: aas-core                 # client-core + server.ts 的编译产物
```

client-core **无需重写为 Rust**，TypeScript 实现直接复用。

---

## 9. 开发顺序

1. **monorepo 脚手架**：Turborepo + pnpm workspaces + packages/types
2. **packages/sdk**：market API 客户端类型定义
3. **apps/market**：Next.js + Supabase，完成 store 核心页面
4. **apps/client-core**：AASEngine 实现，`~/.agents/` 管理
5. **apps/cli**：CLI 命令，Bun 编译
6. **apps/tauri-gui**（后续）：GUI + sidecar 集成

---

## 10. 暂不实现

- Plugin 类型（后续迭代）
- Tauri GUI（CLI 完成后实现）
- 付费/订阅功能
- 评分/评论系统（market MVP 可暂缓）
