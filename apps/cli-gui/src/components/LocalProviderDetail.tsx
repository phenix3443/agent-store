export const LOCAL_PROVIDER_SENTINEL = '__local__'

export function isLocalProviderSlug(slug: string | null): boolean {
  return slug === LOCAL_PROVIDER_SENTINEL || (slug?.startsWith(`${LOCAL_PROVIDER_SENTINEL}:`) ?? false)
}

export function localConfigIdFromSlug(slug: string): string | null {
  if (slug === LOCAL_PROVIDER_SENTINEL) return null
  return slug.slice(`${LOCAL_PROVIDER_SENTINEL}:`.length)
}

import { useEffect, useState } from 'react'
import { ArrowLeft, RadioTower } from 'lucide-react'
import type { LocalRelayConfig } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { ProxyLogModal } from './ProxyLogModal'

export function LocalProviderDetail({ selectedSlug }: { selectedSlug: string }) {
  const { setSelectedSlug } = useAppState()
  const [configs, setConfigs] = useState<LocalRelayConfig[]>([])
  const [logModalOpen, setLogModalOpen] = useState(false)

  async function refresh() {
    setConfigs(await callRpc<LocalRelayConfig[]>('listLocalConfigs'))
  }

  useEffect(() => {
    refresh()
  }, [])

  const configId = localConfigIdFromSlug(selectedSlug)
  const runningCount = configs.filter((c) => c.enabled).length

  if (configId === null) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-store-accent-soft text-store-accent">
            <RadioTower size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-store-text">local</h2>
              <span className="rounded-full bg-store-accent-soft px-2 py-0.5 text-[10px] font-medium text-store-accent">
                内置 Provider
              </span>
            </div>
            <p className="text-xs text-store-text-2">by Agent Store</p>
          </div>
        </div>

        <p className="mt-3 text-sm text-store-text-2">
          Claude / Codex 指向 local 的某个监听端口，请求经该配置按 Level 顺序转发到上游供应商，失败自动降级。
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-store-border pt-4">
          <div className="flex items-center gap-4 text-sm text-store-text-2">
            <span>127.0.0.1</span>
            <span>{configs.length} 个配置</span>
            <span className="text-store-green">{runningCount} 个运行中</span>
          </div>
          <button type="button" onClick={() => setLogModalOpen(true)} className="text-xs text-store-accent hover:opacity-80">
            查看代理日志
          </button>
        </div>
        <ProxyLogModal open={logModalOpen} onOpenChange={setLogModalOpen} />
      </div>
    )
  }

  const config = configs.find((c) => c.id === configId)
  if (!config) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <button type="button" onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)} className="flex items-center gap-1 text-sm text-store-text-2 hover:text-store-text">
          <ArrowLeft size={14} /> local
        </button>
      </div>
    )
  }

  async function toggle() {
    await callRpc('toggleLocalConfig', [configId])
    refresh()
  }

  async function changePort(port: number) {
    if (!Number.isInteger(port) || port <= 0) return
    await callRpc('updateLocalConfig', [configId, { port }])
    refresh()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)} className="flex items-center gap-1 text-xs text-store-text-2 hover:text-store-text">
            <ArrowLeft size={12} /> local
          </button>
          <h2 className="mt-1 text-lg font-semibold text-store-text">{config.name}</h2>
          <p className="text-xs text-store-text-2">把 Claude / Codex 的 base URL 指向此端口即可接入这份配置。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={config.enabled ? 'text-xs text-store-green' : 'text-xs text-store-text-2'}>
            {config.enabled ? '运行中' : '已停用'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label={`${config.name} 启用状态`}
            onClick={toggle}
            className={`h-6 w-11 rounded-full p-0.5 transition-colors ${config.enabled ? 'bg-store-accent' : 'bg-store-border-strong'}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-store-border pt-4">
        <p className="mb-2 text-xs font-medium text-store-text-2">监听端口</p>
        <div className="flex items-center gap-2 rounded-lg border border-store-border bg-store-panel-2 px-3 py-2 font-mono text-sm">
          <span className="text-store-text-3">127.0.0.1 :</span>
          <input
            value={config.port}
            onChange={(e) => changePort(Number(e.target.value))}
            className="w-20 bg-transparent text-store-accent outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-store-text-3">
          把 Claude / Codex 的 base URL 指向 http://127.0.0.1:{config.port} 即可接入这份配置。
        </p>
      </div>
    </div>
  )
}
