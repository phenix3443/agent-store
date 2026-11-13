# 部署

只有一个测试环境，跑在 home-lab 的 k3s 集群上（节点 `vm-149`，美国），公网地址 `https://agent-store-test.panghuli.tech`，经 Cloudflare Tunnel 进集群。商店和 API 共用这个域名，ingress 按路径分流：`/api/auth/*` 给商店，其余 `/api/*` 给 API，其他路径给商店。

| 组件 | 地址 | 镜像 |
|---|---|---|
| 网页商店（含登录） | `https://agent-store-test.panghuli.tech` | `ghcr.io/phenix3443/agent-store-store` |
| API | `https://agent-store-test.panghuli.tech/api/*` | `ghcr.io/phenix3443/agent-store-api` |

部署清单、密钥和入口配置在 home-lab 仓库的 `projects/agent-store/test/`，那里的 README 写了怎么排查。

## 应用数据（app.db）

用户、会话等登录数据和订阅记录都在一个 SQLite 文件 `app.db` 里，没有 Postgres。API 和商店都打开这个文件：商店里的 Better Auth 读写登录表，API 读写 `subscriptions` 和 `processed_webhooks`。

- **路径**：两个服务都读环境变量 `APP_DB_PATH`，默认 `/var/lib/agent-store/app.db`。
- **建库和迁移**：只有 API 的 `bun src/migrate.ts` 会建库，它同时把库设为 WAL（写进文件，之后所有连接都是 WAL）。商店启动时找不到这个文件就报错退出，不会自己建表。
- **单写者**：SQLite 同一时刻只有一个写者。两边每个连接都设 `busy_timeout=5000` 和 `foreign_keys=ON`，多语句的写事务都以 `BEGIN IMMEDIATE` 开始。抢不到写锁时等待最多 5 秒，而不是立刻报 `SQLITE_BUSY`。
- **部署约束**：API 只能 `replicas: 1`，更新策略 `Recreate`，发版时有几秒不可用。API 和商店两个 Pod 必须调度到同一节点（按专用节点标签选，不用 `kubernetes.io/hostname`），挂同一个 local-path 卷。要多副本时改回 Postgres 或托管 SQLite（如 D1）。
- **快照**：`bun src/snapshot.ts <输出路径>` 用 `VACUUM INTO` 生成一致快照，API 照常写入也不受影响；输出文件已存在时失败，成功退出 0、失败非 0。镜像里带 busybox 的 `tar`，`kubectl cp` 可用。
- **备份**：netcup 主机上的 systemd 定时器每 6 小时 `kubectl exec` 跑一次快照写到 Pod 的 `/tmp/`，`kubectl cp` 出来压缩后存到 115（`/home/lsl/115/backups/agent-store/`），保留 14 天；115 没挂载时直接失败。定时器、脚本和恢复演练都在 home-lab 仓库。测试环境最多丢 6 小时数据。

```sh
# 在 API Pod 里
bun src/snapshot.ts /tmp/app-snapshot.db
```

## 发布流程

1. PR 合入 `main`。
2. `images` 工作流在 GitHub 托管的 runner 上构建两个镜像，推到 ghcr，tag 为 `main-<UTC 时间戳>`。
3. home-lab 的 Flux 扫到新 tag，提交回 home-lab 并滚动更新。
4. API Pod 启动前，初始化容器先跑 `bun src/migrate.ts`，建库（首次）并迁移 `app.db`。迁移失败时新版本不会开始接流量。

商店的 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL` 在构建镜像时写进浏览器端代码，改地址要改 `.github/workflows/images.yml` 并重新构建。

## 资源目录（catalog.db）

skill、MCP 和 provider 的目录不在 `app.db` 里，而是另一个独立的 SQLite 文件 `catalog.db`，代码在 `apps/api/src/catalog/`。

- **生成**：`catalog-sync` 工作流每 6 小时跑一次（也可手动触发），下载 `catalog` 这个 release 里上一版的 `catalog.db` 和 `discovery.db`，执行 `bun run sync:catalog`，再把 gzip 压缩后的 `catalog.db.gz`、`discovery.db.gz` 和 `report.json` 覆盖上传到这个 release（预发布、不标为 latest，以免影响桌面端下载页取最新版本）。release 里列着某个文件却下载失败时工作流直接失败，不会从空库开始再覆盖上传。同步报告写在该次运行的 job summary 里，三个文件同时作为工作流产物 `catalog-sync` 保留 14 天。同步最后用 GraphQL 批量查 MCP 服务器仓库和技能仓库的 GitHub 星标（每次 100 个仓库、花 1 点额度，用工作流自带的 `GITHUB_TOKEN`，一次只发一个查询：GitHub 的二级限流按服务器 CPU 时间算，并发会很快被拦），只查 3 天内没查过的仓库，勾选 `full` 时全部重查；每次运行最多查 20 分钟，没查完的留给下一次；报告里的「GitHub stars」一节写了查了多少、剩余额度和耗时。可用条目数少于上一版的 80% 时不上传、工作流失败；确认是上游真的变少了，再手动触发并勾选 `allow-shrink`。
- **只在 main 上发布**：上传 release 的步骤只在 `main` 上、且没勾选 `dry-run` 时执行。其他分支手动触发只留工作流产物，用来验证改动；填 `seed-run`（某次运行的 ID）时从那次运行的产物开始，而不是从 release 开始，这样能在分支上连续跑两次，检查第二次记录的排名变化。
- **来源**：MCP 来自官方 MCP Registry（按 `updated_since` 增量）；provider 是 `sources/providers.ts` 里的内置列表；skill 分两步：先从技能目录站发现，再用 GitHub tree API 扫描仓库。加一个目录站就是在 `sources/` 下加一个实现 `DiscoverySource` 的模块并登记到 `sources/index.ts` 的 `defaultDiscoverySources`。
- **用户搜索**（`GET /api/resources`）只查 `catalog.db`。目录站不可用时，API 继续用上一次成功发布的文件。本地结果不够时去别的技能站补搜是另一个接口，见下文「搜索补充」。
- **读取**：API 启动时先打开本地副本，再从 `CATALOG_URL` 下载新版，之后每 `CATALOG_REFRESH_SECONDS` 秒用 ETag 检查一次；新文件校验通过才原子替换，下载失败时继续用旧的。

| 变量 | 用途 |
|---|---|
| `CATALOG_URL` | `catalog.db` 的下载地址，测试环境是 `https://github.com/phenix3443/agent-store/releases/download/catalog/catalog.db`。不设时只读 `CATALOG_PATH`，不更新 |
| `CATALOG_PATH` | 本地副本路径，默认 `$TMPDIR/agent-store/catalog.db`，目录要可写 |
| `CATALOG_REFRESH_SECONDS` | 检查新版本的间隔，默认 300，最小 30 |

本地生成一份：`cd apps/api && GITHUB_TOKEN=… bun run sync:catalog --db /tmp/catalog.db --discovery /tmp/discovery.db`（加 `--finds-url <API 地址>/api/discovery/export` 时同时读入 API 补搜到的条目），再用 `CATALOG_PATH=/tmp/catalog.db` 启动 API。不带 `--discovery` 时不读目录站，只重扫 `catalog.db` 里已有的技能仓库。不带 `GITHUB_TOKEN` 时 GitHub 每小时只给 60 次请求，扫不完 skill 仓库，没扫到的仓库保留上一版的数据。

### 技能发现（discovery.db）

`discovery.db` 记录各目录站列出的技能、按时间和来源保存的热度快照，以及待扫描的 GitHub 仓库队列。API 不读它，所以单独成文件，不放进下发给 API 的 `catalog.db`。代码在 `apps/api/src/catalog/discovery.ts` 和 `sources/` 下的三个站点模块，HTTP 请求用 `ky`（429/503 时按 `Retry-After` 等待后重试，最多等 60 秒、重试 3 次）。

| 来源 | 读什么 | 每次读多少 | 访问条件 |
|---|---|---|---|
| `skills-sh` | 首页（累计榜）、`/trending`、`/hot` 三个榜单页，是同一个站点的三种信号 | 每个榜单页面内嵌的前 600 条；报告写明榜单总数（约 9900） | 官方 `/api/v1` 要 Vercel OIDC 令牌，`robots.txt` 禁止 `/api/`，所以只读页面。页面结构一变就报「leaderboard data not found」，本来源失败，其他来源照常 |
| `clawhub` | `GET /api/v1/skills`：`downloads` 榜、`trending` 榜（近 7 天安装，响应里没有数值，只记排名）、按 `createdAt` 的全目录 | 下载榜 2 页、趋势榜 1 页（约 160 条）、目录每次 5 页（每页 200 条），第一页总从最新开始，其余从上次停下的游标继续，读到底后下一轮从头再来；游标被拒（HTTP 400）时清掉重来 | 官方文档允许第三方目录使用公开读取接口，要求缓存、遵守 429、链接回 `https://clawhub.ai/<owner>/skills/<slug>`；匿名每 IP 每分钟 3000 次读取。只取 `nonSuspiciousOnly=true` 的条目。`robots.txt` 对爬虫写了 `Disallow: /api/`，这里按文档对 API 客户端的明确许可使用 |
| `skillhub` | `GET https://api.skillhub.cn/api/skills`：`downloads`、`installs` 两个榜，以及按下载量排序的全目录 | 每个榜 2 页、目录每次 10 页（每页 100 条），从上次停下的页码继续，读到底回到第 1 页；约 22.5 万条，一轮约一个月 | 腾讯官方文档写明免鉴权；`robots.txt` 不限制 |

SkillsMP 没有接入：公开接口必须带关键词或作者，不支持通配，匿名每天 50 次，不能做全量或榜单采集。

**身份与去重**：每条记录有站内 ID 和跨站的 `skill_key`，同一技能在不同站点的 `skill_key` 相同，不按名称合并。

- skills.sh：`github:<owner/repo>/<skillId>`，同一仓库的不同技能各是一条。
- ClawHub：`clawhub:<owner>/<slug>`（slug 在不同作者之间会重复，所以带作者）。
- SkillHub：来源为 `clawhub` 且 `upstream_url` 指向 clawhub.ai 的条目是 ClawHub 的转收录，取对应的 `clawhub:<owner>/<slug>`；其余为 `skillhub:<namespace>/<slug>`。
- skills.sh 的条目在仓库扫描后按「同一仓库内 SKILL.md 的 name 或目录名」关联到 `catalog.db` 的 `resources.id`（`listings.resource_id`）。ClawHub、SkillHub 上托管、不在 GitHub 的技能只记录在 `discovery.db`，不进 `catalog.db`。

**热度口径**：每个站点、每种口径单独保存，不跨站相加，也不把不同口径相加。仓库的 GitHub 星标只在 `catalog.db` 里，不算单个技能的热度。热度只表示有人在装，不代表质量或安全。

| 口径 | 含义 | 来自 |
|---|---|---|
| `installs_total` | 累计安装 | skills.sh 累计榜，也写进 `catalog.db` 的 `installs` 列 |
| `installs_window` | 榜单窗口内的安装（页面标签写 24h，标题写 This Week，以站点为准） | skills.sh 趋势榜 |
| `installs_hour`、`installs_hour_change` | 最近一小时的安装，以及与昨天同一小时的差 | skills.sh Hot 榜 |
| `downloads_total` | 累计下载 | ClawHub、SkillHub |
| `installs_reported` | 站点自报的 installs，文档没说明口径 | ClawHub、SkillHub |
| `site_stars` | 站内用户收藏数 | ClawHub、SkillHub |
| `rank` | 只有名次（站点不给数值时） | ClawHub 趋势榜 |

**快照**：每次运行在 `runs` 里记一行，榜单上的每个条目按「条目、榜单、口径、运行」写一行 `snapshots`（名次和数值）；目录页读到的条目只更新 `listings` 里的最新值，不写快照。快照保留 180 天，`listings` 和仓库队列永久保留。站点失败时不删除、不标记它以前列出的任何条目，`catalog.db` 里的技能也不会因此标为不可用。

**扫描队列**：技能仓库来自各站点条目的 GitHub 仓库，加上 `catalog.db` 里已有技能的仓库，没有固定种子名单。每次最多扫 200 个仓库：从没试过的新仓库最多占一半（先发现的先扫，同一批里榜单名次高的先扫），其余给上次尝试最早的已知仓库，一方用不完的名额给另一方，所以新仓库不会被已知仓库挤掉，已知仓库也会轮流更新。碰到 GitHub 限流时剩下的仓库不算尝试过，下次仍然排在前面。扫过的仓库里不再出现的技能标为不可用；只要该仓库有一个 `SKILL.md` 没下载下来，这次就不对它做这一步，它的技能保持上一版的状态。

**报告**：`report.json` 的 `discovery` 字段和 job summary 的「Skill discovery」一节写每个站点的状态、读到的条目数、新条目、数值有变的条目、首次上榜（`newOnBoards`，附示例）、名次上升（`rose`，附上升最多的几条）、带出的新仓库、耗时和最近成功时间（`lastSuccessAt`），以及每个榜单和目录读了几页、多少条、总数、为什么停（读到底 `end`、到了每次的页数 `depth`、站点只给这么多 `site-limit`、出错 `error`、被限流 `rate-limited`）和下次从哪继续；另有扫描队列的新旧仓库数、仍在等待的新仓库数，以及条目数、去重后的技能数、多站重复的技能数、已关联到 `catalog.db` 的条目数和快照数。

### 搜索补充（本地结果不够时去别的技能站补搜）

`GET /api/resources` 的行为不变。补搜是单独的接口 `GET /api/search/supplement`，由前端在搜索词稳定后、且只在第一页调用一次；本地结果照常立即返回，不等补搜。代码在 `apps/api/src/catalog/supplement.ts`（规则与调度）、`found-store.ts`（持久化）和 `sources/` 下各站点的搜索函数。

**接口**

`GET /api/search/supplement?q=<搜索词>&kind=<skill|空>&wait=<秒，0–10>`，返回：

| 字段 | 含义 |
|---|---|
| `status` | `not_needed`：本地结果够用，或这个词不补搜；`searching`：正在查，`retryAfterSeconds` 秒后再问；`found` / `none`：查完了，有 / 没有；`unavailable`：现在一个站点都问不了，`retryAfterSeconds` 秒后可重试 |
| `reason` | 为什么本地结果不够：`no_results`、`few_results`、`low_relevance`；`not_needed` 时为 `null` |
| `resources` | 已从 GitHub 仓库读到并校验过、但已发布的 `catalog.db` 里还没有的技能，结构与列表接口的条目相同，详情走 `GET /api/resources/<id>`，可以安装 |
| `listings` | 别的站点上有、这里还装不了的技能：`key`、`site`、`name`、`description`、`author`、`url`（该站点上的页面）。只能作为外链展示，不能当成可安装的资源 |
| `partial` | 有站点超时、被限流或超出额度，结果可能不全 |
| `retryAfterSeconds` | 见 `status` |

- `wait` 大于 0 时，请求最多等这么多秒让正在进行的查询结束，通常一次请求就拿到最终结果；不带 `wait` 时立即返回，前端按 `retryAfterSeconds` 轮询。
- `resources` 和 `listings` 只随这个接口返回，不进 `GET /api/resources` 的 `resources`，也不占它的 `offset`，翻页不受影响。等定时同步把某个技能发布进 `catalog.db` 后，它从列表接口正常返回，同时从这里消失，id 不变，详情地址不变。
- `kind` 是 `mcp` 或 `provider` 时一律 `not_needed`：这些站点只收技能。

**什么时候补搜**（`fallbackTrigger`）

只看本地结果的前 10 条，不单看数量：

1. 有一条的名称（或 id 末段）和搜索词完全相同：够用，不补搜。
2. 一条结果都没有：`no_results`。
3. 没有任何一条的名称或 id 包含全部搜索词（只在描述里命中）：`low_relevance`，不管有多少条。
4. 有名称命中，但总数少于 `SEARCH_FALLBACK_MIN_RESULTS`（默认 3）：`few_results`。

搜索词先归一化（去首尾空白、转小写、合并空白）。以下搜索词不发给任何站点：短于 2 个字符、长于 64 个字符、超过 6 个词、单个词超过 40 个字符、不含字母或数字、含 `@` 或 `://`（看起来是邮箱或网址）。

**问哪些站点**

| 站点 | 接口 | 自设额度 | 说明 |
|---|---|---|---|
| `clawhub` | `GET https://clawhub.ai/api/v1/search?q=&limit=&nonSuspiciousOnly=true` | 每分钟 30 次、每天 2000 次 | 官方文档允许第三方目录搜索，要求缓存、遵守 429、链接回原页面；站点自己的匿名限额是每 IP 每分钟 3000 次读取 |
| `skillhub` | `GET https://api.skillhub.cn/api/skills?keyword=&sortBy=score` | 每分钟 30 次、每天 2000 次 | 腾讯官方文档写明免鉴权、查找统一走这个接口；文档和响应头都没给限额，额度是自己定的上限 |
| `skillsmp` | `GET https://skillsmp.com/api/v1/skills/search?q=&limit=` | 每分钟 5 次、每天 40 次 | 默认不启用。官方文档：匿名每天 50 次、每分钟 10 次，只能关键词搜索；服务条款允许搜索，禁止成规模抓取。结果直接给出 GitHub 仓库和技能名 |

skills.sh 不在其中：它的 `robots.txt` 禁止 `/api/` 和 `/search`。

每个站点各自 4 秒超时（`SEARCH_FALLBACK_TIMEOUT_MS`），不重试，并行请求。一个站点超时、返回 429、返回的不是预期结构，只影响它自己，其余站点的结果照常返回并标 `partial`。收到 429 后按 `Retry-After` 停用该站点（没有这个头时停 60 秒，最多 1 小时）。全部站点都失败时返回 `unavailable`。同时进行的查询最多 8 个，超出的直接返回 `unavailable`。额度和停用时间记在 API 进程内存里，重启后重新计。

**发给第三方的内容**

只有归一化后的搜索词。请求由 API 进程自己发出，`User-Agent` 固定为 `agent-store-api`；用户的 Cookie、登录令牌、IP、浏览器请求头都不读取、不转发。搜索词不落库、不写日志：一次查询在 `app.db` 里只按搜索词的 SHA-256 记录，到期删除。导出给定时同步的只有查到的条目和仓库名，没有搜索词，所以搜索历史不会变成关键词采集清单。前端接入时需要在界面上说明「没找到时会把搜索词发给这些站点」。

**校验与去重**

- 每条结果必须有名称、身份字段，以及一个 `https` 且域名属于来源站点的页面地址，否则丢弃；名称、描述、作者去掉控制字符并截断（200 / 500 / 100 个字符）。
- 身份沿用 `discovery.db` 的 `skill_key`：ClawHub 是 `clawhub:<owner>/<slug>`，SkillHub 转收录的 ClawHub 技能取同一个 `clawhub:` 键，SkillsMP 是 `github:<owner/repo>/<技能名>`。同一个键只展示一条；同名但作者不同、同一仓库的不同技能，键不同，各自保留。
- `catalog.db` 里已经有的技能不重复返回。
- 查询阶段只读文件（GitHub 的提交、目录树和 `SKILL.md`），不执行任何第三方安装命令或脚本。

**哪些结果能安装**

只有来自 GitHub 仓库的结果会变成可安装的资源：API 用和定时同步相同的 `scanRepo` 读这个仓库（每次查询最多 2 个仓库，10 秒内没读完的不等；技能数超过 40 的仓库留给定时同步；没有 `GITHUB_TOKEN` 时每小时最多读 20 个仓库，有则 200 个；同一仓库 6 小时内不重复读），读到的技能和定时同步产出的 id、结构完全一致。只托管在 ClawHub、SkillHub 上的技能目前装不了，只作为 `listings` 外链返回，也不进 `catalog.db`。

**持久化，以及和定时发布的衔接**

API 本地的 `catalog.db` 是下载来的只读副本，每次发布都会被整个替换，所以补搜到的内容不写进去，而是写进 `app.db`（持久卷、有备份，重启和替换 `catalog.db` 都不影响）：

| 表 | 内容 | 保留 |
|---|---|---|
| `found_listings` | 每个站点上的一条结果：来源、站内 ID、`skill_key`、名称、描述、作者、页面地址、GitHub 仓库、首次和最近一次查到的时间 | 180 天没再查到就删 |
| `found_repos` | 结果指向的 GitHub 仓库，以及 API 最近一次读它的时间和结果 | 180 天 |
| `found_resources` | 从这些仓库读到的技能（与 `catalog.db` 同样的摘要和安装数据） | `catalog.db` 里出现同一 id 后删除；14 天仍未出现也删除 |
| `search_lookups` | 一次查询的结论：搜索词的 SHA-256、`found` / `none`、是否不全、命中的 `skill_key`、过期时间 | 查到结果 24 小时，没查到 6 小时，结果不全 10 分钟 |

- 同一个搜索词在查询进行中再次到来，不会再发请求，共用那一次；查完后在上表的时间内直接用记录的结论，「没查到」同样记录。「全部站点失败」只在内存里记 30 秒。
- 以后的搜索（包括别的搜索词）先看 `found_listings` 和 `found_resources` 里名称或描述包含全部搜索词的条目，够用就不再问站点。
- `GET /api/discovery/export` 导出 `found_listings` 和 `found_repos`（各最多 5000 条，最近的在前）。`catalog-sync` 工作流每次运行先读这个地址（`FINDS_URL`，命令行参数 `--finds-url`）：条目按各自的站点写进 `discovery.db` 的 `listings`（已有的不动），仓库以「从没试过」进入扫描队列（`discovered_by = 'search'`），之后和榜单发现的仓库一样被扫描、发布进 `catalog.db`。重复读入不会产生重复行。读不到这个地址只记在报告里（`report.json` 的 `discovery.searchFinds` 和 job summary），不影响这次同步，下次再读。

| 变量 | 用途 |
|---|---|
| `SEARCH_FALLBACK_SOURCES` | 补搜问哪些站点，逗号分隔，默认 `clawhub,skillhub`；`none` 关闭补搜；加上 `skillsmp` 才会问 SkillsMP |
| `SEARCH_FALLBACK_MIN_RESULTS` | 本地结果少于多少条算「太少」，默认 3 |
| `SEARCH_FALLBACK_TIMEOUT_MS` | 单个站点的超时，默认 4000 |
| `SKILLSMP_API_KEY` | 可选，SkillsMP 的 API key |
| `GITHUB_TOKEN` | 可选，API 读仓库用；不设时用匿名额度 |

## 登录

Better Auth 跑在商店里（`apps/store/lib/auth/server.ts`），用 Node 内置的 `node:sqlite` 打开 `app.db`（`apps/store/lib/app-db.ts`），用户、会话等表的结构由 API 的 drizzle 迁移管理，不用 Better Auth 自己的迁移器。

- 浏览器和桌面端向商店的 `/api/auth/token` 换一个短期 JWT，调用 API 时放在 `Authorization: Bearer` 里。
- API 用商店的 `/api/auth/jwks` 验签（`AUTH_JWKS_URL`，集群内直连 `http://store:3000`），并校验签发方 `AUTH_ISSUER`。
- 令牌里的 `username` 是 GitHub 登录名，发布者按它对应。它由 `apps/store/lib/auth/github-username.ts` 在每次 GitHub 登录时用访问令牌向 GitHub 查询后写入用户表；只用 Google 登录的用户没有 `username`，用 GitHub 登录一次后补上。
- GitHub OAuth App 的回调地址是 `https://agent-store-test.panghuli.tech/api/auth/callback/github`；Google OAuth 客户端的重定向 URI 是 `https://agent-store-test.panghuli.tech/api/auth/callback/google`。Google 只在配置了 `GOOGLE_CLIENT_ID` 时启用。
- `/auth/login`、`/auth/logout` 在进程内调用 Better Auth，不经 HTTP 请求自己：Pod 里的 `request.url` 是容器的明文地址，拿它拼出来的地址访问不通。
- 改了登录配置（加插件、加用户字段）后，用 Better Auth 的 `getMigrations` 对比一次表结构（SQLite 下日期列是 `date`、布尔列是 `integer`），再改 `apps/api/src/db/schema.ts`，在 `apps/api` 下跑 `pnpm db:generate` 生成迁移。

## 支付（Waffo Pancake）

API 已接入：`POST /api/billing/checkout` 建订单，`POST /api/webhooks/waffo` 收 webhook 写 `subscriptions`，`GET /api/me/entitlements` 返回当前套餐。

| 变量 | 用途 |
|---|---|
| `WAFFO_MERCHANT_ID` | 商户 ID |
| `WAFFO_PRIVATE_KEY_BASE64` | RSA 私钥（base64） |
| `WAFFO_PRODUCT_ID_PRO_MONTHLY` / `WAFFO_PRODUCT_ID_PRO_YEARLY` / `WAFFO_PRODUCT_ID_LIFETIME` | 产品 ID |
| `WAFFO_CHECKOUT_SUCCESS_URL` | 付款后跳转。只认这个配置，请求体里的地址会被忽略 |

Waffo 的 webhook 地址是 `https://agent-store-test.panghuli.tech/api/webhooks/waffo`，`apps/api/scripts/waffo-setup.ts` 默认就配这个地址。脚本按名称找 `AgentStore` 店铺（同一商户下还有其他项目的店铺），已有的订阅商品直接沿用，已有的 webhook 只改地址，可以重复执行。先加 `--dry-run` 看它会改什么：

```sh
pnpm --filter @as/types build
cd apps/api && WAFFO_MERCHANT_ID=… WAFFO_PRIVATE_KEY_BASE64=… bun run scripts/waffo-setup.ts --dry-run
```

## 本地开发

```sh
make setup     # 建本地 app.db（.dev/app.db）并迁移，生成 apps/store/.env.local
make dev-env   # API + 商店 + 桌面端
make db-reset  # 删掉本地 app.db 重建
```

`apps/store/.env.local` 要填 `BETTER_AUTH_SECRET` 和一个回调指向 `http://localhost:3000/api/auth/callback/github` 的 GitHub OAuth App。

## 测试

- `unit` 工作流：对改动影响到的包做类型检查、lint 和测试，API 也在里面。API 的测试文件逐个单独进程跑（`app.test.ts` 用 `mock.module` 替换了查询模块，Bun 的模块 mock 在同一进程里对所有文件生效），连库测试用临时目录里的 `app.db`，不需要数据库服务。`app-db.test.ts` 还会用 Node 跑商店的 `lib/app-db.ts`，和 API 同时写同一个库。
- `images` 工作流：PR 上只构建不推送，能提前发现 Dockerfile 或 `next build` 的问题。PR 上还会冒烟：API 镜像里跑迁移、快照并确认有 `tar`；商店镜像先确认没有 `app.db` 时拒绝启动，再挂上迁移好的库启动，请求 `/api/auth/jwks` 让 Better Auth 写一行签名密钥。

## 桌面安装包分发

推 `v*` tag 后，`release` 工作流构建 macOS（通用版 .dmg）、Windows（.exe / .msi）和 Linux（.deb / .rpm / .AppImage）安装包，发布到同名的 GitHub Release。版本号写在 `apps/cli-gui/src-tauri/tauri.conf.json` 和 `Cargo.toml`，打 tag 前先改。

网页商店读最新 Release 的文件列表（`apps/store/lib/latest-release.ts`，缓存 5 分钟）；`/download/<目标>` 跳到对应的安装包，取不到时跳到发布页。
