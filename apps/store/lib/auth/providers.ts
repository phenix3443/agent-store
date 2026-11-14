export type LoginProvider = 'github' | 'google'

// Must match socialProviders in ./server.ts: Google is registered only when GOOGLE_CLIENT_ID is set.
export function enabledLoginProviders(): LoginProvider[] {
  return process.env.GOOGLE_CLIENT_ID ? ['github', 'google'] : ['github']
}
