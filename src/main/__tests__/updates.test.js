import { describe, it, expect, vi } from 'vitest'

// The module reaches for electron at import time, so it has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getVersion: () => '0.0.0' } }))

const { parseVersion, compareVersions, checkForUpdates, dmgForArch } = await import('../ipc/updates.js')

// A stand-in for fetch that never touches the network.
function jsonResponse(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

describe('parseVersion', () => {
  it('accepts a bare or v-prefixed version', () => {
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0])
    expect(parseVersion('v1.10.3')).toEqual([1, 10, 3])
    expect(parseVersion('V2')).toEqual([2, 0, 0])
    expect(parseVersion('1.4')).toEqual([1, 4, 0])
  })

  it('ignores a pre-release suffix', () => {
    expect(parseVersion('0.3.0-beta.1')).toEqual([0, 3, 0])
  })

  it('returns null for anything unrecognizable', () => {
    expect(parseVersion('release')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion(null)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    // The string comparison people reach for first gets this one wrong.
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.2.1')).toBeLessThan(0)
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0)
  })

  it('treats an unparseable side as "no news"', () => {
    expect(compareVersions('nightly', '0.1.0')).toBe(0)
  })
})

describe('checkForUpdates', () => {
  it('reports a newer release', async () => {
    const r = await checkForUpdates({
      currentVersion: '0.1.0',
      fetchImpl: jsonResponse(200, { tag_name: 'v0.2.0', html_url: 'https://example.com/r', body: 'notes' }),
    })
    expect(r).toMatchObject({ current: '0.1.0', latest: '0.2.0', newer: true, url: 'https://example.com/r' })
  })

  it('reports being up to date, and never treats an older tag as new', async () => {
    const same = await checkForUpdates({ currentVersion: '0.2.0', fetchImpl: jsonResponse(200, { tag_name: 'v0.2.0' }) })
    expect(same.newer).toBe(false)
    const older = await checkForUpdates({ currentVersion: '0.3.0', fetchImpl: jsonResponse(200, { tag_name: 'v0.2.0' }) })
    expect(older.newer).toBe(false)
  })

  it('explains a missing release, a rate limit and an offline machine', async () => {
    expect((await checkForUpdates({ fetchImpl: jsonResponse(404, {}) })).error).toMatch(/no release/i)
    expect((await checkForUpdates({ fetchImpl: jsonResponse(403, {}) })).error).toMatch(/rate limit/i)
    const offline = await checkForUpdates({ fetchImpl: async () => { throw new Error('ENOTFOUND') } })
    expect(offline.error).toMatch(/internet|github/i)
  })

  it('never throws on a nonsense tag', async () => {
    const r = await checkForUpdates({ currentVersion: '0.1.0', fetchImpl: jsonResponse(200, { tag_name: 'latest' }) })
    expect(r.error).toMatch(/version tag/i)
    expect(r.newer).toBeUndefined()
  })
})

describe('dmgForArch', () => {
  const assets = [
    { name: 'Booking-0.6.0-arm64.dmg', browser_download_url: 'https://dl/arm.dmg' },
    { name: 'Booking-0.6.0-arm64.zip', browser_download_url: 'https://dl/arm.zip' },
    { name: 'Booking-0.6.0-x64.dmg', browser_download_url: 'https://dl/intel.dmg' },
  ]

  it('picks the .dmg for this Mac’s architecture, never the zip', () => {
    expect(dmgForArch(assets, 'arm64')).toBe('https://dl/arm.dmg')
    expect(dmgForArch(assets, 'x64')).toBe('https://dl/intel.dmg')
  })

  it('is null when the release has no matching file', () => {
    expect(dmgForArch([assets[1]], 'arm64')).toBeNull()
    expect(dmgForArch(undefined, 'arm64')).toBeNull()
  })

  it('comes back from checkForUpdates as downloadUrl, next to the page url', async () => {
    const fetchImpl = async () => ({
      ok: true, status: 200,
      json: async () => ({ tag_name: 'v9.0.0', html_url: 'https://page', assets }),
    })
    const r = await checkForUpdates({ currentVersion: '0.6.0', fetchImpl, arch: 'x64' })
    expect(r.downloadUrl).toBe('https://dl/intel.dmg')
    expect(r.url).toBe('https://page')
  })
})
