@AGENTS.md

# 补充：这个仓库怎么干活

上面 import 的 `AGENTS.md` 是规则真源（Codex 也读它），这份只补 Claude 侧
需要而那边没有的部分。**新规则写进 `AGENTS.md`，不要只写在这里。**

## 命令一律走 make

`make` 列出全部。`pnpm` 的 script 是给 turbo 用的底层入口，
日常开发走 `make dev-env` / `make dev-api` / `make dev-store` / `make e2e`。

跑之前先确认自己在哪个仓库：产品代码在这里，包 manifest 在 `registry`。

## 密钥存储

原 `.secrets/` 已移动到 `../home-lab/projects/agent-store/secrets/`，由 home-lab 的 `.gitignore` 忽略；本仓库的 `.env.local` 继续被本仓库忽略。**但 gitignore 守的只有「忘了 add」**——
`git add -f`、文件改名、有人调整 ignore 规则都能绕过去，而密钥进了
git 历史就永远在。

真值不要出现在任何入库文件里。

## e2e 是真跑，不是打桩

`make e2e` 会真装包、真起 agent。**部署 gated 在它成功之上**，
所以它挂了不是「测试环境的问题」，是这次改动确实会让用户装不上包。

跑不了就明说未执行的原因和影响范围，不要默默跳过。
