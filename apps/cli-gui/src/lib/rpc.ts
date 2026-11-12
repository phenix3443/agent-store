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
}

export class RpcError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'RpcError'
  }
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

type RpcEnvelope<T> = RpcSuccess<T> | RpcFailure

export async function callRpc<T>(method: string, args: unknown[] = []): Promise<T> {
  const command = Command.sidecar('binaries/aas', ['__rpc', method, JSON.stringify(args)])
  const output = await command.execute()

  let envelope: RpcEnvelope<T>
  try {
    envelope = JSON.parse(output.stdout) as RpcEnvelope<T>
  } catch {
    throw new Error(`Malformed RPC response for ${method}: ${output.stdout || output.stderr}`)
  }

  if (!envelope.ok) throw new RpcError(envelope.error, envelope.code)
  return envelope.data
}
