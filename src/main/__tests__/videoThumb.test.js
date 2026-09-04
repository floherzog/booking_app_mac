import { describe, it, expect, vi } from 'vitest'

// Registering IPC handlers on import means electron has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp/booking-test' } }))

const { youtubeId, fetchVideoThumb } = await import('../ipc/templates.js')

describe('youtubeId', () => {
  it('reads the id out of every URL shape YouTube hands out', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?t=42`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `youtube.com/watch?v=${id}`,          // no scheme, as pasted
    ]) {
      expect(youtubeId(url), url).toBe(id)
    }
  })

  it('rejects other hosts and malformed input', () => {
    expect(youtubeId('https://vimeo.com/12345')).toBeNull()
    expect(youtubeId('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('https://www.youtube.com/')).toBeNull()
    expect(youtubeId('https://www.youtube.com/watch?v=tooshort')).toBeNull()
    expect(youtubeId('not a url')).toBeNull()
    expect(youtubeId('')).toBeNull()
    expect(youtubeId(null)).toBeNull()
  })
})

describe('fetchVideoThumb', () => {
  it('refuses a non-YouTube link with a message the editor can show', async () => {
    await expect(fetchVideoThumb('https://vimeo.com/12345')).rejects.toThrow(/only youtube/i)
  })

  it('says so plainly when no thumbnail can be downloaded', async () => {
    const failing = async () => ({ ok: false, status: 404, json: async () => ({}) })
    await expect(fetchVideoThumb('https://youtu.be/dQw4w9WgXcQ', failing))
      .rejects.toThrow(/could not download/i)
  })

  it('returns the bytes and the title without writing anything to disk', async () => {
    const bytes = Uint8Array.from([1, 2, 3])
    const fetchImpl = async url => (
      url.includes('oembed')
        ? { ok: true, json: async () => ({ title: 'Live at Somewhere' }) }
        : { ok: true, arrayBuffer: async () => bytes.buffer }
    )
    const out = await fetchVideoThumb('https://youtu.be/dQw4w9WgXcQ', fetchImpl)
    expect(out.title).toBe('Live at Somewhere')
    expect(out.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(Array.from(out.data)).toEqual([1, 2, 3])
    // No assetId: the renderer may still draw a play badge, and saving here too
    // would leave an orphan in the asset store.
    expect(out.assetId).toBeUndefined()
  })

  it('still returns the image when the title lookup fails', async () => {
    const fetchImpl = async url => {
      if (url.includes('oembed')) throw new Error('offline')
      return { ok: true, arrayBuffer: async () => Uint8Array.from([9]).buffer }
    }
    const out = await fetchVideoThumb('https://youtu.be/dQw4w9WgXcQ', fetchImpl)
    expect(out.title).toBe('')
    expect(Array.from(out.data)).toEqual([9])
  })

  it('falls back to hqdefault when maxresdefault is missing', async () => {
    const tried = []
    const fetchImpl = async url => {
      if (url.includes('oembed')) return { ok: true, json: async () => ({}) }
      tried.push(url)
      if (url.includes('maxresdefault')) return { ok: false, status: 404 }
      return { ok: true, arrayBuffer: async () => Uint8Array.from([7]).buffer }
    }
    const out = await fetchVideoThumb('https://youtu.be/dQw4w9WgXcQ', fetchImpl)
    expect(tried.some(u => u.includes('maxresdefault'))).toBe(true)
    expect(Array.from(out.data)).toEqual([7])
  })
})
