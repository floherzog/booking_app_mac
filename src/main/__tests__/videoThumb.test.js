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
})
