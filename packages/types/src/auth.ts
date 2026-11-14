/** POST /api/auth/device/code (RFC 8628 §3.2): what the desktop shows and polls with. */
export interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  /** The store page that approves the code, with the code already filled in. */
  verificationUriComplete: string
  /** Seconds until the code expires. */
  expiresIn: number
  /** Seconds to wait between polls. */
  interval: number
}

/** One poll of POST /api/auth/device/token. `approved` carries the new session of this device. */
export type DevicePoll =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'approved'; sessionToken: string; expiresIn: number }

/** A short-lived API token minted from the desktop session. */
export interface AccessToken {
  token: string
  /** Unix seconds, from the token's `exp`; null when it has none. */
  expiresAt: number | null
}
