// 复杂度门禁。**独立于各 app 自己的 lint 配置**，只管三条规则。
//
// 【为什么单独一个文件而不是并进 apps/store/.eslintrc.json】
// 这个 monorepo 里只有 apps/store 有 eslint（eslint 8 + next lint），
// cli / cli-gui / api / client-core / packages 一条规则都没有。复杂度是
// 全仓库的事，挂在某一个 app 下面覆盖不到其余五个。lefthook 用
// `--no-config-lookup -c eslint.complexity.mjs` 跑它，和 next lint 互不干扰。
//
// 【用认知复杂度，不用圈复杂度】2026-08-21 在本仓库实测，同一份代码：
// 圈复杂度 >=15 命中 14 处，认知复杂度只有 8 处。多出来的 6 处全是 React
// 组件——DetailPanel(21)、ProviderConfigPanel(24)、SettingsModal(20)、
// dashboard/page(25)、DetailDrawer(16)、db-types(18)——分数来自平铺的条件式
// JSX，那是组件的正常长相，不是难懂。圈复杂度对每个分支点加一、不管嵌套；
// 认知复杂度只对嵌套加权。同理不启用 max-lines-per-function。
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    // 【生成物必须排掉】.open-next/ 是 OpenNext 的构建产物（已在 .gitignore 里，
    // 但 eslint flat config 不读 .gitignore）。不排掉的话超标数从 8 变成 1011，
    // 全是打包后的压缩代码——门禁第一天就是红的，必然被绕过。
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/build/**",
      "**/*.d.ts",
      // docs/ui/ 是设计交付包：一份 .dc.html 高保真原型加它自带的迷你运行时
      // support.js。docs/ui/README.md 第 14 行明写「不要照搬到生产代码」，
      // 它是拿来读组件结构的参考件，不是本仓库维护的代码。
      "docs/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { sonarjs },
    // 【必须关掉 inline 配置】源码里有 `// eslint-disable-next-line
    // @next/next/no-img-element` 这类注释，是写给 apps/store 那套 next lint 的。
    // 这份配置没加载那些插件，eslint 会为每条这样的注释报
    // "Definition for rule ... was not found"——12 条噪声，一条复杂度问题都不是。
    // 代价：这里也不认 inline 的复杂度豁免。那是好事——豁免只走下面那份
    // 可见的清单，不许散落在代码里。
    //
    // 【连带：调用方必须带 --quiet】noInlineConfig 会为每条被它忽略的注释
    // 发一条 "has no effect" 警告，换个说法的同一批噪声，而且
    // reportUnusedDisableDirectives 管不到它。本文件三条规则全是 error，
    // --quiet 只留 error，于是「通过时安静」。改调用方式时别把它丢了。
    linterOptions: { noInlineConfig: true },
    rules: {
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-identical-functions": "error",
      "max-depth": ["error", 4],
    },
  },
  {
    // 一次性脚本：写完跑一次就归档，不按生产代码的标准要求。
    files: ["scripts/**"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-identical-functions": "off",
      "max-depth": "off",
    },
  },
  {
    /*
     * 【存量清单：上线门禁时就超标的文件，新文件不许】
     *
     *   apps/client-core/src/config/claude.ts             26
     *   apps/store/app/store/[category]/[slug]/page.tsx   26  （还有 max-depth 5）
     *   apps/cli-gui/src/lib/detailContent.ts             25
     *   apps/cli-gui/src/components/BudgetCard.tsx        19
     *   apps/client-core/src/config/codex.ts              19
     *   apps/store/components/PublishModal.tsx            19
     *
     * 【只减不增】谁改到这些文件，顺手把它降到 15 以下就从这里删掉一行。
     * 不许往这个清单里加新文件——那是把门禁变成许愿池。
     */
    files: [
      "apps/client-core/src/config/claude.ts",
      "apps/client-core/src/config/codex.ts",
      "apps/cli-gui/src/lib/detailContent.ts",
      "apps/cli-gui/src/components/BudgetCard.tsx",
      // 【方括号要转义】Next 的动态路由目录名带 [ ]，而 files 走 minimatch，
      // 不转义会被当成字符类通配，这条豁免就不生效。
      "apps/store/app/store/\\[category\\]/\\[slug\\]/page.tsx",
      "apps/store/components/PublishModal.tsx",
    ],
    rules: { "sonarjs/cognitive-complexity": "off", "max-depth": "off" },
  },
];
