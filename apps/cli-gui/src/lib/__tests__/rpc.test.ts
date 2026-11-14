import { test, expect, mock, spyOn, afterEach } from 'bun:test'
import { Command } from '@tauri-apps/plugin-shell'

afterEach(() => { mock.restore() })

type Listener = (arg: never) => void

class Emitter {
  private listeners: Record<string, Listener[]> = {}
  on(event: string, fn: Listener) { (this.listeners[event] ??= []).push(fn); return this }
  emit(event: string, arg: unknown) { for (const fn of this.listeners[event] ?? []) (fn as (a: unknown) => void)(arg) }
}

interface Spawned { argv: string[]; stdin: string[] }

function mockSidecar(stdout: string, code = 0): Spawned[] {
  const spawned: Spawned[] = []
  spyOn(Command, 'sidecar').mockImplementation(((_bin: string, argv: string[]) => {
    const record: Spawned = { argv, stdin: [] }
    spawned.push(record)
    const command = Object.assign(new Emitter(), { stdout: new Emitter(), stderr: new Emitter() })
    return Object.assign(command, {
      spawn: async () => ({
        pid: 1,
        write: async (data: string) => {
          record.stdin.push(data)
          queueMicrotask(() => {
            for (const line of stdout.split('\n')) command.stdout.emit('data', line)
            command.emit('close', { code, signal: null })
          })
        },
      }),
    })
  }) as unknown as typeof Command.sidecar)
  return spawned
}

test('callRpc resolves data on ok:true', async () => {
  mockSidecar(JSON.stringify({ ok: true, data: { slug: 'openai-provider' } }))
  const { callRpc } = await import('../rpc')
  const result = await callRpc<{ slug: string }>('install', ['openai-provider'])
  expect(result.slug).toBe('openai-provider')
})

test('callRpc rejects with the sidecar error message on ok:false', async () => {
  mockSidecar(JSON.stringify({ ok: false, error: 'Item not installed: foo' }))
  const { callRpc } = await import('../rpc')
  await expect(callRpc('info', ['foo'])).rejects.toThrow('Item not installed: foo')
})

test('callRpc rejects when sidecar stdout is not valid JSON', async () => {
  mockSidecar('not json')
  const { callRpc } = await import('../rpc')
  await expect(callRpc('list')).rejects.toThrow()
})

test('callRpc defaults args to an empty array', async () => {
  const spawned = mockSidecar(JSON.stringify({ ok: true, data: [] }))
  const { callRpc } = await import('../rpc')
  await callRpc('list')
  expect(spawned[0].stdin).toEqual(['[]\n'])
})

test('callRpc keeps secret values out of the sidecar argv and sends them on stdin', async () => {
  const secrets = ['sk-project-secret', 'mcp-token-secret', 'sk-provider-secret']
  const calls: [string, unknown[]][] = [
    ['setProjectEnv', ['/home/u/app', 'API_KEY', secrets[0]]],
    ['setConfig', ['some-mcp', { headers: { Authorization: `Bearer ${secrets[1]}` } }]],
    ['setConfig', ['openrouter', { apiKey: secrets[2] }]],
  ]
  const spawned = mockSidecar(JSON.stringify({ ok: true, data: null }))
  const { callRpc } = await import('../rpc')
  for (const [method, args] of calls) await callRpc(method, args)

  expect(spawned.map(s => s.argv)).toEqual(calls.map(([method]) => ['__rpc', method, '-']))
  for (const secret of secrets) {
    expect(spawned.some(s => s.argv.join(' ').includes(secret))).toBe(false)
  }
  spawned.forEach((s, i) => {
    expect(s.stdin).toHaveLength(1)
    expect(s.stdin[0].endsWith('\n')).toBe(true)
    expect(JSON.parse(s.stdin[0])).toEqual(calls[i][1])
  })
})

test('callRpc joins a response the plugin delivers in several lines', async () => {
  mockSidecar(JSON.stringify({ ok: true, data: { note: 'a' } }, null, 2))
  const { callRpc } = await import('../rpc')
  expect(await callRpc<{ note: string }>('info', ['x'])).toEqual({ note: 'a' })
})

test('callRpc rejects with the engine error class as code', async () => {
  mockSidecar(JSON.stringify({ ok: false, error: 'changed outside', code: 'McpChangedOutsideError' }))
  const { callRpc, RpcError } = await import('../rpc')
  const err = (await callRpc('uninstall', ['x']).catch((e: unknown) => e)) as InstanceType<typeof RpcError>
  expect(err).toBeInstanceOf(RpcError)
  expect(err.code).toBe('McpChangedOutsideError')
  expect(err.message).toBe('changed outside')
})

test('watchers see each call start and end, failures included', async () => {
  mockSidecar(JSON.stringify({ ok: false, error: 'boom' }))
  const { callRpc, watchRpc } = await import('../rpc')
  const seen: string[] = []
  const stop = watchRpc((method, phase) => seen.push(`${method}:${phase}`))
  await callRpc('enable', ['x', 'claude']).catch(() => undefined)
  stop()
  await callRpc('enable', ['x', 'claude']).catch(() => undefined)
  expect(seen).toEqual(['enable:start', 'enable:end'])
})
