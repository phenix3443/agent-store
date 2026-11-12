import { expect, test } from 'bun:test'
import { desktopOsFromUserAgent } from '../desktop-os'

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
  ubuntu: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
}

test('desktop systems map to their download', () => {
  expect(desktopOsFromUserAgent(UA.mac)).toBe('mac')
  expect(desktopOsFromUserAgent(UA.macSafari)).toBe('mac')
  expect(desktopOsFromUserAgent(UA.win)).toBe('win')
  expect(desktopOsFromUserAgent(UA.linux)).toBe('linux')
  expect(desktopOsFromUserAgent(UA.ubuntu)).toBe('linux')
})

test('phones, ChromeOS and missing user agents get no recommendation', () => {
  expect(desktopOsFromUserAgent(UA.android)).toBeNull()
  expect(desktopOsFromUserAgent(UA.iphone)).toBeNull()
  expect(desktopOsFromUserAgent(UA.chromeos)).toBeNull()
  expect(desktopOsFromUserAgent('')).toBeNull()
  expect(desktopOsFromUserAgent(null)).toBeNull()
})
