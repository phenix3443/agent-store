import { expect, mock, test } from 'bun:test'

const spawned: string[][] = []
mock.module('@tauri-apps/plugin-shell', () => ({
  Command: {
    sidecar: (_name: string, args: string[]) => ({
      spawn: async () => {
        spawned.push(args)
        return { pid: 1 }
      },
    }),
  },
}))

const { startLocalApi } = await import('../localApi')

test('starts the loopback endpoint once, with this build\'s store origin', async () => {
  await startLocalApi()
  await startLocalApi()
  expect(spawned).toEqual([['__local-api', 'https://agent-store-test.panghuli.tech']])
})
