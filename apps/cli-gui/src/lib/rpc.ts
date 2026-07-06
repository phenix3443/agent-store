import { Command } from '@tauri-apps/plugin-shell'

interface RpcSuccess<T> {
  ok: true
  data: T
}

interface RpcFailure {
  ok: false
  error: string
}

type RpcEnvelope<T> = RpcSuccess<T> | RpcFailure

export async function callRpc<T>(method: string, args: unknown[] = []): Promise<T> {
  const command = Command.sidecar('binaries/as', ['__rpc', method, JSON.stringify(args)])
  const output = await command.execute()

  let envelope: RpcEnvelope<T>
  try {
    envelope = JSON.parse(output.stdout) as RpcEnvelope<T>
  } catch {
    throw new Error(`Malformed RPC response for ${method}: ${output.stdout || output.stderr}`)
  }

  if (!envelope.ok) throw new Error(envelope.error)
  return envelope.data
}
