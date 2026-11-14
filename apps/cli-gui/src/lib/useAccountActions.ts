import { useState } from 'react'
import { useAuth, type AuthProviderName } from '../state/Auth'
import { callRpc } from './rpc'
import { openExternal } from './openExternal'

/** Sign-in, sign-out and upgrade with one busy flag, shared by the account menu and the settings page. */
export function useAccountActions() {
  const { getAccessToken, signIn, signOut } = useAuth()
  const [busy, setBusy] = useState(false)

  async function run(label: string, fn: () => Promise<void>): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    try {
      await fn()
      return true
    } catch (err) {
      console.error(`[${label}] failed:`, err)
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    // The sign-in dialog shows the rest; the menus stay usable while the browser is open.
    signIn: (provider: AuthProviderName) => {
      void signIn(provider)
      return Promise.resolve(true)
    },
    signOut: () => run('auth', () => signOut()),
    upgrade: () =>
      run('billing', async () => {
        const token = await getAccessToken()
        const { checkoutUrl } = await callRpc<{ checkoutUrl: string }>('createCheckout', ['monthly', token ?? undefined])
        await openExternal(checkoutUrl)
      }),
  }
}
