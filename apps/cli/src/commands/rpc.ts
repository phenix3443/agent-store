import { resolvePaths, runDoctor } from '@as/client-core'
import type { Engine, AddProjectOptions, ProjectInstallOptions, ProjectUninstallOptions, BudgetConfig, EnableOptions, DisableOptions, InstallOptions, ListOptions, ResourceKind, SearchOptions, ToolTarget, UsageSummaryOptions } from '@as/types'

type RpcHandler = (engine: Engine, args: unknown[]) => Promise<unknown>

const RPC_METHODS: Record<string, RpcHandler> = {
  search: (e, a) => e.search(a[0] as string, a[1] as SearchOptions | undefined),
  getResource: (e, a) => e.getResource(a[0] as string, a[1] as { kind?: ResourceKind } | undefined),
  install: (e, a) => e.install(a[0] as string, a[1] as InstallOptions | undefined),
  installAndEnable: (e, a) => e.installAndEnable(a[0] as string, a[1] as InstallOptions | undefined),
  getTargetStatus: (e, a) => e.getTargetStatus(a[0] as string),
  uninstall: (e, a) => e.uninstall(a[0] as string, a[1] as DisableOptions | undefined),
  enable: (e, a) => e.enable(a[0] as string, a[1] as ToolTarget, a[2] as EnableOptions | undefined),
  disable: (e, a) => e.disable(a[0] as string, a[1] as ToolTarget, a[2] as DisableOptions | undefined),
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
  clearEntitlement: (e) => e.clearEntitlement(),
  exportUsage: (e, a) => e.exportUsage(a[0] as 'csv' | 'json', a[1] as number | undefined),
  getBudget: (e) => e.getBudget(),
  setBudget: (e, a) => e.setBudget(a[0] as BudgetConfig),
  getBudgetStatus: (e) => e.getBudgetStatus(),
  listProjects: (e) => e.listProjects(),
  addProject: (e, a) => e.addProject(a[0] as string, a[1] as AddProjectOptions | undefined),
  removeProject: (e, a) => e.removeProject(a[0] as string),
  relocateProject: (e, a) => e.relocateProject(a[0] as string, a[1] as string),
  getProject: (e, a) => e.getProject(a[0] as string),
  installToProject: (e, a) => e.installToProject(a[0] as string, a[1] as string, a[2] as ProjectInstallOptions | undefined),
  uninstallFromProject: (e, a) => e.uninstallFromProject(a[0] as string, a[1] as string, a[2] as ProjectUninstallOptions | undefined),
  setProjectEnv: (e, a) => e.setProjectEnv(a[0] as string, a[1] as string, a[2] as string),
  unsetProjectEnv: (e, a) => e.unsetProjectEnv(a[0] as string, a[1] as string),
  doctor: () => runDoctor(resolvePaths()),
}

/**
 * `code` is the error class name; `reason` / `tool` / `target` / `state` are the engine error's own
 * fields. The desktop client turns them into what the user should do next.
 */
function errorFields(err: unknown): Record<string, string> {
  if (!(err instanceof Error)) return {}
  const fields: Record<string, string> = { code: err.name }
  for (const key of ['reason', 'tool', 'target', 'state'] as const) {
    const value = (err as unknown as Record<string, unknown>)[key]
    if (typeof value === 'string') fields[key] = value
  }
  return fields
}

export async function readFirstLine(input: AsyncIterable<Uint8Array | string> = process.stdin): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of input) {
    text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    const end = text.indexOf('\n')
    if (end >= 0) return text.slice(0, end).replace(/\r$/, '')
  }
  return (text + decoder.decode()).replace(/\r$/, '')
}

/**
 * `aas __rpc <method> -` reads the JSON argument array from the first line of stdin; the desktop client
 * always calls it this way, so secret values never reach argv. The client cannot close the sidecar's
 * stdin, so the line must end in a newline rather than EOF. `aas __rpc <method> '<json>'` still works for
 * scripts, only for calls without secrets.
 */
export async function runRpc(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log,
  readStdin: () => Promise<string> = () => readFirstLine()
): Promise<number> {
  const [method, argvArgs] = args
  const handler = method ? RPC_METHODS[method] : undefined

  if (!handler) {
    out(JSON.stringify({ ok: false, error: `Unknown RPC method: ${method}` }))
    return 1
  }

  let parsedArgs: unknown[]
  try {
    const jsonArgs = argvArgs === '-' ? await readStdin() : argvArgs
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
    out(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err), ...errorFields(err) }))
    return 1
  }
}
