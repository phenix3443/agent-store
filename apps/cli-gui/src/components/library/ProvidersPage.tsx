import { useEffect, useState, type ReactNode } from 'react'
import { Plus, SquareTerminal } from 'lucide-react'
import type { RelayStatus } from '@as/types'
import { callRpc } from '../../lib/rpc'
import { AGENTS } from '../../lib/agents'
import { useInstalled, type InstalledRow } from '../../lib/useInstalled'
import { useAppState } from '../../state/AppState'
import { useEntitlement } from '../../state/Entitlement'
import { useT } from '../../i18n'
import { ProGate } from '../ProGate'
import { ProviderHealthCard } from '../ProviderHealthCard'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner, EmptyState, LoadingRows } from '../ui/states'
import { cn } from '../ui/cn'
import { AgentColumns, AgentSwitch, ListBox, ListRow, PageWithPane, ViewHeader } from './parts'
import { ProviderPane } from './ProviderPane'
import { useTargetToggle } from './useTargetToggle'
import { useUninstall } from './UninstallDialog'

// The relay's own cap on the Free plan (client-core relay/server.ts FREE_MAX_UPSTREAMS).
const FREE_MAX_UPSTREAMS = 2

const cfg = (r: InstalledRow) => r.currentConfig ?? {}
const levelOf = (r: InstalledRow) => Number(cfg(r)['level'] ?? 1) || 1
const nameOf = (r: InstalledRow) => String(cfg(r)['name'] ?? r.name ?? r.slug)
const hasKey = (r: InstalledRow) => !!cfg(r)['apiKey'] || (Array.isArray(cfg(r)['apiKeys']) && (cfg(r)['apiKeys'] as unknown[]).length > 0)

function Node({ on, children, dim, title }: { on?: boolean; dim?: boolean; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-black/20 px-2.5',
        on ? 'border-provider/45' : 'border-line',
        dim && 'opacity-50'
      )}
    >
      {children}
    </span>
  )
}

function Level({ n }: { n: number }) {
  return <span className="inline-grid h-[22px] min-w-[26px] flex-none place-items-center rounded-md border border-line-strong bg-panel-2 px-1.5 font-mono text-[11px] font-semibold text-fg-2">L{n}</span>
}

/** 供应商: the local relay, then every provider config in the order the relay tries them. */
export function ProvidersPage() {
  const t = useT()
  const { selectedSlug, setSelectedSlug, setNavView, setCategoryFilter, setDiscoverKind, setShellDialog, installedVersion } = useAppState()
  const { has } = useEntitlement()
  const { rows, loading, error, reload } = useInstalled('provider')
  const toggle = useTargetToggle()
  const uninstall = useUninstall((slug) => {
    if (selectedSlug === slug) setSelectedSlug(null)
  })
  const [relay, setRelay] = useState<RelayStatus | null>(null)

  useEffect(() => {
    callRpc<RelayStatus>('getRelayStatus').then(setRelay, () => setRelay(null))
  }, [installedVersion])

  const local = rows.find((r) => r.slug === 'local')
  const list = rows.filter((r) => r.slug !== 'local').sort((a, b) => levelOf(a) - levelOf(b) || a.slug.localeCompare(b.slug))
  const pro = has('smartRouting')
  const listen = String(local?.currentConfig?.['baseUrl'] ?? 'http://127.0.0.1:18100').replace(/^https?:\/\//, '')

  function addProvider() {
    setDiscoverKind('provider')
    setSelectedSlug(null)
    setCategoryFilter('all')
    setNavView('browse')
  }

  const relayCard = (
    <div data-kind="provider" className="rounded-box border border-line bg-panel p-3.5">
      <h3 className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
        <i
          aria-hidden
          className={cn(
            'mx-0.5 h-2 w-2 flex-none rounded-full',
            relay?.running ? 'bg-provider shadow-[0_0_0_3px_rgb(var(--provider-rgb)/0.18),0_0_10px_rgb(var(--provider-rgb)/0.8)]' : 'bg-fg-3'
          )}
        />
        {t('relay.title')}
        {relay && <Badge tone={relay.running ? 'ok' : 'neutral'}>{t(relay.running ? 'relay.on' : 'relay.off')}</Badge>}
        <span className="flex-1" />
        <Button size="sm" onClick={() => setShellDialog('requestLog')}>
          <SquareTerminal />
          {t('relay.log')}
        </Button>
        {local && (
          <Button size="sm" onClick={() => setSelectedSlug('local')}>
            {t('relay.settings')}
          </Button>
        )}
      </h3>
      <p className="mt-1.5 max-w-[74ch] text-xs text-fg-3">{t('relay.d')}</p>
      {relay && !relay.running && (
        <div className="mt-3">
          <Banner tone="warn">
            <p className="text-fg">{t('relay.stoppedD')}</p>
          </Banner>
        </div>
      )}
      {relay?.running &&
        AGENTS.map((agent) => {
          const wired = !!local?.enabledFor[agent.id]
          const chain = list.filter((r) => r.enabledFor[agent.id] && hasKey(r) && !!cfg(r)['baseUrl'])
          return (
            <div key={agent.id} className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-2">
              <Node on={wired}>
                <b className="text-fg">{agent.name}</b>
              </Node>
              <span className="text-fg-3">→</span>
              {wired ? (
                <>
                  <Node on>
                    <span className="font-mono text-[11.5px]">{listen}</span>
                  </Node>
                  {chain.length === 0 ? (
                    <>
                      <span className="text-fg-3">→</span>
                      <span className="text-warn">{t('relay.noChain')}</span>
                    </>
                  ) : (
                    chain.map((r, i) => {
                      const cut = !pro && i >= FREE_MAX_UPSTREAMS
                      return (
                        <span key={r.slug} className="contents">
                          <span className="text-fg-3">→</span>
                          <Node on={!cut} dim={cut} title={cut ? t('relay.free2') : undefined}>
                            <Level n={levelOf(r)} />
                            {nameOf(r)}
                          </Node>
                        </span>
                      )
                    })
                  )}
                </>
              ) : (
                <span className="text-fg-3">{t('relay.notWired')}</span>
              )}
            </div>
          )
        })}
      <p className="mt-3 text-xs text-fg-3">{t(pro ? 'relay.rulePro' : 'relay.ruleFree')}</p>
    </div>
  )

  let body
  if (loading && rows.length === 0) body = <LoadingRows rows={3} label={t('ui.loading')} />
  else if (error && rows.length === 0) {
    body = (
      <Banner tone="error" title={t('lib.loadFailed')} actions={<Button size="sm" onClick={reload}>{t('ui.retry')}</Button>}>
        <p>{error}</p>
      </Banner>
    )
  } else if (list.length === 0) {
    body = (
      <EmptyState
        kind="provider"
        title={t('prov.emptyT')}
        body={t('prov.emptyD')}
        action={
          <Button variant="primary" onClick={addProvider}>
            {t('prov.add')}
          </Button>
        }
      />
    )
  } else {
    body = (
      <ListBox>
        {list.map((r) => {
          const parent = r.parentSlug ? rows.find((x) => x.slug === r.parentSlug) : undefined
          return (
            <ListRow
              key={r.slug}
              kind="provider"
              selected={r.slug === selectedSlug}
              onOpen={() => setSelectedSlug(r.slug)}
              lead={<Level n={levelOf(r)} />}
              title={nameOf(r)}
              chips={
                <>
                  {!hasKey(r) && <Badge tone="warn">{t('st.noKey')}</Badge>}
                  {r.parentSlug && <Badge>{t('st.copyOf').replace('{0}', parent ? nameOf(parent) : r.parentSlug)}</Badge>}
                </>
              }
              sub={String(cfg(r)['baseUrl'] ?? '')}
              subMono
              right={
                <>
                  {AGENTS.map((agent) => {
                    const on = !!r.enabledFor[agent.id]
                    const reason = r.compatibleWith.includes(agent.id) ? undefined : t('errors.incompatible').replace('{tool}', agent.name)
                    return (
                      <span key={agent.id} className="flex w-[78px] flex-none justify-center max-[1040px]:w-[64px]">
                        <AgentSwitch
                          kind="provider"
                          agent={agent}
                          itemName={nameOf(r)}
                          checked={on}
                          reason={reason}
                          busy={toggle.busy === `${r.slug}:${agent.id}`}
                          onToggle={() =>
                            void toggle.toggle(r.slug, agent.id, on).then((failed) => {
                              if (failed) setSelectedSlug(r.slug)
                            })
                          }
                        />
                      </span>
                    )
                  })}
                  <span className="w-[112px] flex-none" />
                </>
              }
            />
          )
        })}
      </ListBox>
    )
  }

  return (
    <>
      <PageWithPane
        view={
          <>
            <ViewHeader
              title={t('prov.title')}
              sub={t('prov.sub')}
              actions={
                <Button size="sm" onClick={addProvider}>
                  <Plus />
                  {t('prov.add')}
                </Button>
              }
            />
            {relayCard}
            <div className="mt-[18px]">
              <AgentColumns label={t('prov.order')} trailing={<span />} />
              {body}
            </div>
            <div className="mt-3.5">
              <ProGate feature="smartRouting" title={t('pro.smartRouting.title')} description={t('pro.smartRouting.desc')}>
                <ProviderHealthCard />
              </ProGate>
            </div>
          </>
        }
        pane={
          selectedSlug && rows.some((r) => r.slug === selectedSlug) ? (
            <ProviderPane
              key={selectedSlug}
              slug={selectedSlug}
              toggle={toggle}
              onClose={() => setSelectedSlug(null)}
              onUninstall={(d, name) => uninstall.ask({ slug: d.slug, category: d.category, enabledFor: d.enabledFor, name })}
            />
          ) : null
        }
      />
      {uninstall.dialog}
    </>
  )
}
