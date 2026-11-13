import path from 'node:path'
import { fileURLToPath } from 'node:url'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server for the container image (see apps/store/Dockerfile).
  output: 'standalone',
  // Trace workspace packages (@as/sdk, @as/types) from the monorepo root.
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  webpack(config, { isServer, nextRuntime }) {
    // webpack 5 in Next 15 does not list node:sqlite among Node's builtins.
    if (isServer && nextRuntime === 'nodejs') config.externals.push({ 'node:sqlite': 'commonjs node:sqlite' })
    return config
  },
  async redirects() {
    // Topics and the collections page they replaced were removed in #101.
    return ['/collections', '/topics', '/topics/:path*'].map((source) => ({
      source,
      destination: '/store',
      permanent: true,
    }))
  },
}

export { nextConfig }
export default withNextIntl(nextConfig)
