import { app } from './app'

const port = Number(process.env['PORT'] ?? '3001')
// `::` accepts IPv4 and IPv6; the k3s cluster is IPv6-only, where Bun's default
// 0.0.0.0 would leave the pod unreachable.
const hostname = process.env['HOST'] ?? '::'

Bun.serve({ port, hostname, fetch: app.fetch })

// eslint-disable-next-line no-console
console.log(JSON.stringify({ level: 'info', message: 'as-api listening', hostname, port }))
