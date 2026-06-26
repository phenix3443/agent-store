# Client Core 目录结构与 MCP 落点设计

## 1. 目标

本设计解决三个问题：

1. 当前仓库虽然已经分成 `apps/market`、`apps/cli`、`apps/client-core`，但职责边界仍然不够清晰
2. 下一步要实现 `mcp` 相关功能，如果不先把目录和层次理顺，`provider`、`skill`、`mcp` 会继续耦合在一起
3. `client-core` 的真实语义是“本地客户端共享核心”，而不是某一个具体客户端前端

本设计的目标不是把更多代码拆到 `packages/`，而是：

- 保持 `apps/cli`、`apps/client-core`、`apps/market` 三个主包不变
- 明确 `market` 只负责网站和 HTTP API
- 明确 `cli` 只负责命令行交互壳
- 明确 `client-core` 是 CLI / GUI 共用的本地共享核心，但其内部要再分层
- 给 `mcp` 预留稳定落点，避免后续继续在 `src/` 根目录平铺逻辑

## 2. 已确认的边界

以下约束已经固定：

- `apps/market` 只是网站和 HTTP API
- 用户在网站点击“安装”后，由本地客户端执行安装
- `Codex` / `Claude` 宿主适配层保留在 `client-core` 中
- `headless core` 不单独抽到 `packages/`，仍保留在 `client-core` 中
- `agent-package` 是 `client-core` 的正式主线能力，不是临时实验目录
- CLI 和未来的 GUI 都调用 `client-core` 提供的统一接口
- 现阶段物理路径仍保留为 `apps/client-core`，但语义上它是共享本地核心

进一步说，正确关系应为：

```txt
market

cli ----\
         -> client-core
gui ----/
```

## 3. 现状问题

### 3.1 表面上已经分包，实际上 `client-core` 内部仍然混层

当前仓库的顶层结构是：

- `apps/market`
- `apps/cli`
- `apps/client-core`
- `packages/sdk`
- `packages/types`

这说明“网站”和“CLI”在包级别已经分开了。

当前真正的问题是 `apps/client-core/src/` 内部混合了四类职责：

- 核心编排逻辑，例如 `engine.ts`
- 宿主配置适配逻辑，例如 `config/claude.ts`、`config/codex.ts`
- 本地基础设施逻辑，例如 `registry/*`、`installer/*`、`updater/*`
- fixture / relay / 验证入口，例如 `agent-package-codex-relay.ts`、`run-agent-package-fixture.ts`

这些逻辑都直接挂在 `src/` 根或少量浅层目录下，导致：

- 核心规则与技术实现耦合
- 宿主适配和业务编排混在一起
- fixture 和正式主线代码边界不清楚
- 后续加 `mcp` 时，很容易继续复制 `provider` / `skill` 的平铺模式

### 3.2 `client-core` 当前更像 app，而不是共享核心

从语义上看，`client-core` 实际上承担的是：

- 本地安装编排
- 本地启用 / 禁用 / 同步
- 本地 registry 管理
- Claude / Codex 宿主适配
- 未来供 CLI / GUI 共用的本地能力接口

这说明它不是某个独立“客户端前端 app”，而是本地共享核心。

如果这个定位不明确，就会出现两个问题：

- `cli` 会越来越像直接调用一堆内部实现细节，而不是调用稳定接口
- 将来做 `gui` 时，很容易再次复制一套本地逻辑

### 3.3 `cli` 现在是薄壳，但缺少“被调用对象”的清晰层次

`apps/cli` 当前主要做：

- 参数解析
- prompt
- 输出格式化
- 调用 `AASEngineImpl`

这方向是对的。

问题不在 `cli` 本身，而在它依赖的 `client-core` 对外暴露面过于“直接”。`cli` 当前本质上直接绑到一个大而杂的运行时包，而不是依赖一个分层清晰的应用层。

### 3.4 `market` 的边界应继续收紧

`market` 已经是一个相对独立的 Next.js 应用，但设计上需要明确禁止它承载：

- 本地安装编排
- 本地启用 / 禁用
- Claude / Codex 配置写入
- 本地 package registry 管理

否则后面很容易把“网站点击安装”误做成“网站直接负责安装逻辑”。

## 4. 总体决策

采用如下结构策略：

1. 不新增新的顶层运行时包
2. 保持 `packages/sdk`、`packages/types` 只承载跨端共享纯库
3. `client-core` 作为 CLI / GUI 共用的本地核心保留，但在其内部强制分层
4. `provider`、`skill`、`mcp` 在 `client-core` 中采用对称结构
5. fixture / relay / 本地验证入口从主线运行时代码中分区隔离
6. 现阶段不把 `apps/client-core` 物理迁移到 `packages/`，只先修正职责和接口

## 5. 目标目录结构

```txt
apps/
  market/
    app/
    components/
    lib/
      queries/
      supabase/

  cli/
    src/
      commands/
      ui/
      format/
      engine.ts
      index.ts

  gui/
    src/
      ...

  client-core/
    src/
      domain/
        items/
        packages/
        providers/
        skills/
        mcps/

      application/
        install/
        enable/
        disable/
        sync/
        update/
        config/
        query/

      hosts/
        claude/
          provider.ts
          skill.ts
          mcp.ts
          index.ts
        codex/
          provider.ts
          skill.ts
          mcp.ts
          index.ts

      infrastructure/
        registry/
        market-client/
        filesystem/
        installer/
        updater/

      fixtures/
        agent-package/
          relay.ts
          fixture-env.ts
          run-fixture.ts

      index.ts
```

说明：

- `domain`、`application`、`hosts`、`infrastructure` 是 `client-core` 的主线层次
- `fixtures` 明确是运行时外侧的验证 / 开发辅助目录，不进入正式主线建模
- `market`、`cli` 的包边界不变；未来 `gui` 也应只作为前端壳存在
- `client-core` 虽然暂时放在 `apps/` 下，但语义上按“共享核心”设计，而不是按普通 app 设计

## 6. 各层职责

### 6.1 `apps/market`

职责：

- 网站 UI
- 目录页、详情页、提交页、管理页
- HTTP API
- 读数据库、查 catalog、返回 item / publisher 数据

不负责：

- 本地安装
- 本地启用 / 禁用
- 写 Claude / Codex 配置
- 管理用户机器上的本地 registry

### 6.2 `apps/cli`

职责：

- 命令行入口
- 命令参数解析
- prompt / confirm / input
- 输出格式化
- 调用 `client-core` 暴露的应用层接口

不负责：

- 宿主配置文件结构
- package/component 的底层规则
- registry 文件读写
- market API 细节

### 6.3 `apps/gui`（未来）

职责：

- 图形界面
- 本地交互流
- 调用 `client-core` 暴露的统一接口

不负责：

- 本地安装编排
- 宿主配置写入
- registry 持久化
- market 协议细节

### 6.4 `client-core`

`client-core` 的定义不是“某个客户端应用”，而是：

- 本地共享核心
- CLI / GUI 共用的本地运行时能力集合
- 本地 package / provider / skill / mcp 生命周期中心

这层需要对上层前端暴露稳定接口，而不是把实现细节直接暴露出去。

### 6.5 `client-core/domain`

职责：

- item、package、provider、skill、mcp 的核心模型
- “什么是 installed / enabled / compatible”的领域规则
- `agent-package` 的核心运行时模型

要求：

- 尽量纯逻辑
- 不直接操作文件系统
- 不直接依赖 Claude / Codex 配置格式

### 6.6 `client-core/application`

职责：

- 编排用例
- `install`
- `enable`
- `disable`
- `sync`
- `update`
- `config`
- `query`

这一层决定：

- 什么时候访问 registry
- 什么时候拉 market 数据
- 什么时候调用宿主 adapter
- 一次操作的状态流如何执行

它不应该知道：

- `Claude settings.json` 的具体字段形状
- `Codex config.toml` 的具体字段形状

### 6.7 `client-core/hosts`

职责：

- 宿主适配
- 把 application 层的意图翻译成 Claude / Codex 的真实配置

这里按宿主和能力再细分：

- `hosts/claude/provider.ts`
- `hosts/claude/skill.ts`
- `hosts/claude/mcp.ts`
- `hosts/codex/provider.ts`
- `hosts/codex/skill.ts`
- `hosts/codex/mcp.ts`

这样做的原因：

- `provider`、`skill`、`mcp` 的配置落地方式不同
- Claude 与 Codex 对同一能力的配置形态也不同
- 按“宿主 x 能力”切文件，比当前按“宿主一个大文件”更稳定

### 6.8 `client-core/infrastructure`

职责：

- registry 持久化
- market client
- 文件系统读写
- installer
- updater

这一层是技术实现层，不承载业务规则定义。

### 6.9 `client-core/fixtures`

职责：

- Docker fixture
- relay
- 本地 agent-package 验证入口
- 测试环境保护逻辑

要求：

- 与正式运行时主线隔离
- 默认不进入对外导出面
- 只服务于本地验证与端到端测试

## 7. 依赖方向约束

必须遵守以下依赖方向：

```txt
market  -> types / sdk
cli     -> client-core
gui     -> client-core

client-core/application -> domain
client-core/application -> hosts
client-core/application -> infrastructure

client-core/hosts -> domain
client-core/hosts -> infrastructure

client-core/infrastructure -> types / sdk
```

禁止的依赖：

- `market -> client-core`
- `market -> cli`
- `market -> gui`
- `cli -> hosts/*` 具体实现文件
- `gui -> hosts/*` 具体实现文件
- `application -> 直接耦合具体配置文件路径常量之外的宿主文件格式细节`
- `fixtures -> 成为正式主线路径的一部分`

## 8. `mcp` 的正式落点

这是本设计最重要的部分。

后续实现 `mcp` 时，必须按与 `provider` / `skill` 对称的结构落位。

### 8.1 `domain/mcps`

定义：

- MCP item / component 模型
- transport 模型
- 配置 schema 模型
- command / args / cwd / remote endpoint 等领域字段

### 8.2 `application`

新增或扩展：

- `install`：安装 MCP package / item
- `enable`：启用 MCP 到目标宿主
- `disable`：从目标宿主移除 MCP
- `sync`：重新同步所有 MCP
- `config`：维护 MCP 所需配置

### 8.3 `hosts/claude/mcp.ts`

职责：

- 把 MCP 注册到 Claude 的宿主配置
- 处理 stdio / remote 相关宿主写入逻辑

### 8.4 `hosts/codex/mcp.ts`

职责：

- 把 MCP 注册到 Codex 的宿主配置
- 处理 `config.toml` 中与 MCP 相关的宿主写入逻辑

### 8.5 `infrastructure/installer`

MCP 的文件落地、可执行权限、资源准备等实现放在这里，而不是塞进宿主适配层。

## 9. 对现有代码的映射

当前主要迁移方向如下：

- `src/config/claude.ts`
  -> `src/hosts/claude/*`
- `src/config/codex.ts`
  -> `src/hosts/codex/*`
- `src/engine.ts`
  -> 拆成 `application/*` + 一个薄 orchestrator
- `src/registry/*`
  -> `infrastructure/registry/*`
- `src/installer/*`
  -> `infrastructure/installer/*`
- `src/updater/*`
  -> `infrastructure/updater/*`
- `src/agent-package-*`
  -> `fixtures/agent-package/*` 或 `domain/packages/*` / `application/*` 的明确归位
- `src/run-agent-package-fixture.ts`
  -> `fixtures/agent-package/run-fixture.ts`

这里有一个重要判断：

- `agent-package` 的“运行时模型”和“安装/启用语义”属于主线能力
- `agent-package` 的 Docker fixture、relay、测试入口不属于主线能力

因此迁移时要把两者拆开，而不是整个 `agent-package` 一起挪进 `fixtures`

## 10. 迁移顺序

### 第一步：只调整目录，不改行为

目标：

- 先建立物理边界
- 保持测试继续通过
- 不在这一步同时改协议和功能

动作：

- 新建 `domain / application / hosts / infrastructure / fixtures`
- 迁移现有文件到新目录
- 更新 import 路径
- 保持对外导出面兼容

### 第二步：拆分 `engine.ts`

目标：

- 把“大引擎文件”拆成按用例组织的 application 层

结果：

- `cli` 调用的是更清晰的应用层入口
- `hosts` 与 `infrastructure` 不再从一个大 orchestrator 隐式耦合

### 第三步：把 `provider / skill / mcp` 拉成对称结构

目标：

- 防止每引入一种能力就用一次临时结构

结果：

- `provider`
- `skill`
- `mcp`

三者都能在 `domain / application / hosts` 中找到对称位置

### 第四步：补 `mcp` 实现

在结构稳定后实现：

- MCP package / item 的安装
- MCP 对 Claude / Codex 的启用
- MCP 配置同步
- MCP fixture 验证

## 11. 非目标

本设计不做以下事情：

- 不在当前阶段把 `client-core` 物理迁移到 `packages/*`
- 不把 `market` 改造成安装控制面
- 不要求一次性把所有对外 API 设计成最终形态
- 不在本设计中定义 MCP 的最终配置 schema 细节
- 不在本设计中定义 store 与本地客户端的完整安装触发协议

## 12. 完成标准

目录重构完成后，应满足：

1. `market` 不依赖 `client-core`
2. `cli` 不直接依赖宿主实现细节文件
3. `client-core` 内部存在清晰的 `domain / application / hosts / infrastructure / fixtures` 结构
4. `provider`、`skill`、`mcp` 在 `hosts` 层有对称落点
5. fixture 不再和平时运行时主线路径混放
6. 后续实现 `mcp` 时，不需要再新增一套并行目录哲学

## 13. 推荐结论

最终推荐采用“物理路径暂时不变，但把 `client-core` 明确定义为共享本地核心，并在其内部完成分层重构”的方案。

原因是：

- 它比“只调整文件夹名字”的最小方案更能真正解决边界问题
- 它比“再拆新顶层运行时包”的激进方案风险更低
- 它能直接支持 CLI 和未来 GUI 共用同一套本地能力
- 它能直接为 `mcp` 实现提供稳定位置

因此，后续工作建议按下面顺序执行：

1. 先按本设计重构 `client-core` 目录层次
2. 再把 `provider` / `skill` 当前实现对齐到新结构
3. 最后在该结构上补齐 `mcp` 能力
