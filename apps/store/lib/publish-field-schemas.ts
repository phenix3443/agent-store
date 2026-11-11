export interface FieldSchema {
  /** Also the message key for its label (`site.publish.fields.<key>`). */
  key: string
  type: 'text' | 'url' | 'select'
  options?: string[]
  when?: (vals: Record<string, string>) => boolean
}

export type PublishType = 'provider' | 'skill' | 'mcp'

export const FIELD_SCHEMAS: Record<PublishType, FieldSchema[]> = {
  provider: [
    { key: 'name', type: 'text' },
    { key: 'homepage', type: 'url' },
    { key: 'baseUrl', type: 'url' },
    { key: 'supportedModels', type: 'text' },
  ],
  skill: [
    { key: 'name', type: 'text' },
    { key: 'repo', type: 'url' },
    { key: 'contentUrl', type: 'url' },
  ],
  mcp: [
    { key: 'name', type: 'text' },
    { key: 'homepage', type: 'url' },
    { key: 'transport', type: 'select', options: ['stdio', 'sse', 'http'] },
    {
      key: 'command',
     
      type: 'text',
      when: (vals) => vals.transport === 'stdio',
    },
    {
      key: 'url',
     
      type: 'url',
      when: (vals) => vals.transport === 'sse' || vals.transport === 'http',
    },
    {
      key: 'headers',
     
      type: 'text',
      when: (vals) => vals.transport === 'sse' || vals.transport === 'http',
    },
    {
      key: 'env',
     
      type: 'text',
      when: (vals) => vals.transport === 'stdio',
    },
  ],
}
