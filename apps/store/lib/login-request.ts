'use client'

const EVENT = 'as:login'

export interface LoginRequest {
  /** The page to come back to after signing in. */
  next?: string
  /** Shown in place of the dialog's default line. */
  body?: string
}

/** Opens the header's log-in dialog from anywhere on the page. */
export function requestLogin(request: LoginRequest = {}): void {
  window.dispatchEvent(new CustomEvent<LoginRequest>(EVENT, { detail: request }))
}

export function onLoginRequest(handler: (request: LoginRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<LoginRequest>).detail ?? {})
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
