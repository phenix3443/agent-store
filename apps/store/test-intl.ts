import zh from './messages/zh.json'

type Values = Record<string, string | number>

function lookup(path: string): string {
  let node: unknown = zh
  for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  return typeof node === 'string' ? node : path
}

// Tests read the real zh messages, so a renamed or missing key shows up as a
// raw key in the rendered output instead of passing silently.
export function translator(namespace?: string) {
  return (key: string, values?: Values) =>
    lookup(namespace ? `${namespace}.${key}` : key).replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values?.[name] ?? `{${name}}`)
    )
}

export const intlMock = {
  useLocale: () => 'zh',
  useTranslations: (namespace?: string) => translator(namespace),
}
