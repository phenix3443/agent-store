# Agent Store

Claude Code 和 Codex 的应用商店加本地管理客户端：在网页上找技能（skill）、MCP 服务和模型供应商（provider），一键装进本机的 Claude Code 和 Codex，在桌面客户端里管理已装的东西、切换供应商、查看用量。

- 网页商店（测试环境）：<https://agent-store-test.panghuli.tech>
- 桌面客户端下载：[GitHub Releases](https://github.com/phenix3443/agent-store/releases/latest)，macOS（通用版）、Windows、Linux（.deb / .rpm / .AppImage）

## 能装什么

| 类别 | 来源 | 装到哪 |
|---|---|---|
| MCP 服务 | [官方 MCP Registry](https://registry.modelcontextprotocol.io) | Claude Code 和 Codex 的 MCP 配置，按包类型写成 `npx` / `uvx` / `docker` 启动命令或远程地址 |
| 技能 | GitHub 上的技能仓库，安装量来自 skills.sh | 先下载到本机技能库 `~/.agent-store/skills/`，再链接进各工具的 `skills/` 目录，可以按工具单独开关 |
| 供应商 | 代码里的内置列表 | 本地代理（local relay）的上游配置 |

目录由 `catalog-sync` 工作流每 6 小时从上游同步一次，生成 `catalog.db`。API 只读这份文件，不实时转发上游请求。

## 组成

| 目录 | 是什么 |
|---|---|
| `apps/store` | 网页商店，Next.js；同时负责登录（Better Auth） |
| `apps/api` | API，Hono + Bun；目录读 `catalog.db`，用户、订阅等数据在 `app.db`（SQLite） |
| `apps/cli` | 命令行 `aas`：搜索、安装、启用/停用、项目级安装、本地代理、用量 |
| `apps/client-core` | `aas` 和桌面客户端共用的安装逻辑：各工具的配置读写、技能库、安装记录 |
| `apps/cli-gui` | 桌面客户端，Tauri 2；把 `aas` 作为附带程序打进安装包，处理网页上的 `agent-store://` 安装链接 |
| `packages/types`、`packages/sdk` | 共享类型和 API 客户端 |

## 命令行

桌面客户端自带 `aas`（Linux 安装包放在 `/usr/bin/aas`）。从源码运行：

```sh
pnpm install
pnpm exec turbo build --filter=@as/client-core
bun apps/cli/src/index.ts search brainstorming
bun apps/cli/src/index.ts install github:obra/superpowers/brainstorming
```

`aas` 默认连测试环境，设 `AS_STORE_URL` 可以换成别的 API 地址。

### 项目级技能和 MCP

技能和 MCP 也可以装进某个项目自己的文件，随版本库共享给队友，不写用户级配置：

```sh
aas projects add ~/code/web                        # 登记已有目录
aas install github:obra/superpowers/brainstorming --project ~/code/web
aas install mcp-registry:io.github.github/github-mcp-server --project ~/code/web
aas projects show ~/code/web                       # 项目里实际生效的技能和 MCP，含不是 Agent Store 装的
aas projects set-env ~/code/web GITHUB_PERSONAL_ACCESS_TOKEN   # 从标准输入读值，只存在本机
aas projects exec ~/code/web -- claude             # 带上本机保存的值启动 agent
```

技能复制到 `.claude/skills/` 和 `.agents/skills/`；MCP 写进 `.mcp.json`（Claude Code）和 `.codex/config.toml`（Codex，项目被 Codex 信任后才生效）。这些文件里只写环境变量名，密钥的值存在 `~/.agent-store/project-env.json`，由 `aas projects exec` 或 `eval "$(aas projects env <项目>)"` 交给 agent。`aas uninstall <slug> --project <项目>` 只删 Agent Store 装的内容。细节见 [`docs/project-scope.md`](docs/project-scope.md)。

## 本地开发

需要 Node 22、pnpm 11、Bun；改桌面客户端还要 Rust 和 [Tauri 的系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
make setup     # 建本地 app.db 并迁移，生成 apps/store/.env.local
make dev-env   # 同时启动 API、网页商店和桌面客户端
```

`apps/store/.env.local` 需要填 `BETTER_AUTH_SECRET`，以及一个回调地址为 `http://localhost:3000/api/auth/callback/github` 的 GitHub OAuth App。桌面客户端在开发模式下只读写 `/tmp` 下的临时目录，不碰本机真实的 `~/.claude` 和 `~/.codex`。其余目标见 `Makefile`。

测试、构建和截图都在 GitHub Actions 上跑，不要在共用主机上跑。各工作流在 `.github/workflows/`，其中：

- `unit`：改动涉及的包做类型检查、lint 和单测
- `e2e`：用真实的 Claude Code 和 Codex 验证装上的技能和 MCP 确实被调用到
- `desktop-shots`：在 Docker 里装 Linux 安装包，点 `agent-store://` 链接走完安装流程并截图
- `store-screenshots`：网页商店在 390 / 820 / 1440 px、深浅两色、中英两种语言下的截图

## 文档

- [`AGENTS.md`](AGENTS.md)：改代码的规则，网页和桌面端界面各以什么为准
- [`docs/DEPLOY.md`](docs/DEPLOY.md)：测试环境、发布流程、目录同步、登录和支付配置
- [`docs/global-skills-mcp.md`](docs/global-skills-mcp.md)：技能和 MCP 在 Claude Code、Codex 里的存放方式，以及安装逻辑的设计
- [`docs/project-scope.md`](docs/project-scope.md)：项目级技能和 MCP：写到哪里、什么时候生效、密钥怎么留在本机
- [`apps/store/DESIGN.md`](apps/store/DESIGN.md)、[`apps/store/PRODUCT.md`](apps/store/PRODUCT.md)：网页商店的视觉规范和产品说明
- [`test/e2e/README.md`](test/e2e/README.md)、[`test/desktop-linux/README.md`](test/desktop-linux/README.md)：两套端到端测试
