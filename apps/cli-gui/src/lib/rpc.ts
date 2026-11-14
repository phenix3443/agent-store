import { Command } from '@tauri-apps/plugin-shell'

interface RpcSuccess<T> {
  ok: true
  data: T
}

interface RpcFailure {
  ok: false
  error: string
  /** The engine's error class name, e.g. McpChangedOutsideError. */
  code?: string
  reason?: string
  tool?: string
  target?: string
}

export interface RpcErrorFields {
  reason?: string
  tool?: string
  target?: string
}

export class RpcError extends Error {
  constructor(message: string, readonly code?: string, readonly fields: RpcErrorFields = {}) {
    super(message)
    this.name = 'RpcError'
  }
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

type RpcEnvelope<T> = RpcSuccess<T> | RpcFailure

interface SidecarOutput {
  stdout: string
  stderr: string
}

// The arguments carry secret values (project keys, MCP config, provider API keys), so they go
// through stdin, never argv where other local users can read them with `ps`. The shell plugin
// cannot close a child's stdin: the sidecar reads one line, so the payload must end in a newline.
function runSidecar(argv: string[], input: string): Promise<SidecarOutput> {
  const command = Command.sidecar('binaries/aas', argv)
  const stdout: string[] = []
  const stderr: string[] = []
  command.stdout.on('data', line => stdout.push(line))
  command.stderr.on('data', line => stderr.push(line))
  return new Promise((resolve, reject) => {
    command.on('error', err => reject(new Error(err)))
    command.on('close', () => resolve({ stdout: stdout.join('\n'), stderr: stderr.join('\n') }))
    command.spawn().then(child => child.write(input)).catch(reject)
  })
}

export async function callRpc<T>(method: string, args: unknown[] = []): Promise<T> {
  const output = await runSidecar(['__rpc', method, '-'], `${JSON.stringify(args)}\n`)

  let envelope: RpcEnvelope<T>
  try {
    envelope = JSON.parse(output.stdout) as RpcEnvelope<T>
  } catch {
    throw new Error(`Malformed RPC response for ${method}: ${output.stdout || output.stderr}`)
  }

  if (!envelope.ok) {
    const { reason, tool, target } = envelope
    throw new RpcError(envelope.error, envelope.code, { reason, tool, target })
  }
  return envelope.data
}
