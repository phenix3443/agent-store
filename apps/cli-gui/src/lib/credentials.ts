import { invoke } from '@tauri-apps/api/core'

/** Entries the Rust side accepts (src-tauri/src/credentials.rs); stored in the OS credential store. */
export type CredentialAccount = 'store-session' | 'store-session-revoke'

export type CredentialRead = { status: 'found'; secret: string } | { status: 'missing' } | { status: 'unavailable'; detail: string }
export type CredentialWrite = { status: 'done' } | { status: 'unavailable'; detail: string }

export function readCredential(account: CredentialAccount): Promise<CredentialRead> {
  return invoke<CredentialRead>('credential_get', { account })
}

export function writeCredential(account: CredentialAccount, secret: string): Promise<CredentialWrite> {
  return invoke<CredentialWrite>('credential_set', { account, secret })
}

export function deleteCredential(account: CredentialAccount): Promise<CredentialWrite> {
  return invoke<CredentialWrite>('credential_delete', { account })
}
