export interface FieldSchema {
  key: string
  label: string
  type: 'text' | 'url' | 'select'
  options?: string[]
  when?: (vals: Record<string, string>) => boolean
}

export type PublishType = 'provider' | 'skill' | 'mcp'

export const FIELD_SCHEMAS: Record<PublishType, FieldSchema[]> = {
  provider: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'homepage', label: '主页', type: 'url' },
    { key: 'baseUrl', label: 'Base URL', type: 'url' },
    { key: 'supportedModels', label: '支持的模型（逗号分隔）', type: 'text' },
  ],
  skill: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'repo', label: '仓库地址', type: 'url' },
    { key: 'category', label: '分类', type: 'select', options: ['workflow', 'design', 'documents', 'other'] },
    { key: 'installMethod', label: '安装方式', type: 'select', options: ['zip', 'script'] },
    {
      key: 'installScript',
      label: '安装脚本',
      type: 'text',
      when: (vals) => vals.installMethod === 'script',
    },
  ],
  mcp: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'homepage', label: '主页', type: 'url' },
    { key: 'transport', label: '传输方式', type: 'select', options: ['stdio', 'sse', 'http'] },
    {
      key: 'command',
      label: '启动命令',
      type: 'text',
      when: (vals) => vals.transport === 'stdio',
    },
    {
      key: 'url',
      label: '远程地址',
      type: 'url',
      when: (vals) => vals.transport === 'sse' || vals.transport === 'http',
    },
    {
      key: 'headers',
      label: 'Headers（JSON）',
      type: 'text',
      when: (vals) => vals.transport === 'sse' || vals.transport === 'http',
    },
    {
      key: 'env',
      label: '环境变量（JSON）',
      type: 'text',
      when: (vals) => vals.transport === 'stdio',
    },
  ],
}
