/* 目录样本：复制自 ../proto/data.js（测试环境 /api/resources，2026-11-13 抓取）。末尾两条取自 test/desktop-linux/shots.sh 用到的条目，同日从同一接口读取。 */
window.AS_DATA = [
 {
  "id": "github:vercel-labs/skills/find-skills",
  "kind": "skill",
  "name": "find-skills",
  "description": "Helps users discover and install agent skills when they ask questions like \"how do I do X\", \"find a skill for X\", \"is there a skill that can...\", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.",
  "installs": 4337932,
  "stars": 39117,
  "version": "76a98a285cb0",
  "transports": [],
  "author": "vercel-labs",
  "authorUrl": "https://github.com/vercel-labs",
  "home": "https://github.com/vercel-labs/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "vercel-labs/skills/find-skills",
  "runs": [
   [
    "files",
    "vercel-labs/skills/skills/find-skills"
   ]
  ],
  "command": "npx skills add vercel-labs/skills --skill find-skills",
  "repo": "https://github.com/vercel-labs/skills/tree/b716f9dc2ba36b6aa8f0080615e5a3a6caeac63b/skills/find-skills",
  "repoDir": "vercel-labs/skills/skills/find-skills",
  "files": [
   {
    "path": "SKILL.md",
    "size": 5472
   }
  ],
  "fileCount": 1,
  "readme": "# Find Skills\n\nThis skill helps you discover and install skills from the open agent skills ecosystem.\n\n## When to Use This Skill\n\nUse this skill when the user:\n\n- Asks \"how do I do X\" where X might be a common task with an existing skill\n- Says \"find a skill for X\" or \"is there a skill for X\"\n- Asks \"can you do X\" where X is a specialized capability\n- Expresses interest in extending agent capabilities\n- Wants to search for tools, templates, or workflows\n- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)\n\n## What is the Skills CLI?\n\nThe Skills CLI (`npx skills`) is the package manager for the open agent skills ecosystem. Skills are modular packages that extend agent capabilities with specialized knowledge, workflows, and tools.\n\n**Key commands:**\n\n- `npx skills find [query] [--owner <owner>]` - Search for skills interactively or by keyword, optionally scoped to a GitHub owner\n- `npx skills add <package>` - Install a skill from GitHub or other sources\n- `npx skills update` - Update all installed skills\n\n**Browse skills at:** https://skills.sh/\n\n## How to Help Users Find Skills\n\n### Step 1: Understand What They Need\n\nWhen a user asks for help with something, identify:\n\n1. The domain (e.g., React, testing, design, deployment)\n2. The specific task (e.g., writing tests, creating animations, reviewing PRs)\n3. Whether this is a common enough t",
  "readmeCut": true
 },
 {
  "id": "github:mattpocock/skills/grill-me",
  "kind": "skill",
  "name": "grill-me",
  "description": "A relentless interview to sharpen a plan or design.",
  "installs": 1543745,
  "stars": 322790,
  "version": "3df14e2d3a89",
  "transports": [],
  "author": "mattpocock",
  "authorUrl": "https://github.com/mattpocock",
  "home": "https://github.com/mattpocock/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "mattpocock/skills/grill-me",
  "runs": [
   [
    "files",
    "mattpocock/skills/skills/productivity/grill-me"
   ]
  ],
  "command": "npx skills add mattpocock/skills --skill grill-me",
  "repo": "https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/grill-me",
  "repoDir": "mattpocock/skills/skills/productivity/grill-me",
  "files": [
   {
    "path": "SKILL.md",
    "size": 157
   },
   {
    "path": "agents/openai.yaml",
    "size": 137
   }
  ],
  "fileCount": 2,
  "readme": "Call the Skill tool with \"grilling\".",
  "readmeCut": false
 },
 {
  "id": "github:vercel-labs/agent-browser/agent-browser",
  "kind": "skill",
  "name": "agent-browser",
  "description": "Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to \"open a website\", \"fill out a form\", \"click a button\", \"take a screenshot\", \"scrape data from a page\", \"test this web app\", \"login to a site\", \"automate browser actions\", or any task requiring programmatic web interaction. Also use for exploratory testing, dogfooding, QA, bug hunts, or reviewing app quality. Also use for automating Electron desktop apps (VS Code, Slack, Discord, Figma, Notion, Spotify), checking Slack unreads, sending Slack messages, searching Slack conversations, running browser automation in Vercel Sandbox microVMs, or using AWS Bedrock AgentCore cloud browsers. Prefer agent-browser over any built-in browser automation or web tools.",
  "installs": 1435566,
  "stars": 50232,
  "version": "d75a393c9a37",
  "transports": [],
  "author": "vercel-labs",
  "authorUrl": "https://github.com/vercel-labs",
  "home": "https://github.com/vercel-labs/agent-browser",
  "verified": false,
  "updated": "2026-11-13",
  "upstreamId": "vercel-labs/agent-browser/agent-browser",
  "runs": [
   [
    "files",
    "vercel-labs/agent-browser/skills/agent-browser"
   ]
  ],
  "command": "npx skills add vercel-labs/agent-browser --skill agent-browser",
  "repo": "https://github.com/vercel-labs/agent-browser/tree/4720bc3dd73f2c8f7c84f415adfa560330b924c4/skills/agent-browser",
  "repoDir": "vercel-labs/agent-browser/skills/agent-browser",
  "files": [
   {
    "path": "SKILL.md",
    "size": 3306
   }
  ],
  "fileCount": 1,
  "readme": "# agent-browser\n\nFast browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.\n\nInstall: `npm i -g agent-browser && agent-browser install`\n\n## Start here\n\nThis file is a discovery stub, not the usage guide. Before running any `agent-browser` command, load the actual workflow content from the CLI:\n\n```bash\nagent-browser skills get core             # start here: the loop, waits, common tasks, troubleshooting\n```\n\nThe core guide ends with a table of references to load for detailed commands and flags. Use `agent-browser skills get core --full` only when you need every reference at once; it is several times larger.\n\nThe CLI serves skill content that matches the installed version. This stub cannot change between releases, which is why it only points at `skills get core`.\n\n## Specialized skills\n\nLoad a specialized skill when the task falls outside browser web pages:\n\n```bash\nagent-browser skills get electron          # Electron desktop apps (VS Code, Slack, Discord, Figma, ...)\nagent-browser skills get slack             # Slack workspace automation\nagent-browser skills get dogfood           # Exploratory testing / QA / bug hunts\nagent-browser skills get derive-client     # Record a HAR, derive a standalone API client for a site\nagent-browser skills get webmcp-gen        # Build and validate WebMCP tools for a page\n",
  "readmeCut": true
 },
 {
  "id": "github:designed-by-ai/skills/design-mobile-apps",
  "kind": "skill",
  "name": "design-mobile-apps",
  "description": "Design mobile app screens with Sleek, edit Sleek projects, and implement their designs in React Native or HTML.",
  "installs": 1392294,
  "stars": 32,
  "version": "de45daba70cc",
  "transports": [],
  "author": "designed-by-ai",
  "authorUrl": "https://github.com/designed-by-ai",
  "home": "https://github.com/designed-by-ai/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "designed-by-ai/skills/design-mobile-apps",
  "runs": [
   [
    "files",
    "designed-by-ai/skills/skills/design-mobile-apps"
   ]
  ],
  "command": "npx skills add designed-by-ai/skills --skill design-mobile-apps",
  "repo": "https://github.com/designed-by-ai/skills/tree/03c20aec6dcedb5fabfb03dc37982eb52ef19ed6/skills/design-mobile-apps",
  "repoDir": "designed-by-ai/skills/skills/design-mobile-apps",
  "files": [
   {
    "path": "SKILL.md",
    "size": 8484
   },
   {
    "path": "designing.md",
    "size": 7869
   },
   {
    "path": "endpoints.md",
    "size": 13757
   },
   {
    "path": "implementing.md",
    "size": 21285
   },
   {
    "path": "styling/nativewind.md",
    "size": 4883
   },
   {
    "path": "styling/stylesheet.md",
    "size": 1621
   },
   {
    "path": "styling/uniwind.md",
    "size": 1536
   }
  ],
  "fileCount": 7,
  "readme": "# Designing with Sleek\n\n[![Design mobile apps in minutes](https://raw.githubusercontent.com/sleekdotdesign/agent-skills/main/assets/hero.png)](https://sleek.design)\n\n## Overview\n\n[sleek.design](https://sleek.design) provides a REST API at `/api/v1/*` to create projects, design screens from a brief, and fetch their HTML and renders.\n\n**Base URL**: `https://sleek.design`\n**Auth**: `Authorization: Bearer $SLEEK_API_KEY`, except the public device start/poll endpoints\n**Content-Type**: send `application/json` for JSON request bodies.\n**CORS**: Enabled on all `/api/v1/*` endpoints\n**Envelope**: check HTTP status first. Successful JSON wraps its payload in `data`; lists also include sibling `pagination`. Errors use top-level `code`, `status` and `message`, with optional `data.url`. Successful screenshots and share cards return image bytes; `204` has no body.\n**Ids**: opaque 11-character tokens like `V1StGXR8Z5j`, with no type prefix. Nothing about an id says whether it names a project, screen, component, version or theme, so track each one by the response field it arrived in.\n**Parsing responses**: write the body to a file (`curl -o run.json`) and parse the file. Piping JSON through `echo` corrupts it: zsh expands the escaped `\\n` inside string values into real newlines, which makes the body invalid JSON.\n**API docs**: OpenAPI spec at `https://sleek.design/api/v1/spec.json`; browsable",
  "readmeCut": true
 },
 {
  "id": "github:mattpocock/skills/grill-with-docs",
  "kind": "skill",
  "name": "grill-with-docs",
  "description": "A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.",
  "installs": 1321154,
  "stars": 322790,
  "version": "eedaf2562c83",
  "transports": [],
  "author": "mattpocock",
  "authorUrl": "https://github.com/mattpocock",
  "home": "https://github.com/mattpocock/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "mattpocock/skills/grill-with-docs",
  "runs": [
   [
    "files",
    "mattpocock/skills/skills/engineering/grill-with-docs"
   ]
  ],
  "command": "npx skills add mattpocock/skills --skill grill-with-docs",
  "repo": "https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/grill-with-docs",
  "repoDir": "mattpocock/skills/skills/engineering/grill-with-docs",
  "files": [
   {
    "path": "SKILL.md",
    "size": 247
   },
   {
    "path": "agents/openai.yaml",
    "size": 145
   }
  ],
  "fileCount": 2,
  "readme": "Call the Skill tool twice, for \"grilling\" and \"domain-modeling\".",
  "readmeCut": false
 },
 {
  "id": "github:mattpocock/skills/improve-codebase-architecture",
  "kind": "skill",
  "name": "improve-codebase-architecture",
  "description": "Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.",
  "installs": 1261665,
  "stars": 322790,
  "version": "587147dd230d",
  "transports": [],
  "author": "mattpocock",
  "authorUrl": "https://github.com/mattpocock",
  "home": "https://github.com/mattpocock/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "mattpocock/skills/improve-codebase-architecture",
  "runs": [
   [
    "files",
    "mattpocock/skills/skills/engineering/improve-codebase-architecture"
   ]
  ],
  "command": "npx skills add mattpocock/skills --skill improve-codebase-architecture",
  "repo": "https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/improve-codebase-architecture",
  "repoDir": "mattpocock/skills/skills/engineering/improve-codebase-architecture",
  "files": [
   {
    "path": "HTML-REPORT.md",
    "size": 6641
   },
   {
    "path": "SKILL.md",
    "size": 6028
   },
   {
    "path": "agents/openai.yaml",
    "size": 166
   }
  ],
  "fileCount": 3,
  "readme": "# Improve Codebase Architecture\n\nSurface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.\n\nThis command is _informed_ by the project's domain model and built on a shared design vocabulary:\n\n- Call the Skill tool with \"codebase-design\" for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, \"the interface is the test surface\", \"one adapter = hypothetical seam, two = real\"). Use these terms exactly in every suggestion, and don't drift into \"component,\" \"service,\" \"API,\" or \"boundary.\"\n- The domain language in `GLOSSARY.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.\n\n## Process\n\n### 1. Explore\n\n**Scope before you scan: YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:\n\n- If the user named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.\n- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention f",
  "readmeCut": true
 },
 {
  "id": "github:mattpocock/skills/tdd",
  "kind": "skill",
  "name": "tdd",
  "description": "Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions \"red-green-refactor\", or wants integration tests.",
  "installs": 1235790,
  "stars": 322790,
  "version": "667dbdd00c09",
  "transports": [],
  "author": "mattpocock",
  "authorUrl": "https://github.com/mattpocock",
  "home": "https://github.com/mattpocock/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "mattpocock/skills/tdd",
  "runs": [
   [
    "files",
    "mattpocock/skills/skills/engineering/tdd"
   ]
  ],
  "command": "npx skills add mattpocock/skills --skill tdd",
  "repo": "https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/tdd",
  "repoDir": "mattpocock/skills/skills/engineering/tdd",
  "files": [
   {
    "path": "SKILL.md",
    "size": 3629
   },
   {
    "path": "agents/openai.yaml",
    "size": 87
   },
   {
    "path": "mocking.md",
    "size": 1481
   },
   {
    "path": "tests.md",
    "size": 2214
   }
  ],
  "fileCount": 4,
  "readme": "# Test-Driven Development\n\nTDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.\n\nWhen exploring the codebase, read `GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.\n\n## What a good test is\n\nTests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: \"user can checkout with valid cart\" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.\n\nSee [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.\n\n## Seams: where tests go\n\nA **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.\n\n**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex lo",
  "readmeCut": true
 },
 {
  "id": "github:mattpocock/skills/handoff",
  "kind": "skill",
  "name": "handoff",
  "description": "Compact the current conversation into a handoff document for another agent to pick up.",
  "installs": 1131729,
  "stars": 322790,
  "version": "ce24892bd2d4",
  "transports": [],
  "author": "mattpocock",
  "authorUrl": "https://github.com/mattpocock",
  "home": "https://github.com/mattpocock/skills",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "mattpocock/skills/handoff",
  "runs": [
   [
    "files",
    "mattpocock/skills/skills/productivity/handoff"
   ]
  ],
  "command": "npx skills add mattpocock/skills --skill handoff",
  "repo": "https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/handoff",
  "repoDir": "mattpocock/skills/skills/productivity/handoff",
  "files": [
   {
    "path": "SKILL.md",
    "size": 940
   },
   {
    "path": "agents/openai.yaml",
    "size": 141
   }
  ],
  "fileCount": 2,
  "readme": "Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows) - not the current workspace.\n\nInclude a \"suggested skills\" section in the document, naming which skills the next agent should call the Skill tool for.\n\nDo not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.\n\nRedact any sensitive information, such as API keys, passwords, or personally identifiable information.\n\nIf the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.",
  "readmeCut": false
 },
 {
  "id": "mcp-registry:com.browser-use/browser-use",
  "kind": "mcp",
  "name": "browser-use",
  "description": "Browser agents and stealth cloud browsers for AI: run web tasks, fill forms, extract data.",
  "installs": null,
  "stars": 120835,
  "version": "0.13.11",
  "transports": [
   "pypi",
   "streamable-http"
  ],
  "author": "browser-use.com",
  "authorUrl": "https://browser-use.com",
  "home": "https://browser-use.com",
  "verified": true,
  "updated": "2026-10-21",
  "upstreamId": "com.browser-use/browser-use",
  "runs": [
   [
    "command",
    "uvx browser-use==0.13.11 --cli-mcp"
   ],
   [
    "connect",
    "https://api.browser-use.com/v3/mcp"
   ],
   [
    "needs",
    "X-Browser-Use-API-Key"
   ]
  ],
  "command": "claude mcp add browser-use -- uvx browser-use==0.13.11 --cli-mcp",
  "mcpName": "browser-use",
  "repo": "https://github.com/browser-use/browser-use",
  "launch": "uvx browser-use==0.13.11 --cli-mcp",
  "remote": "https://api.browser-use.com/v3/mcp"
 },
 {
  "id": "mcp-registry:io.github.D4Vinci/Scrapling",
  "kind": "mcp",
  "name": "Scrapling MCP Server",
  "description": "Web scraping with stealth HTTP, real browsers, and Cloudflare bypass. CSS selectors supported.",
  "installs": null,
  "stars": 102033,
  "version": "0.5.1",
  "transports": [
   "pypi",
   "oci"
  ],
  "author": "D4Vinci",
  "authorUrl": "https://github.com/D4Vinci",
  "home": "https://scrapling.readthedocs.io/en/latest/ai/mcp-server.html",
  "verified": false,
  "updated": "2026-11-04",
  "upstreamId": "io.github.D4Vinci/Scrapling",
  "runs": [
   [
    "command",
    "uvx scrapling==0.5.1"
   ],
   [
    "command",
    "docker run -i --rm ghcr.io/d4vinci/scrapling"
   ]
  ],
  "command": "claude mcp add Scrapling -- uvx scrapling==0.5.1",
  "mcpName": "Scrapling",
  "repo": "https://github.com/D4Vinci/Scrapling",
  "launch": "uvx scrapling==0.5.1",
  "remote": null
 },
 {
  "id": "mcp-registry:app.worldmonitor/mcp",
  "kind": "mcp",
  "name": "World Monitor",
  "description": "Real-time global intelligence on conflict, markets, energy, trade, shipping and cyber. 102 tools.",
  "installs": null,
  "stars": 90531,
  "version": "1.54.0",
  "transports": [
   "streamable-http"
  ],
  "author": "worldmonitor.app",
  "authorUrl": "https://worldmonitor.app",
  "home": "https://www.worldmonitor.app",
  "verified": true,
  "updated": "2026-11-13",
  "upstreamId": "app.worldmonitor/mcp",
  "runs": [
   [
    "connect",
    "https://worldmonitor.app/mcp"
   ]
  ],
  "command": "claude mcp add --transport http mcp https://worldmonitor.app/mcp",
  "mcpName": "mcp",
  "repo": "https://github.com/koala73/worldmonitor",
  "launch": null,
  "remote": "https://worldmonitor.app/mcp"
 },
 {
  "id": "mcp-registry:io.github.ruvnet/ruflo",
  "kind": "mcp",
  "name": "Ruflo",
  "description": "Agent teams, swarms, memory and hooks for Claude Code and Codex, served over MCP.",
  "installs": null,
  "stars": 81555,
  "version": "3.77.0",
  "transports": [
   "npm"
  ],
  "author": "ruvnet",
  "authorUrl": "https://github.com/ruvnet",
  "home": "https://github.com/ruvnet/ruflo",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "io.github.ruvnet/ruflo",
  "runs": [
   [
    "command",
    "npx -y ruflo@3.77.0 mcp start"
   ]
  ],
  "command": "claude mcp add ruflo -- npx -y ruflo@3.77.0 mcp start",
  "mcpName": "ruflo",
  "repo": "https://github.com/ruvnet/ruflo",
  "launch": "npx -y ruflo@3.77.0 mcp start",
  "remote": null
 },
 {
  "id": "mcp-registry:io.github.ruvnet/claude-flow",
  "kind": "mcp",
  "name": "claude-flow",
  "description": "AI orchestration with hive-mind swarms, neural networks, and 87 MCP tools for enterprise dev.",
  "installs": null,
  "stars": 81555,
  "version": "2.0.0-alpha.107",
  "transports": [
   "npm"
  ],
  "author": "ruvnet",
  "authorUrl": "https://github.com/ruvnet",
  "home": "https://github.com/ruvnet/claude-flow",
  "verified": false,
  "updated": "2025-09-10",
  "upstreamId": "io.github.ruvnet/claude-flow",
  "runs": [
   [
    "command",
    "npx -y claude-flow@2.0.0-alpha.107"
   ],
   [
    "needs",
    "ANTHROPIC_API_KEY, GITHUB_TOKEN, FLOW_NEXUS_API_KEY"
   ]
  ],
  "command": "claude mcp add claude-flow -- npx -y claude-flow@2.0.0-alpha.107",
  "mcpName": "claude-flow",
  "repo": "https://github.com/ruvnet/claude-flow",
  "launch": "npx -y claude-flow@2.0.0-alpha.107",
  "remote": null
 },
 {
  "id": "mcp-registry:io.github.netdata/mcp-server",
  "kind": "mcp",
  "name": "Netdata",
  "description": "Real-time infrastructure monitoring with metrics, logs, alerts, and ML-based anomaly detection.",
  "installs": null,
  "stars": 81382,
  "version": "2.12.3",
  "transports": [
   "streamable-http"
  ],
  "author": "netdata",
  "authorUrl": "https://github.com/netdata",
  "home": "https://www.netdata.cloud",
  "verified": false,
  "updated": "2026-11-04",
  "upstreamId": "io.github.netdata/mcp-server",
  "runs": [
   [
    "connect",
    "https://app.netdata.cloud/api/v1/mcp"
   ]
  ],
  "command": "claude mcp add --transport http --header 'Authorization: Bearer {NETDATA_CLOUD_API_TOKEN}' mcp-server https://app.netdata.cloud/api/v1/mcp",
  "mcpName": "mcp-server",
  "repo": "https://github.com/netdata/netdata",
  "launch": null,
  "remote": "https://app.netdata.cloud/api/v1/mcp"
 },
 {
  "id": "mcp-registry:io.github.thedaviddias/front-end-checklist",
  "kind": "mcp",
  "name": "Front-End Checklist",
  "description": "Review frontend code and live pages against 386 quality-gated web development rules.",
  "installs": null,
  "stars": 74714,
  "version": "2.0.1",
  "transports": [
   "streamable-http"
  ],
  "author": "thedaviddias",
  "authorUrl": "https://github.com/thedaviddias",
  "home": "https://frontendchecklist.io/mcp",
  "verified": false,
  "updated": "2026-10-04",
  "upstreamId": "io.github.thedaviddias/front-end-checklist",
  "runs": [
   [
    "connect",
    "https://mcp.frontendchecklist.io"
   ]
  ],
  "command": "claude mcp add --transport http front-end-checklist https://mcp.frontendchecklist.io",
  "mcpName": "front-end-checklist",
  "repo": "https://github.com/thedaviddias/Front-End-Checklist",
  "launch": null,
  "remote": "https://mcp.frontendchecklist.io"
 },
 {
  "id": "mcp-registry:io.github.upstash/context7",
  "kind": "mcp",
  "name": "Context7",
  "description": "Up-to-date docs for AI agents",
  "installs": null,
  "stars": 64684,
  "version": "4.7.0",
  "transports": [
   "npm",
   "mcpb",
   "streamable-http"
  ],
  "author": "upstash",
  "authorUrl": "https://github.com/upstash",
  "home": "https://context7.com",
  "verified": false,
  "updated": "2026-11-12",
  "upstreamId": "io.github.upstash/context7",
  "runs": [
   [
    "command",
    "npx -y @upstash/context7-mcp@4.7.0"
   ],
   [
    "needs",
    "CONTEXT7_API_KEY"
   ],
   [
    "command",
    "mcpb https://github.com/upstash/context7/releases/download/mcpb-v4.7.0/context7.mcpb@4.7.0"
   ],
   [
    "connect",
    "https://mcp.context7.com/mcp"
   ],
   [
    "needs",
    "Authorization"
   ]
  ],
  "command": "claude mcp add context7 -- npx -y @upstash/context7-mcp@4.7.0",
  "mcpName": "context7",
  "repo": "https://github.com/upstash/context7",
  "launch": "npx -y @upstash/context7-mcp@4.7.0",
  "remote": "https://mcp.context7.com/mcp",
  "readme": "# Context7 - Up-to-date Docs for AI Agents\n\n## ❌ Without Context7\n\nLLMs rely on outdated or generic information about the libraries you use. You get:\n\n- ❌ Code examples are outdated and based on year-old training data\n- ❌ Hallucinated APIs that don't even exist\n- ❌ Generic answers for old package versions\n\n## ✅ With Context7\n\nContext7 pulls up-to-date, version-specific documentation and code examples straight from the source — and gives them to your coding agent.\n\n```txt\nCreate a Next.js proxy that checks for a valid JWT in cookies\nand redirects unauthenticated users to `/login`. use context7\n```\n\n```txt\nConfigure a Cloudflare Worker script to c",
  "readmeCut": true
 },
 {
  "id": "builtin:local",
  "kind": "provider",
  "name": "local",
  "description": "内置本地转发：将 Claude Code / Codex 的 baseURL 指向本机监听端口，请求按 Level 优先级转发到已配置的上游供应商，失败自动降级。无需 API 密钥。",
  "installs": null,
  "stars": null,
  "version": "1.0.0",
  "transports": [],
  "author": "Agent Store",
  "authorUrl": null,
  "home": null,
  "verified": true,
  "updated": "2026-11-12",
  "upstreamId": "local",
  "runs": [],
  "command": "aas install local",
  "compatible": [
   "claude",
   "codex"
  ]
 },
 {
  "id": "builtin:openrouter",
  "kind": "provider",
  "name": "OpenRouter",
  "description": "OpenRouter：一个 API Key 访问 300+ 模型（OpenAI 兼容）。此预设已填好接入地址，你只需填入自己的 OpenRouter API Key。",
  "installs": null,
  "stars": null,
  "version": "1.0.0",
  "transports": [],
  "author": "OpenRouter",
  "authorUrl": "https://openrouter.ai",
  "home": "https://openrouter.ai",
  "verified": true,
  "updated": "2026-11-12",
  "upstreamId": "openrouter",
  "runs": [
   [
    "connect",
    "https://openrouter.ai/api/v1"
   ],
   [
    "needs",
    "apiKey"
   ]
  ],
  "command": "aas install openrouter",
  "compatible": [
   "codex"
  ],
  "level": 1
 },
 {
  "id": "builtin:skyapi",
  "kind": "provider",
  "name": "SkyAPI",
  "description": "SkyAPI 服务，稳定线路免翻墙接入 Claude Code，兼容 Cursor / Cline / Windsurf 等客户端。",
  "installs": null,
  "stars": null,
  "version": "1.0.0",
  "transports": [],
  "author": "SkyAPI",
  "authorUrl": null,
  "home": null,
  "verified": true,
  "updated": "2026-11-12",
  "upstreamId": "skyapi",
  "runs": [
   [
    "connect",
    "http://150.158.2.79:8888"
   ],
   [
    "needs",
    "apiKey"
   ]
  ],
  "command": "aas install skyapi",
  "compatible": [
   "claude"
  ],
  "level": 1
 },
 {
  "id": "builtin:yls",
  "kind": "provider",
  "name": "YLS Code",
  "description": "伊莉思 Code 服务，国内直连免翻墙接入 Codex CLI（GPT-5 Code）与 Claude Code；此预设接入其 Codex 端点，按订阅计费。",
  "installs": null,
  "stars": null,
  "version": "1.0.0",
  "transports": [],
  "author": "YLS.me",
  "authorUrl": "https://code.ylsagi.com",
  "home": "https://code.ylsagi.com",
  "verified": true,
  "updated": "2026-11-12",
  "upstreamId": "yls",
  "runs": [
   [
    "connect",
    "https://code.ylsagi.com/codex"
   ],
   [
    "needs",
    "apiKey"
   ]
  ],
  "command": "aas install yls",
  "compatible": [
   "codex"
  ],
  "level": 1
 }
];
window.AS_DATA.push(
 {"id":"mcp-registry:io.github.humanjesse/textarttools-mcp","kind":"mcp","name":"textarttools-mcp","description":"Unicode text styling and ASCII art generation with 23 styles and 322+ figlet fonts","installs":null,"stars":6,"version":"1.0.0","transports":["sse"],"author":"humanjesse","authorUrl":"https://github.com/humanjesse","home":"https://github.com/humanjesse/textarttools-mcp","verified":false,"updated":"2025-09-26","upstreamId":"io.github.humanjesse/textarttools-mcp","runs":[["connect","https://humanjesse.github.io/textarttools-mcp/sse"]],"mcpName":"textarttools-mcp","launch":null,"remote":"https://humanjesse.github.io/textarttools-mcp/sse","sse":true,"readme":"","files":[]},
 {"id":"mcp-registry:ai.admux/admux","kind":"mcp","name":"Admux","description":"Buy ChatGPT, Google AI Mode and Gravity ads from one prepaid balance, with scoped keys.","installs":null,"stars":null,"version":"0.1.0","transports":["streamable-http"],"author":"admux.ai","authorUrl":"https://admux.ai","home":"https://admux.ai","verified":true,"updated":"2026-11-12","upstreamId":"ai.admux/admux","runs":[["connect","https://api.admux.ai/mcp"],["needs","Authorization"]],"mcpName":"admux","launch":null,"remote":"https://api.admux.ai/mcp","readme":"","files":[]}
);
/* 目录规模，截至 2026-11-13 */
window.AS_CATALOG = { mcp: 61815, skill: 8391 };
