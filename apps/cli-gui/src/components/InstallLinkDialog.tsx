import { useEffect, useRef, useState } from 'react'
import type { CatalogResourceDetail, InstalledItem, InstallOutcome, Item } from '@as/types'
import { callRpc, RpcError } from '../lib/rpc'
import { formatVersion, installedEntryFor, resourceItem } from '../lib/catalog'
import { needsSetup } from '../lib/installPolicy'
import { onDeepLink, getLaunchDeepLinks } from '../lib/deepLink'
import { routeDeepLink } from '../lib/deepLinkRoute'
import { focusMainWindow } from '../lib/focusWindow'
import { installStepsOf, typeFacts, TIER_META, TYPE_META, type Category } from '../lib/detailContent'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { useT } from '../i18n'
import { CategoryIcon } from './CategoryIcon'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

type NoticeReason = 'invalid' | 'notFound' | 'catalogError' | 'installed' | 'mismatch' | 'failed'

type Phase =
  | { kind: 'loading'; ref: string }
  /** `linkRef` is what the link named (an id or a slug); `ref` is the catalog id it resolved to. */
  | { kind: 'confirm'; ref: string; linkRef: string; item: Item; resource: CatalogResourceDetail; installing: boolean }
  | { kind: 'notice'; reason: NoticeReason; slug?: string; category?: Category; detail?: string }

type Lookup =
  | { status: 'installed'; slug: string; category: Category }
  | { status: 'available'; resource: CatalogResourceDetail }
  | { status: 'notFound' }
  | { status: 'catalogError'; detail: string }

/** `ref` is a catalog id, or a slug from links made before the store sent ids. */
async function lookup(ref: string): Promise<Lookup> {
  let resource: CatalogResourceDetail
  try {
    resource = await callRpc<CatalogResourceDetail>('getResource', [ref])
  } catch (err) {
    if (err instanceof RpcError && (err.code === 'ResourceNotFoundError' || err.code === 'AmbiguousResourceError')) {
      // An installed slug may no longer resolve in the catalog; it is still installed.
      if (!ref.includes(':')) {
        const list = await callRpc<InstalledItem[]>('list').catch(() => [] as InstalledItem[])
        const entry = list.find((e) => e.slug === ref)
        if (entry) return { status: 'installed', slug: entry.slug, category: entry.category }
      }
      return { status: 'notFound' }
    }
    return { status: 'catalogError', detail: err instanceof Error ? err.message : String(err) }
  }
  const list = await callRpc<InstalledItem[]>('list').catch(() => [] as InstalledItem[])
  const entry = installedEntryFor(resource, list)
  // Every provider install is one more config of the same provider, so it is never "already installed".
  if (entry && resource.kind !== 'provider') return { status: 'installed', slug: entry.slug, category: entry.category }
  return { status: 'available', resource }
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

    const { ref, category } = route
    const shown = route.slug ?? ref
    const current = phaseRef.current
    // The launch link can arrive twice (once from the launch read, once as an event).
    if (current?.kind === 'loading' && current.ref === ref) return
    if (current?.kind === 'confirm' && (current.ref === ref || current.linkRef === ref)) return

    const mine = ++seq.current
    const loading: Phase = { kind: 'loading', ref }
    phaseRef.current = loading
    setPhase(loading)
    const found = await lookup(ref)
    if (seq.current !== mine) return

    if (found.status === 'notFound') return setPhase({ kind: 'notice', reason: 'notFound', slug: shown })
    if (found.status === 'catalogError') {
      return setPhase({ kind: 'notice', reason: 'catalogError', slug: shown, detail: found.detail })
    }
    const actual = found.status === 'installed' ? found.category : found.resource.kind
    if (category && category !== actual) return setPhase({ kind: 'notice', reason: 'mismatch', slug: shown })
    if (found.status === 'installed') {
      return setPhase({ kind: 'notice', reason: 'installed', slug: found.slug, category: actual })
    }
    showInList(found.resource.id, actual)
    setPhase({ kind: 'confirm', ref: found.resource.id, linkRef: ref, item: resourceItem(found.resource), resource: found.resource, installing: false })
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

  async function confirmInstall(phase: Extract<Phase, { kind: 'confirm' }>) {
    const { item, ref } = phase
    const mine = seq.current
    setPhase({ ...phase, installing: true })
    appendLine(`$ aas install ${ref}`)
    try {
      const result = await callRpc<InstallOutcome>('installAndEnable', [ref])
      appendLine(`✓ ${t('common.installed')} ${result.slug} ${result.version}`, 'green')
      bumpInstalledVersion()
      if (seq.current !== mine) return
      setSelectedSlug(result.slug)
      if (item.category === 'provider' || needsSetup(result)) setEditingConfigSlug(result.slug)
      setPhase(null)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      appendLine(`✗ ${detail}`, 'red')
      bumpInstalledVersion()
      if (seq.current === mine) setPhase({ kind: 'notice', reason: 'failed', slug: ref, detail })
    }
  }

  function close() {
    if (phase?.kind === 'confirm' && phase.installing) return
    seq.current += 1
    setPhase(null)
  }

  const installing = phase?.kind === 'confirm' && phase.installing

  return (
    <Dialog open={phase !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} layer="top">
        <DialogBody>
          {phase?.kind === 'loading' && (
            <>
              <DialogTitle>{t('installLink.confirmTitle')}</DialogTitle>
              <p role="status" className="mt-3 text-sm text-store-text-2">
                {t('installLink.loading')} <span className="font-mono text-store-text">{phase.ref}</span>…
              </p>
            </>
          )}

          {phase?.kind === 'notice' && (
            <>
              <DialogTitle>
                {t(`installLink.${phase.reason}Title`)}
              </DialogTitle>
              <p className="mt-3 text-sm leading-relaxed text-store-text-2">{t(`installLink.${phase.reason}Body`)}</p>
              {phase.slug && (
                <p className="mt-3 break-all rounded-lg border border-store-border bg-store-term-bg px-3 py-2 font-mono text-xs text-store-text-2">
                  {phase.slug}
                </p>
              )}
              {phase.detail && <p className="mt-2 break-words text-xs text-store-red">{phase.detail}</p>}
            </>
          )}

          {phase?.kind === 'confirm' && <ConfirmBody item={phase.item} resource={phase.resource} />}
        </DialogBody>

        <DialogFooter>
          {/* First in the DOM so it takes initial focus: Enter must not install. */}
          <Button onClick={close} aria-disabled={installing} className="aria-disabled:opacity-50">
            {phase?.kind === 'notice' ? t('installLink.close') : t('common.cancel')}
          </Button>
          {phase?.kind === 'notice' && phase.reason === 'installed' && phase.slug && phase.category && (
            <Button
              variant="primary"
              onClick={() => {
                showInList(phase.slug!, phase.category!)
                close()
              }}
            >
              {t('installLink.view')}
            </Button>
          )}
          {phase?.kind === 'confirm' && (
            <Button
              variant="primary"
              onClick={() => void confirmInstall(phase)}
              disabled={installing || !!phase.resource.installError}
            >
              {installing ? t('installLink.installing') : t('installLink.confirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmBody({ item, resource }: { item: Item; resource: CatalogResourceDetail }) {
  const t = useT()
  const detail = { ...item, installed: false as const, resource }
  const tierKey = TIER_META[item.publisher.tier] ? item.publisher.tier : 'community'
  const tier = TIER_META[tierKey]
  const lines = [...installStepsOf(detail, t), ...typeFacts(detail, t)]

  return (
    <>
      <DialogTitle>{t('installLink.confirmTitle')}</DialogTitle>

      <div className="mt-4 flex items-center gap-3">
        <CategoryIcon category={item.category} size="md" />
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-store-text">{item.name}</p>
          <p className="truncate font-mono text-[11px] text-store-text-3">
            {resource.id}{item.version ? ` · ${formatVersion(item.version)}` : ''}
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
      {resource.installError && (
        <p className="mt-2 break-words text-xs text-store-red">{t('errors.notInstallable')} {resource.installError}</p>
      )}

      <p className="mt-4 rounded-lg border border-store-amber bg-store-amber-soft px-3 py-2 text-xs leading-relaxed text-store-text">
        {t('installLink.fromWeb')}
      </p>
    </>
  )
}
