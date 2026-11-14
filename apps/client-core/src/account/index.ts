import type { AccessToken, DeviceAuthorization, DevicePoll, FavoriteEntry } from '@as/types'
import type { StoreClient } from '@as/sdk'

/** The client id the store's deviceAuthorization plugin accepts (apps/store/lib/auth/server.ts). */
export const DESKTOP_CLIENT_ID = 'agent-store-desktop'

/** The server no longer accepts the session or token: it expired, was revoked, or the account is gone. */
export class SessionExpiredError extends Error {
  constructor() {
    super('The sign-in has expired or was revoked')
    this.name = 'SessionExpiredError'
  }
}

export type FavoriteRejection = 'invalid' | 'notFound' | 'full'

/** The API refused a favorite change for good; retrying the same change cannot succeed. */
export class FavoriteRejectedError extends Error {
  constructor(readonly id: string, readonly reason: FavoriteRejection, message: string) {
    super(message)
    this.name = 'FavoriteRejectedError'
  }
}

/** The request failed in a way that may pass later (network, 5xx). `state` carries the HTTP status. */
export class StoreUnavailableError extends Error {
  constructor(message: string, readonly state?: string) {
    super(message)
    this.name = 'StoreUnavailableError'
  }
}

type Failure = { error: string; status?: number }

function unavailable(result: Failure): StoreUnavailableError {
  return new StoreUnavailableError(result.error, result.status != null ? String(result.status) : undefined)
}

/** `auth` serves the store's /api/auth/*, `api` the API's /api/me/*; one origin when deployed. */
export class AccountService {
  constructor(private readonly auth: StoreClient, private readonly api: StoreClient = auth) {}

  async startSignIn(): Promise<DeviceAuthorization> {
    const result = await this.auth.startDeviceAuth(DESKTOP_CLIENT_ID)
    if (!result.data) throw unavailable(result)
    return result.data
  }

  async pollSignIn(deviceCode: string): Promise<DevicePoll> {
    const result = await this.auth.pollDeviceAuth(DESKTOP_CLIENT_ID, deviceCode)
    if (!result.data) throw unavailable(result)
    return result.data
  }

  async getAccessToken(sessionToken: string): Promise<AccessToken> {
    const result = await this.auth.getAccessToken(sessionToken)
    if (result.data) return result.data
    if (result.status === 401) throw new SessionExpiredError()
    throw unavailable(result)
  }

  /** A session the server no longer knows (401) is already signed out. */
  async signOut(sessionToken: string): Promise<void> {
    const result = await this.auth.signOutSession(sessionToken)
    if (result.data || result.status === 401) return
    throw unavailable(result)
  }

  async listFavorites(token: string): Promise<FavoriteEntry[]> {
    const result = await this.api.listFavorites(token)
    if (result.data) return result.data.favorites
    if (result.status === 401) throw new SessionExpiredError()
    throw unavailable(result)
  }

  async setFavorite(token: string, id: string, on: boolean): Promise<void> {
    const result = await this.api.setFavorite(token, id, on)
    if (result.data) return
    if (result.status === 401) throw new SessionExpiredError()
    if (result.status === 400) throw new FavoriteRejectedError(id, 'invalid', result.error)
    if (result.status === 404) throw new FavoriteRejectedError(id, 'notFound', result.error)
    if (result.status === 409) throw new FavoriteRejectedError(id, 'full', result.error)
    throw unavailable(result)
  }
}
