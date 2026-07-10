// Shared Neon Auth (managed Better Auth) config for the server proxy + middleware.
// baseUrl is the project's Neon Auth endpoint; the cookie secret signs the
// same-domain session cookie so the browser talks to /api/auth/* (this app's
// origin) instead of the remote neonauth host cross-origin. Server-only env.
export const neonAuthConfig = {
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
}
