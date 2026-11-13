import type {
  Plan,
  ResourceDetail,
  ResourceKind,
  ResourceListResponse,
  ResourceSort,
  SearchSupplementResponse,
} from '@as/types'

/** `status` is the HTTP status when the server answered; absent for network errors. */
export type Result<T> = { data: T; error: null } | { data: null; error: string; status?: number }

export interface ListResourcesParams {
  kind?: ResourceKind
  q?: string
  sort?: ResourceSort
  /** The API caps it at 100. */
  limit?: number
  offset?: number
}

export class StoreClient {
  readonly baseUrl: string
  private readonly fetchInit?: RequestInit
  private readonly timeoutMs?: number

  constructor(baseUrl = 'http://localhost:3000', options: { fetchInit?: RequestInit; timeoutMs?: number } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetchInit = options.fetchInit
    this.timeoutMs = options.timeoutMs
  }

  /** Wraps fetch with the configured fetchInit + an optional timeout; abort/timeout errors propagate like any other network error. */
  private async _fetch(url: string, init?: RequestInit): Promise<Response> {
    const mergedInit: RequestInit = { ...this.fetchInit, ...init }
    if (this.timeoutMs == null) return fetch(url, mergedInit)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await fetch(url, { ...mergedInit, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  /** GET /api/resources: one page of the aggregated catalog, searched and sorted on the server. */
  async listResources(params: ListResourcesParams = {}): Promise<Result<ResourceListResponse>> {
    try {
      const url = new URL(`${this.baseUrl}/api/resources`)
      if (params.kind) url.searchParams.set('kind', params.kind)
      if (params.q?.trim()) url.searchParams.set('q', params.q.trim())
      if (params.sort && params.sort !== 'default') url.searchParams.set('sort', params.sort)
      if (params.limit != null) url.searchParams.set('limit', String(params.limit))
      if (params.offset) url.searchParams.set('offset', String(params.offset))

      const res = await this._fetch(url.toString())
      const json = (await res.json().catch(() => ({}))) as Partial<ResourceListResponse> & { error?: string }
      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}`, status: res.status }
      if (!Array.isArray(json.resources)) return { data: null, error: 'No resources in response' }
      return { data: { resources: json.resources, nextOffset: json.nextOffset ?? null }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** GET /api/resources/<id>. Ids hold ':' and '/'; each path segment is encoded on its own. */
  async getResource(id: string): Promise<Result<ResourceDetail>> {
    try {
      const path = id.split('/').map(encodeURIComponent).join('/')
      const res = await this._fetch(`${this.baseUrl}/api/resources/${path}`)
      const json = (await res.json().catch(() => ({}))) as { resource?: ResourceDetail; error?: string }
      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}`, status: res.status }
      if (!json.resource) return { data: null, error: 'No resource in response' }
      return { data: json.resource, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * GET /api/search/supplement: what other skill directories list for a query the catalog
   * answers poorly. Call it once the query has settled (not per keystroke) and only for
   * the first page. `wait` holds the request up to that many seconds for a running lookup;
   * on `searching`, call again after `retryAfterSeconds`.
   */
  async searchSupplement(params: { q: string; kind?: ResourceKind; wait?: number }): Promise<Result<SearchSupplementResponse>> {
    try {
      const url = new URL(`${this.baseUrl}/api/search/supplement`)
      url.searchParams.set('q', params.q.trim())
      if (params.kind) url.searchParams.set('kind', params.kind)
      if (params.wait) url.searchParams.set('wait', String(params.wait))
      const res = await this._fetch(url.toString())
      const json = (await res.json().catch(() => ({}))) as Partial<SearchSupplementResponse> & { error?: string }
      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}`, status: res.status }
      if (!json.status || !Array.isArray(json.resources) || !Array.isArray(json.listings)) return { data: null, error: 'Malformed supplement response' }
      return { data: json as SearchSupplementResponse, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Resolves the authenticated user's plan from their Supabase session token. */
  async getMyEntitlements(token: string): Promise<Result<{ plan: Plan }>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/me/entitlements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json() as { plan?: Plan; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (!json.plan) return { data: null, error: 'No plan in response' }
      return { data: { plan: json.plan }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Creates a Pro checkout session; pass the session token to bind the subscription to the user. */
  async createCheckout(
    body: { period: 'monthly' | 'yearly' | 'lifetime'; email?: string; trial?: boolean },
    options: { token?: string } = {}
  ): Promise<Result<{ checkoutUrl: string }>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (options.token) headers['Authorization'] = `Bearer ${options.token}`

      const res = await this._fetch(`${this.baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const json = await res.json() as { checkoutUrl?: string; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (!json.checkoutUrl) return { data: null, error: 'No checkoutUrl in response' }
      return { data: { checkoutUrl: json.checkoutUrl }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
