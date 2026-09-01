import { ipcMain } from 'electron'
import { getSecret } from '../secrets.js'

// Port of the webapp's fetchCsv.js / pushCsv.js, moved into main so the token
// never reaches the renderer. The GitHub adapter keeps a user's own instance in
// sync with the webapp and the OpenClaw scripts.
const API = 'https://api.github.com'

function requireToken() {
  const token = getSecret('githubToken')
  if (!token) throw new Error('No GitHub token stored. Add one in Settings → Storage.')
  return token
}

function contentsUrl(repo, path) {
  return `${API}/repos/${repo}/contents/${path}`
}

export function registerGithubIpc() {
  // → { text, sha }. The sha is the conflict-guard token for the push.
  ipcMain.handle('github:fetchCsv', async (_e, { repo, path }) => {
    const token = requireToken()
    const res = await fetch(contentsUrl(repo, path), {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText)
      throw new Error(`GitHub API ${res.status}: ${msg}`)
    }
    const body = await res.json()
    const text = Buffer.from(body.content || '', 'base64').toString('utf8')
    return { text, sha: body.sha }
  })

  ipcMain.handle('github:pushCsv', async (_e, { repo, path, text, message, expectedSha }) => {
    const token = requireToken()
    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    }

    // Always re-read the sha; compare it with what the renderer loaded so a push
    // can't silently clobber an edit made elsewhere.
    const metaRes = await fetch(contentsUrl(repo, path), { headers, cache: 'no-store' })
    if (!metaRes.ok) throw new Error(`Could not fetch file metadata: ${metaRes.status}`)
    const { sha } = await metaRes.json()
    if (expectedSha && sha !== expectedSha) {
      // See storage.js: the marker lives in the message so it survives IPC.
      throw new Error('CSV_CONFLICT: the file changed on GitHub since it was loaded.')
    }

    const content = Buffer.from(text, 'utf8').toString('base64')
    const pushRes = await fetch(contentsUrl(repo, path), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message, content, sha }),
    })
    if (!pushRes.ok) {
      const body = await pushRes.json().catch(() => ({}))
      throw new Error(body.message || `Push failed: ${pushRes.status}`)
    }
    const body = await pushRes.json().catch(() => ({}))
    return { sha: body.content?.sha }
  })
}
