-- supabase/seed.sql
-- Local E2E test data. Applied by: supabase db reset (after migrations).
--
-- Two groups of rows:
-- 1. "Test Co" publisher + its 3 items: functional fixtures exercised by
--    scripts/local-e2e.sh (install/config/enable/disable round-trip).
-- 2. The Web Store mock catalog (apps/store/lib/mock/publishers.ts and
--    apps/store/lib/mock/items.ts): 4 publishers / 7 items, seeded here so
--    the GUI's "浏览" search results (real Supabase via `search` RPC) stay
--    visually consistent with what the Web Store shows from its static
--    mock module.

INSERT INTO publishers (slug, name, avatar_url, tier)
VALUES ('test-co', 'Test Co', 'https://placehold.co/64x64', 'official');

INSERT INTO publishers (slug, name, avatar_url, tier, bio) VALUES
  ('anthropic', 'Anthropic', 'https://api.dicebear.com/9.x/shapes/svg?seed=anthropic', 'official', '构建 Claude 与 Claude Code 的团队官方发布。'),
  ('openai', 'OpenAI', 'https://api.dicebear.com/9.x/shapes/svg?seed=openai', 'official', 'GPT 系列模型的官方供应商配置。'),
  ('yls-me', 'YLS.me', 'https://api.dicebear.com/9.x/shapes/svg?seed=yls', 'verified', '已验证的第三方模型中转服务。'),
  ('devfox', 'devfox', 'https://api.dicebear.com/9.x/shapes/svg?seed=devfox', 'community', '独立开发者，专注前端工具技能。');

-- Provider: tests config step + claude/codex sync
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'openai-provider-test',
  'OpenAI Provider Test',
  'Test provider for local E2E verification.',
  'https://example.com/readme',
  'https://placehold.co/64x64',
  'provider', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude','codex'], ARRAY['ai','test'], 1000, 'published',
  $${"steps":[{"type":"config","patch":{"apiKey":"","baseUrl":"https://api.openai.com/v1","model":"gpt-4o"}}]}$$,
  $${"configSchema":{"type":"object","required":["apiKey"],"properties":{"apiKey":{"type":"string","description":"OpenAI API Key"},"baseUrl":{"type":"string","description":"Base URL","default":"https://api.openai.com/v1"},"model":{"type":"string","description":"Model","default":"gpt-4o"}}},"supportedModels":["gpt-4o","gpt-4o-mini"]}$$
);

-- Skill: tests script step + skill.md copy to claude skills dir
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'hello-skill',
  'Hello Skill',
  'Test skill for local E2E verification.',
  'https://example.com/readme',
  'https://placehold.co/64x64',
  'skill', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude'], ARRAY['test'], 500, 'published',
  $${"steps":[{"type":"script","command":"echo '# Hello Skill' > skill.md"}]}$$,
  $${}$$
);

-- MCP: tests script step + binary chmod + mcpServers sync
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'fs-mcp-test',
  'FS MCP Test',
  'Test MCP server for local E2E verification.',
  'https://example.com/readme',
  'https://placehold.co/64x64',
  'mcp', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude'], ARRAY['mcp','test'], 200, 'published',
  $${"steps":[{"type":"script","command":"echo '#!/bin/sh' > server; echo 'echo hello' >> server; chmod +x server"},{"type":"config","patch":{"allowedPaths":["/tmp"]}}]}$$,
  $${"transport":"stdio","serverCommand":"./server","configSchema":{"type":"object","properties":{"allowedPaths":{"type":"array","description":"Allowed filesystem paths"}}}}$$
);

-- Skill: Superpowers (Anthropic)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'superpowers',
  'Superpowers',
  '一套用于头脑风暴、写计划、TDD 执行的技能合集，覆盖完整开发流程。',
  'https://example.com/readme/superpowers.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=superpowers',
  'skill', '2.4.0',
  (SELECT id FROM publishers WHERE slug = 'anthropic'),
  ARRAY['claude','codex'], ARRAY['workflow','planning','tdd'], 128000, 4.9, 'published',
  $${"steps":[]}$$,
  $${"contentUrl":"https://example.com/content/superpowers.zip"}$$
);

-- Skill: PDF Processing (Anthropic)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'pdf-processing',
  'PDF Processing',
  '读取、生成、审阅 PDF 文件，支持渲染检查与内容抽取。',
  'https://example.com/readme/pdf-processing.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=pdf',
  'skill', '1.3.2',
  (SELECT id FROM publishers WHERE slug = 'anthropic'),
  ARRAY['claude','codex'], ARRAY['pdf','documents'], 64500, 4.7, 'published',
  $${"steps":[]}$$,
  $${"contentUrl":"https://example.com/content/pdf-processing.zip"}$$
);

-- Skill: Frontend Design (devfox)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'frontend-design',
  'Frontend Design',
  '为新建或重塑 UI 提供有主见的视觉设计指导，避免千篇一律的默认样式。',
  'https://example.com/readme/frontend-design.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=frontend',
  'skill', '1.0.5',
  (SELECT id FROM publishers WHERE slug = 'devfox'),
  ARRAY['claude'], ARRAY['design','frontend','ui'], 31200, 4.5, 'published',
  $${"steps":[]}$$,
  $${"contentUrl":"https://example.com/content/frontend-design.zip"}$$
);

-- Provider: OpenAI Provider (OpenAI)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'openai-provider',
  'OpenAI Provider',
  'OpenAI 官方模型接入配置，支持 GPT-4o 系列。',
  'https://example.com/readme/openai-provider.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=openai-provider',
  'provider', '1.8.0',
  (SELECT id FROM publishers WHERE slug = 'openai'),
  ARRAY['claude','codex'], ARRAY['openai','gpt'], 890000, 4.8, 'published',
  $${"steps":[]}$$,
  $${"configSchema":{},"supportedModels":["gpt-4o","gpt-4o-mini","gpt-4.1"]}$$
);

-- Provider: YLS.me 中转 (yls-me)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'yls-me',
  'YLS.me 中转',
  '已验证的第三方模型中转服务，支持多模型映射与延迟监控。',
  'https://example.com/readme/yls-me.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=yls-provider',
  'provider', '0.9.1',
  (SELECT id FROM publishers WHERE slug = 'yls-me'),
  ARRAY['codex'], ARRAY['relay','proxy'], 12800, 4.2, 'published',
  $${"steps":[]}$$,
  $${"configSchema":{},"supportedModels":["gpt-4o","claude-3-7-sonnet"]}$$
);

-- MCP: Filesystem MCP (Anthropic)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'filesystem-mcp',
  'Filesystem MCP',
  '本地文件系统访问的 MCP 服务，通过 stdio 启动。',
  'https://example.com/readme/filesystem-mcp.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=fs-mcp',
  'mcp', '0.5.3',
  (SELECT id FROM publishers WHERE slug = 'anthropic'),
  ARRAY['claude','codex'], ARRAY['mcp','filesystem'], 45600, 4.6, 'published',
  $${"steps":[]}$$,
  $${"transport":"stdio","serverCommand":"npx -y @modelcontextprotocol/server-filesystem","configSchema":{}}$$
);

-- MCP: Web Search MCP (devfox)
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'web-search-mcp',
  'Web Search MCP',
  '远程 HTTP MCP 服务，提供实时网页检索能力。',
  'https://example.com/readme/web-search-mcp.md',
  'https://api.dicebear.com/9.x/icons/svg?seed=search-mcp',
  'mcp', '1.1.0',
  (SELECT id FROM publishers WHERE slug = 'devfox'),
  ARRAY['claude'], ARRAY['mcp','search'], 9400, 4.1, 'published',
  $${"steps":[]}$$,
  $${"transport":"http","url":"https://mcp.example.com/web-search","configSchema":{}}$$
);
