import { test, expect } from 'bun:test'
import { classifyGitFailure, GitError, runGit } from '../git'

test('remote failures are told apart from what git and ssh print', () => {
  expect(classifyGitFailure("remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/me/b.git/'")).toBe('auth-failed')
  expect(classifyGitFailure("fatal: could not read Username for 'https://github.com': terminal prompts disabled")).toBe('auth-failed')
  expect(classifyGitFailure('git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.')).toBe('auth-failed')
  expect(classifyGitFailure("fatal: unable to access 'https://example.com/b.git/': The requested URL returned error: 403")).toBe('auth-failed')
  expect(classifyGitFailure('Host key verification failed.\nfatal: Could not read from remote repository.')).toBe('host-key')
  expect(classifyGitFailure("remote: Repository not found.\nfatal: repository 'https://github.com/me/nope.git/' not found")).toBe('not-found')
  expect(classifyGitFailure("fatal: '/tmp/nope.git' does not appear to be a git repository")).toBe('not-found')
  expect(classifyGitFailure("fatal: unable to access 'https://nohost.invalid/b.git/': Could not resolve host: nohost.invalid")).toBe('network')
  expect(classifyGitFailure('ssh: connect to host example.com port 22: Connection timed out')).toBe('network')
  expect(classifyGitFailure('fatal: bad object HEAD')).toBeUndefined()
})

test('a GitError carries the classified reason', async () => {
  const err = await runGit(null, ['ls-remote', '/nonexistent/agent-store-backup.git']).catch(e => e)
  expect(err).toBeInstanceOf(GitError)
  expect((err as GitError).reason).toBe('not-found')
})
