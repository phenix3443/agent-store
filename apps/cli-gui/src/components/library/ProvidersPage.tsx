import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GripVertical, Plus, SquareTerminal } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { callRpc, errorText } from '../../lib/rpc'
import { AGENTS } from '../../lib/agents'
import { AGENT_RELAY_ADDRESS } from '../../lib/relay'
import { useRelay } from '../../lib/useRelay'
import { useInstalled, type InstalledRow } from '../../lib/useInstalled'
import { useAppState } from '../../state/AppState'
import { useEntitlement } from '../../state/Entitlement'
import { useT } from '../../i18n'
import { ProGate } from '../ProGate'
import { ProviderHealthCard } from '../ProviderHealthCard'
import { RelayBadge, RelayDot, RelayHowItWorks, RelayListen, RelayNotices, RelayToggleButton } from '../relay/RelayParts'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner, EmptyState, LoadingRows } from '../ui/states'
import { toast } from '../ui/toast'
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

function SortableProvider({ id, label, disabled, children }: { id: string; label: string; disabled: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      title={label}
      className="inline-grid h-[26px] w-[26px] flex-none cursor-grab touch-none place-items-center rounded-[7px] text-fg-3 hover:bg-panel-2 hover:text-fg active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-4 [&_svg]:w-4"
    >
      <GripVertical />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null), transition }}
      className={cn('relative border-b border-line last:border-b-0', isDragging && 'z-10 bg-canvas-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)]')}
    >
      {children(handle)}
    </div>
  )
}

/** 供应商: the local relay, then every provider config in the order the relay tries them. */
export function ProvidersPage() {
  const t = useT()
  const { selectedSlug, setSelectedSlug, setNavView, setCategoryFilter, setDiscoverKind, setShellDialog, bumpInstalledVersion } = useAppState()
  const { has } = useEntitlement()
  const { rows, loading, error, reload } = useInstalled('provider')
  const toggle = useTargetToggle()
  const uninstall = useUninstall((slug) => {
    if (selectedSlug === slug) setSelectedSlug(null)
  })
  const relay = useRelay()
  const [order, setOrder] = useState<string[] | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const local = rows.find((r) => r.slug === 'local')
  // Same order as the relay: Level, then install order (rows come in registry order; sort is stable).
  const sorted = useMemo(() => rows.filter((r) => r.slug !== 'local').sort((a, b) => levelOf(a) - levelOf(b)), [rows])
  useEffect(() => setOrder(null), [rows])
  const list = order ? order.map((slug) => sorted.find((r) => r.slug === slug)).filter((r): r is InstalledRow => !!r) : sorted
  const pro = has('smartRouting')

  const position = (id: UniqueIdentifier) => list.findIndex((r) => r.slug === id) + 1
  const named = (id: UniqueIdentifier) => {
    const r = list.find((x) => x.slug === id)
    return r ? nameOf(r) : String(id)
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('provOrder.aStart').replace('{0}', named(active.id)).replace('{1}', String(position(active.id))),
    onDragOver: ({ active, over }) => (over ? t('provOrder.aOver').replace('{0}', named(active.id)).replace('{1}', String(position(over.id))) : undefined),
    onDragEnd: ({ active, over }) => (over ? t('provOrder.aEnd').replace('{0}', named(active.id)).replace(/\{1\}/g, String(position(over.id))) : undefined),
    onDragCancel: ({ active }) => t('provOrder.aCancel').replace('{0}', named(active.id)).replace('{1}', String(position(active.id))),
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const slugs = list.map((r) => r.slug)
    const next = arrayMove(slugs, slugs.indexOf(String(active.id)), slugs.indexOf(String(over.id)))
    setOrder(next)
    setSavingOrder(true)
    setOrderError(null)
    try {
      await callRpc('setProviderOrder', [next])
      toast(t('provOrder.toast').replace('{0}', named(active.id)).replace('{1}', String(next.indexOf(String(active.id)) + 1)))
    } catch (err) {
      setOrder(null)
      setOrderError(errorText(err))
    } finally {
      setSavingOrder(false)
      bumpInstalledVersion()
    }
  }

  function addProvider() {
    setDiscoverKind('provider')
    setSelectedSlug(null)
    setCategoryFilter('all')
    setNavView('browse')
  }

  const status = relay.status
  const relayCard = (
    <div data-kind="provider" className="rounded-box border border-line bg-panel p-3.5">
      <h3 className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
        <RelayDot status={status} />
        {t('relayCard.title')}
        {status && <RelayBadge status={status} />}
        <span className="flex-1" />
        <Button size="sm" onClick={() => setShellDialog('requestLog')}>
          <SquareTerminal />
          {t('relayCard.log')}
        </Button>
        {local && (
          <Button size="sm" onClick={() => setSelectedSlug('local')}>
            {t('relayCard.settings')}
          </Button>
        )}
        <RelayToggleButton relay={relay} />
      </h3>
      <p className="mt-1.5 max-w-[74ch] text-xs text-fg-3">{t('relayCard.d')}</p>
      {status?.running && (
        <div className="mt-2.5 flex flex-wrap items-baseline gap-2 text-xs">
          <span className="text-fg-3">{t('relay.listen')}</span>
          <RelayListen status={status} />
        </div>
      )}
      {relay.loadFailed && !status && (
        <div className="mt-3">
          <Banner tone="error" title={t('relayCtl.loadFailed')} />
        </div>
      )}
      <RelayNotices relay={relay} />
      {status?.running &&
        AGENTS.map((agent) => {
          const wired = status.routedAgents?.[agent.id] === true
          const chain = list.filter((r) => r.enabledFor[agent.id] && r.compatibleWith.includes(agent.id) && hasKey(r) && !!cfg(r)['baseUrl'])
          return (
            <div key={agent.id} className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-2">
              <Node on={wired}>
                <b className="text-fg">{agent.name}</b>
              </Node>
              <span className="text-fg-3">→</span>
              {wired ? (
                <>
                  <Node on>
                    <span className="font-mono text-[11.5px]">{AGENT_RELAY_ADDRESS}</span>
                  </Node>
                  {chain.length === 0 ? (
                    <>
                      <span className="text-fg-3">→</span>
                      <span className="text-warn">{t('relayCard.noChain')}</span>
                    </>
                  ) : (
                    chain.map((r, i) => {
                      const cut = !pro && i >= FREE_MAX_UPSTREAMS
                      return (
                        <span key={r.slug} className="contents">
                          <span className="text-fg-3">→</span>
                          <Node on={!cut} dim={cut} title={cut ? t('relayCard.free2') : undefined}>
                            <Level n={levelOf(r)} />
                            {nameOf(r)}
                          </Node>
                        </span>
                      )
                    })
                  )}
                </>
              ) : (
                <span className="text-fg-3">{t('relayCard.notWired')}</span>
              )}
            </div>
          )
        })}
      <p className="mt-3 text-xs text-fg-3">{t(pro ? 'relayCard.rulePro' : 'relayCard.ruleFree')}</p>
      <RelayHowItWorks />
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void onDragEnd(e)}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t('provOrder.instructions') } }}
      >
        <SortableContext items={list.map((r) => r.slug)} strategy={verticalListSortingStrategy}>
          <ListBox label={t('prov.order')}>
            {list.map((r) => {
              const parent = r.parentSlug ? rows.find((x) => x.slug === r.parentSlug) : undefined
              return (
                <SortableProvider key={r.slug} id={r.slug} label={t('provOrder.handle').replace('{0}', nameOf(r))} disabled={savingOrder || list.length < 2}>
                  {(handle) => (
                    <ListRow
                      kind="provider"
                      selected={r.slug === selectedSlug}
                      onOpen={() => setSelectedSlug(r.slug)}
                      lead={<Level n={order ? list.indexOf(r) + 1 : levelOf(r)} />}
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
                          <span className="flex w-[112px] flex-none justify-end">{handle}</span>
                        </>
                      }
                    />
                  )}
                </SortableProvider>
              )
            })}
          </ListBox>
        </SortableContext>
      </DndContext>
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
              <AgentColumns label={t('prov.order')} trailing={list.length > 1 ? <span>{t('provOrder.col')}</span> : <span />} />
              {orderError && (
                <div className="mb-2">
                  <Banner tone="error" title={t('provOrder.failed')}>
                    <p>{orderError}</p>
                  </Banner>
                </div>
              )}
              {body}
              {list.length > 1 && <p className="mt-2 text-xs text-fg-3">{t('provOrder.hint')}</p>}
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
      {relay.dialog}
    </>
  )
}
