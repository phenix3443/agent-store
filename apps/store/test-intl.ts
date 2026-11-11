import zh from './messages/zh.json'

type Values = Record<string, string | number>

function find(path: string): unknown {
  let node: unknown = zh
  for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  return node
}

function lookup(path: string): string {
  const node = find(path)
  return typeof node === 'string' ? node : path
}

// Tests read the real zh messages, so a renamed or missing key shows up as a
// raw key in the rendered output instead of passing silently.
export function translator(namespace?: string) {
  const full = (key: string) => (namespace ? `${namespace}.${key}` : key)
  const t = (key: string, values?: Values) =>
    lookup(full(key)).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`))
  t.raw = (key: string) => find(full(key))
  // Rich text keeps the tag contents and drops the tags.
  t.rich = (key: string, values?: Values) => t(key, values).replace(/<\/?\w+>/g, '')
  return t
}

export const intlMock = {
  useLocale: () => 'zh',
  useTranslations: (namespace?: string) => translator(namespace),
}

export const intlServerMock = {
  getLocale: async () => 'zh',
  getTranslations: async (namespace?: string) => translator(namespace),
}
