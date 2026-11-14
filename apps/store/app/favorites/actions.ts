'use server'

import { headers } from 'next/headers'
import { StoreClient } from '@as/sdk'
import { auth } from '@/lib/auth/server'
import type { SaveOutcome } from '@/components/Favorites'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

// Minted in-process from the session cookie, like the dashboard's plan lookup.
async function token(): Promise<string | null> {
  try {
    const { token } = await auth().api.getToken({ headers: await headers() })
    return token || null
  } catch {
    return null
  }
}

/** Null when signed out or the API could not be asked. */
export async function favoriteIds(): Promise<string[] | null> {
  const jwt = await token()
  if (!jwt) return null
  const result = await new StoreClient(API_URL).listFavorites(jwt)
  return result.data ? result.data.favorites.map((f) => f.id) : null
}

// Server actions are public endpoints: the id is checked here, and again by the API.
export async function saveFavorite(id: string, on: boolean): Promise<SaveOutcome> {
  if (typeof id !== 'string' || id.length === 0 || id.length > 400 || typeof on !== 'boolean') return 'error'
  const jwt = await token()
  if (!jwt) return 'signedOut'
  const result = await new StoreClient(API_URL).setFavorite(jwt, id, on)
  if (result.data) return 'ok'
  if (result.status === 401) return 'signedOut'
  if (result.status === 409) return 'full'
  return 'error'
}
