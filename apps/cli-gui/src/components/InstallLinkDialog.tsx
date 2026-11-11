import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import type { Item, ItemDetail } from '@as/types'
import { callRpc } from '../lib/rpc'
import { onDeepLink, getLaunchDeepLinks } from '../lib/deepLink'
import { routeDeepLink } from '../lib/deepLinkRoute'
import { focusMainWindow } from '../lib/focusWindow'
import { installStepsOf, typeFacts, TIER_META, TYPE_META, type Category } from '../lib/detailContent'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { useT } from '../i18n'
import { CategoryIcon } from './CategoryIcon'

type NoticeReason = 'invalid' | 'notFound' | 'catalogError' | 'installed' | 'mismatch' | 'failed'

type Phase =
  | { kind: 'loading'; slug: string }
  | { kind: 'confirm'; item: Item; installing: boolean }
  | { kind: 'notice'; reason: NoticeReason; slug?: string; category?: Category; detail?: string }

type Lookup =
  | { status: 'installed'; category: Category }
  | { status: 'available'; item: Item }
  | { status: 'notFound' }
  | { status: 'catalogError'; detail: string }

async function lookup(slug: string): Promise<Lookup> {
  try {
    const info = await callRpc<ItemDetail>('info', [slug])
    return { status: 'installed', category: info.category }
  } catch {
    // `info` only knows installed packages; anything else comes from the catalog.
  }
  try {
    const items = await callRpc<Item[]>('search', [''])
    const item = items.find((i) => i.slug === slug)
    return item ? { status: 'available', item } : { status: 'notFound' }
  } catch (err) {
    return { status: 'catalogError', detail: err instanceof Error ? err.message : String(err) }
  }
}

// The launch link stays readable for the whole session, so a remount would replay it.
let launchLinksHandled = false

/** Test hook: lets each test start as a fresh app launch. */
export function resetLaunchLinksForTest() {
  launchLinksHandled = false
}

/**
 * Handles `<scheme>://install?slug=…` links opened from the web store. A link
 * only ever opens this dialog; the install itself needs the user's confirmation.
 */
export function InstallLinkDialog() {
  const { setNavView, setCategoryFilter, setListFilter, setSelectedSlug, setEditingConfigSlug, bumpInstalledVersion } =
    useAppState()
  const { appendLine } = useTerminalLog()
  const t = useT()
  const [phase, setPhase] = useState<Phase | null>(null)
  // Bumped per incoming link so a slow lookup or install can't overwrite a newer link's dialog.
  const seq = useRef(0)
  const phaseRef = useRef<Phase | null>(null)
  phaseRef.current = phase

  function showInList(slug: string, category: Category) {
    setNavView('browse')
    setCategoryFilter(category)
    setListFilter('all')
    setEditingConfigSlug(null)
    setSelectedSlug(slug)
  }

  async function handleLink(raw: string) {
    const route = routeDeepLink(raw)
    if (route.kind === 'auth-callback') return
    void focusMainWindow()
    if (route.kind === 'invalid') {
      seq.current += 1
      setPhase({ kind: 'notice', reason: 'invalid' })
      return
    }

    const { slug, category } = route
    const current = phaseRef.current
    // The launch link can arrive twice (once from the launch read, once as an event).
    if (current?.kind === 'loading' && current.slug === slug) return
    if (current?.kind === 'confirm' && current.item.slug === slug) return

    const mine = ++seq.current
    const loading: Phase = { kind: 'loading', slug }
    phaseRef.current = loading
    setPhase(loading)
    const found = await lookup(slug)
    if (seq.current !== mine) return

    if (found.status === 'notFound') return setPhase({ kind: 'notice', reason: 'notFound', slug })
    if (found.status === 'catalogError') {
      return setPhase({ kind: 'notice', reason: 'catalogError', slug, detail: found.detail })
    }
    const actual = found.status === 'installed' ? found.category : found.item.category
    if (category && category !== actual) return setPhase({ kind: 'notice', reason: 'mismatch', slug })
    if (found.status === 'installed') {
      return setPhase({ kind: 'notice', reason: 'installed', slug, category: actual })
    }
    showInList(slug, actual)
    setPhase({ kind: 'confirm', item: found.item, installing: false })
  }

  const handleLinkRef = useRef(handleLink)
  handleLinkRef.current = handleLink

  useEffect(() => {
    let active = true
    let unlisten = () => {}
    void onDeepLink((url) => void handleLinkRef.current(url)).then((u) => {
      if (active) unlisten = u
      else u()
    })
    void getLaunchDeepLinks().then((urls) => {
      // Marked handled only once a live effect takes them: StrictMode's throwaway
      // first mount would otherwise swallow the link.
      if (!active || launchLinksHandled) return
      launchLinksHandled = true
      for (const url of urls) void handleLinkRef.current(url)
    })
    return () => {
      active = false
      unlisten()
    }
  }, [])

  async function confirmInstall(item: Item) {
    const mine = seq.current
    setPhase({ kind: 'confirm', item, installing: true })
    appendLine(`$ aas install ${item.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [item.slug])
      appendLine(`✓ ${t('common.installed')} ${item.slug} ${result.version}`, 'green')
      bumpInstalledVersion()
      if (seq.current !== mine) return
      if (item.category === 'provider') {
        setEditingConfigSlug(item.slug)
        setSelectedSlug(item.slug)
      }
      setPhase(null)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      appendLine(`✗ ${detail}`, 'red')
      bumpInstalledVersion()
      if (seq.current === mine) setPhase({ kind: 'notice', reason: 'failed', slug: item.slug, detail })
    }
  }

  function close() {
    if (phase?.kind === 'confirm' && phase.installing) return
    seq.current += 1
    setPhase(null)
  }

  const installing = phase?.kind === 'confirm' && phase.installing

  return (
    <Dialog.Root open={phase !== null} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[70] flex max-h-[85vh] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-store-border-strong bg-store-win shadow-2xl"
        >
          <div className="flex-1 overflow-y-auto p-6">
            {phase?.kind === 'loading' && (
              <>
                <Dialog.Title className="text-base font-semibold text-store-text">{t('installLink.confirmTitle')}</Dialog.Title>
                <p role="status" className="mt-3 text-sm text-store-text-2">
                  {t('installLink.loading')} <span className="font-mono text-store-text">{phase.slug}</span>…
                </p>
              </>
            )}

            {phase?.kind === 'notice' && (
              <>
                <Dialog.Title className="text-base font-semibold text-store-text">
                  {t(`installLink.${phase.reason}Title`)}
                </Dialog.Title>
                <p className="mt-3 text-sm leading-relaxed text-store-text-2">{t(`installLink.${phase.reason}Body`)}</p>
                {phase.slug && (
                  <p className="mt-3 break-all rounded-lg border border-store-border bg-store-term-bg px-3 py-2 font-mono text-xs text-store-text-2">
                    {phase.slug}
                  </p>
                )}
                {phase.detail && <p className="mt-2 break-words text-xs text-store-red">{phase.detail}</p>}
              </>
            )}

            {phase?.kind === 'confirm' && <ConfirmBody item={phase.item} />}
          </div>

          <div className="flex justify-end gap-2 border-t border-store-border px-6 py-4">
            {/* First in the DOM so it takes initial focus: Enter must not install. */}
            <button
              type="button"
              onClick={close}
              aria-disabled={installing}
              className="rounded-lg border border-store-border-strong px-4 py-1.5 text-xs font-semibold text-store-text-2 hover:text-store-text aria-disabled:opacity-50"
            >
              {phase?.kind === 'notice' ? t('installLink.close') : t('common.cancel')}
            </button>
            {phase?.kind === 'notice' && phase.reason === 'installed' && phase.slug && phase.category && (
              <button
                type="button"
                onClick={() => {
                  showInList(phase.slug!, phase.category!)
                  close()
                }}
                className="rounded-lg bg-store-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                {t('installLink.view')}
              </button>
            )}
            {phase?.kind === 'confirm' && (
              <button
                type="button"
                onClick={() => void confirmInstall(phase.item)}
                disabled={installing}
                className="rounded-lg bg-store-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {installing ? t('installLink.installing') : t('installLink.confirm')}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ConfirmBody({ item }: { item: Item }) {
  const t = useT()
  const detail = { ...item, installed: false as const }
  const tierKey = TIER_META[item.publisher.tier] ? item.publisher.tier : 'community'
  const tier = TIER_META[tierKey]
  const lines = [...installStepsOf(detail, t), ...typeFacts(detail, t)]

  return (
    <>
      <Dialog.Title className="text-base font-semibold text-store-text">{t('installLink.confirmTitle')}</Dialog.Title>

      <div className="mt-4 flex items-center gap-3">
        <CategoryIcon category={item.category} size="md" />
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-store-text">{item.name}</p>
          <p className="truncate font-mono text-[11px] text-store-text-3">
            {item.slug} · v{item.version}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        <dt className="text-store-text-3">{t('installLink.publisher')}</dt>
        <dd className="flex items-center gap-2 text-store-text">
          <span className="font-semibold">{item.publisher.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tier.textClass} ${tier.bgClass}`}>
            {t(`tier.${tierKey}`)}
          </span>
        </dd>
        <dt className="text-store-text-3">{t('installLink.category')}</dt>
        <dd className={`font-semibold ${TYPE_META[item.category].textClass}`}>{t(`categories.${item.category}`)}</dd>
      </dl>

      <p className="mt-4 text-xs font-semibold text-store-text-2">{t('installLink.steps')}</p>
      <ul className="mt-2 flex flex-col gap-1.5 rounded-lg border border-store-border bg-store-term-bg px-3 py-2.5">
        {lines.map((line, i) => (
          <li key={i} className="break-all font-mono text-[11.5px] leading-relaxed text-store-text-2">
            {line}
          </li>
        ))}
      </ul>
      {item.category === 'provider' && (
        <p className="mt-2 text-xs text-store-text-3">{t('installLink.providerNext')}</p>
      )}

      <p className="mt-4 rounded-lg border border-store-amber bg-store-amber-soft px-3 py-2 text-xs leading-relaxed text-store-text">
        {t('installLink.fromWeb')}
      </p>
    </>
  )
}
