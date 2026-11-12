import { readFile, writeFile, rm, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type { RelayProcessOps } from './commands/relay'

// Re-invokes this same CLI (whether running via `bun run src/index.ts` or as a
// `bun build --compile` binary) with a hidden `__relay-daemon` argument, so the
// spawned process resolves correctly in both forms. `import.meta.url`-based
// script paths don't survive `--compile` (the file isn't on disk in the
// bundled binary), so self-re-invocation via argv is the only form that works
// in both.
function selfInvocation(): string[] {
  const looksLikeScript = process.argv[1]?.endsWith('.ts') || process.argv[1]?.endsWith('.js')
  return looksLikeScript ? [process.execPath, process.argv[1] as string] : [process.execPath]
}

export function realRelayOps(): RelayProcessOps {
  const pidFile = join(process.env['AS_HOME'] ?? join(homedir(), '.agents'), 'relay.pid')
  return {
    spawnDetached: () => {
      const proc = Bun.spawn([...selfInvocation(), '__relay-daemon'], { stdio: ['ignore', 'ignore', 'ignore'] })
      proc.unref()
      return proc.pid
    },
    isRunning: (pid: number) => {
      try { process.kill(pid, 0); return true } catch { return false }
    },
    kill: (pid: number) => { try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ } },
    readPidFile: async () => {
      try { return Number((await readFile(pidFile, 'utf-8')).trim()) } catch { return null }
    },
    writePidFile: async (pid: number) => {
      await mkdir(dirname(pidFile), { recursive: true })
      await writeFile(pidFile, String(pid))
    },
    removePidFile: async () => { await rm(pidFile, { force: true }) },
  }
}
