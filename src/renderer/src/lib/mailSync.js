// Bridge to the main process's IMAP scan. Only the four fields the matcher needs
// cross the boundary — sending 3000 full rows through structured clone to read
// three columns would be wasteful, and the sync has no business seeing notes.
export async function syncFromMail(rows) {
  const slim = rows.map(r => ({
    _idx: r._idx,
    Email: r['Email'] || '',
    'Last emailed': r['Last emailed'] || '',
    Status: r['Status'] || '',
  }))
  return window.bookingApi.syncMail(slim)
}

// Is any part of the mail sync actually turned on?
export function mailSyncEnabled(settings) {
  const sync = settings?.mail?.sync || {}
  return sync.lastEmailed === 'imap' || sync.replies === 'imap'
}
