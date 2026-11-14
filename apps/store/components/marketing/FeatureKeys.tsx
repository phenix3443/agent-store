import { Globe, Layers, MousePointerClick, ToggleRight, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Hot = { key: 'click' | 'agents' | 'toggle' | 'web'; kind: 'skill' | 'mcp' | 'provider'; Icon: LucideIcon }
type Cap = { cap: string; wide?: boolean }

// A keyboard of blank caps with the four features as wide lit keys. `wide` caps only show above 1100px.
const LAYOUT: (Hot | Cap)[] = [
  { cap: '/' },
  { cap: 'esc', wide: true },
  { key: 'click', kind: 'mcp', Icon: MousePointerClick },
  { cap: '⌘', wide: true },
  { cap: 'K' },
  { key: 'agents', kind: 'skill', Icon: Layers },
  { cap: 'aas', wide: true },
  { cap: '↵', wide: true },
  { key: 'toggle', kind: 'skill', Icon: ToggleRight },
  { cap: '↑' },
  { cap: 'tab', wide: true },
  { key: 'web', kind: 'provider', Icon: Globe },
  { cap: '~', wide: true },
  { cap: '↓' },
]

export function FeatureKeys() {
  const t = useTranslations('site.home.keys')
  return (
    <ul className="keys">
      {LAYOUT.map((k, i) =>
        'cap' in k ? (
          <li key={i} aria-hidden className={`key ${k.wide ? 'key-x' : ''}`}>
            {k.cap}
          </li>
        ) : (
          <li key={k.key} data-kind={k.kind} className="key key-hot">
            <k.Icon size={24} aria-hidden />
            <span>
              <b className="block text-[15.5px] font-bold leading-snug">{t(`${k.key}.title`)}</b>
              <small className="mt-0.5 block text-xs leading-normal text-fg-2">{t(`${k.key}.body`)}</small>
            </span>
          </li>
        ),
      )}
    </ul>
  )
}
