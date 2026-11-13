import { expect, test } from 'bun:test'
import { formatSize, parseRelease } from '../latest-release'

const asset = (name: string, size = 1) => ({ name, size, browser_download_url: `https://example.test/${name}` })

const v021 = {
  tag_name: 'v0.2.1',
  html_url: 'https://github.com/phenix3443/agent-store/releases/tag/v0.2.1',
  assets: [
    asset('Agent.Store.CLI-0.2.1-1.x86_64.rpm', 58571244),
    asset('Agent.Store.CLI_0.2.1_amd64.deb', 58562456),
    asset('Agent.Store.CLI_0.2.1_universal.dmg', 93368276),
    asset('Agent.Store.CLI_0.2.1_x64-setup.exe', 45092220),
    asset('Agent.Store.CLI_0.2.1_x64_en-US.msi', 59342848),
    asset('Agent.Store.CLI_universal.app.tar.gz', 93128459),
  ],
}

test('groups installers by OS in mac, win, linux order and skips the updater archive', () => {
  const release = parseRelease(v021)!
  expect(release.version).toBe('v0.2.1')
  expect(release.url).toBe(v021.html_url)
  expect(release.platforms.map((p) => [p.os, p.files.map((f) => f.kind)])).toEqual([
    ['mac', ['dmg']],
    ['win', ['exe', 'msi']],
    ['linux', ['deb', 'rpm']],
  ])
  expect(release.platforms.flatMap((p) => p.files).some((f) => f.name.endsWith('.tar.gz'))).toBe(false)
})

test('recommends the file /download/<target> resolves to: .dmg and -setup.exe, no Linux package', () => {
  const files = parseRelease(v021)!.platforms.flatMap((p) => p.files)
  expect(files.filter((f) => f.recommended).map((f) => f.kind)).toEqual(['dmg', 'exe'])
})

test('carries name, size and download url through', () => {
  const dmg = parseRelease(v021)!.platforms[0].files[0]
  expect(dmg).toMatchObject({
    name: 'Agent.Store.CLI_0.2.1_universal.dmg',
    size: 93368276,
    url: 'https://example.test/Agent.Store.CLI_0.2.1_universal.dmg',
  })
})

test('an OS without files is left out', () => {
  const release = parseRelease({ ...v021, assets: [asset('x_amd64.deb')] })!
  expect(release.platforms.map((p) => p.os)).toEqual(['linux'])
})

test('null when the response is not a release or has no installers', () => {
  expect(parseRelease(null)).toBeNull()
  expect(parseRelease({ message: 'API rate limit exceeded' })).toBeNull()
  expect(parseRelease({ tag_name: 'v1', assets: [asset('notes.txt')] })).toBeNull()
  expect(parseRelease({ tag_name: 'v1', assets: [{ name: 'a.dmg' }] })).toBeNull()
})

test('falls back to the latest-release page when html_url is missing', () => {
  expect(parseRelease({ tag_name: 'v1', assets: [asset('a.dmg')] })!.url).toContain('/releases/latest')
})

test('sizes are binary megabytes', () => {
  expect(formatSize(45092220)).toBe('43 MB')
  expect(formatSize(93368276)).toBe('89 MB')
  expect(formatSize(5 * 1024 * 1024 + 300_000)).toBe('5.3 MB')
})

test('lists the AppImage under Linux after deb and rpm, not as the recommended file', () => {
  const release = parseRelease({ ...v021, assets: [...v021.assets, asset('Agent.Store_0.2.2_amd64.AppImage', 61000000)] })!
  const linux = release.platforms.find((p) => p.os === 'linux')!
  expect(linux.files.map((f) => [f.kind, f.recommended])).toEqual([
    ['deb', false],
    ['rpm', false],
    ['appimage', false],
  ])
})

test('a release without an AppImage lists none', () => {
  const files = parseRelease(v021)!.platforms.flatMap((p) => p.files)
  expect(files.some((f) => f.kind === 'appimage')).toBe(false)
})
