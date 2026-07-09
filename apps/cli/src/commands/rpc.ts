import type { Engine, BudgetConfig, ListOptions, SearchOptions, ToolTarget, UsageSummaryOptions } from '@as/types'

type RpcHandler = (engine: Engine, args: unknown[]) => Promise<unknown>

const RPC_METHODS: Record<string, RpcHandler> = {
  search: (e, a) => e.search(a[0] as string, a[1] as SearchOptions | undefined),
  install: (e, a) => e.install(a[0] as string),
  uninstall: (e, a) => e.uninstall(a[0] as string),
  enable: (e, a) => e.enable(a[0] as string, a[1] as ToolTarget),
  disable: (e, a) => e.disable(a[0] as string, a[1] as ToolTarget),
  getConfigSchema: (e, a) => e.getConfigSchema(a[0] as string),
  setConfig: (e, a) => e.setConfig(a[0] as string, a[1] as Record<string, unknown>),
  sync: (e, a) => e.sync(a[0] as ToolTarget[] | undefined),
  checkUpdates: (e, a) => e.checkUpdates(a[0] as string[] | undefined),
  update: (e, a) => e.update(a[0] as string | undefined),
  list: (e, a) => e.list(a[0] as ListOptions | undefined),
  info: (e, a) => e.info(a[0] as string),
  duplicateProvider: (e, a) => e.duplicateProvider(a[0] as string),
  getUsageSummary: (e, a) => e.getUsageSummary(a[0] as UsageSummaryOptions | undefined),
  getRecentRequests: (e, a) => e.getRecentRequests(a[0] as { limit?: number } | undefined),
  getRelayStatus: (e) => e.getRelayStatus(),
  getProviderHealth: (e) => e.getProviderHealth(),
  resetProviderHealth: (e, a) => e.resetProviderHealth(a[0] as string),
  listLocalConfigs: (e) => e.listLocalConfigs(),
  addLocalConfig: (e, a) => e.addLocalConfig(a[0] as string),
  removeLocalConfig: (e, a) => e.removeLocalConfig(a[0] as string),
  updateLocalConfig: (e, a) =>
    e.updateLocalConfig(
      a[0] as string,
      a[1] as { name?: string; port?: number; enabledFor?: Partial<Record<ToolTarget, boolean>> }
    ),
  toggleLocalConfig: (e, a) => e.toggleLocalConfig(a[0] as string),
  getEntitlements: (e) => e.getEntitlements(),
  syncEntitlement: (e, a) => e.syncEntitlement(a[0] as string),
  createCheckout: (e, a) => e.createCheckout(a[0] as 'monthly' | 'yearly' | 'lifetime', a[1] as string | undefined),
  getReviews: (e, a) => e.getReviews(a[0] as string),
  getVersions: (e, a) => e.getVersions(a[0] as string),
  clearEntitlement: (e) => e.clearEntitlement(),
  exportUsage: (e, a) => e.exportUsage(a[0] as 'csv' | 'json', a[1] as number | undefined),
  getBudget: (e) => e.getBudget(),
  setBudget: (e, a) => e.setBudget(a[0] as BudgetConfig),
  getBudgetStatus: (e) => e.getBudgetStatus(),
}

export async function runRpc(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const [method, jsonArgs] = args
  const handler = method ? RPC_METHODS[method] : undefined

  if (!handler) {
    out(JSON.stringify({ ok: false, error: `Unknown RPC method: ${method}` }))
    return 1
  }

  let parsedArgs: unknown[]
  try {
    parsedArgs = jsonArgs ? (JSON.parse(jsonArgs) as unknown[]) : []
  } catch {
    out(JSON.stringify({ ok: false, error: 'Invalid JSON arguments' }))
    return 1
  }

  try {
    const data = await handler(engine, parsedArgs)
    out(JSON.stringify({ ok: true, data: data ?? null }))
    return 0
  } catch (err) {
    out(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    return 1
  }
}
