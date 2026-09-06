// Remove the build artifacts from ~/Builds/booking_app_mac after a release has
// been published, so 100 MB+ of .dmg does not accumulate on disk — the release
// on GitHub is the copy that matters, and the app's own "Check for Updates…"
// downloads from there.
//
//   node scripts/clean-build.mjs [--dry-run] [dir]
//
// Deliberately conservative: it only ever deletes entries whose names match the
// patterns electron-builder itself produces, inside the build directory, and it
// LISTS anything else it found rather than touching it. Anything you put there
// yourself is left exactly where it is.
import { readdir, rm, rmdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const dir = args.find(a => !a.startsWith('--')) || join(homedir(), 'Builds', 'booking_app_mac')

// Exactly what `electron-builder --mac` writes, and nothing else.
const ARTIFACTS = [
  /^Booking-\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?-(arm64|x64|universal)\.(dmg|zip)(\.blockmap)?$/,
  /^Booking-\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?-mac\.zip(\.blockmap)?$/,
  /^mac(-arm64|-x64|-universal)?$/,           // the unpacked .app directories
  /^builder-(effective-config\.yaml|debug\.yml)$/,
  /^latest-mac\.yml$/,
  /^\.icon-(icns|set)$/,
  /^\.DS_Store$/,
]

const isArtifact = name => ARTIFACTS.some(re => re.test(name))

async function main() {
  if (!existsSync(dir)) {
    console.log(`nothing to clean — ${dir} does not exist`)
    return
  }

  const entries = await readdir(dir)
  const removable = entries.filter(isArtifact)
  const kept = entries.filter(e => !isArtifact(e))

  let bytes = 0
  for (const name of removable) {
    const path = join(dir, name)
    try {
      const s = await stat(path)
      if (s.isFile()) bytes += s.size
    } catch { /* vanished under us; nothing to account for */ }
    if (dryRun) {
      console.log(`would remove  ${name}`)
    } else {
      await rm(path, { recursive: true, force: true })
      console.log(`removed       ${name}`)
    }
  }

  for (const name of kept) console.log(`left alone    ${name}  (not a build artifact)`)

  if (removable.length && bytes) {
    console.log(`\n${dryRun ? 'would free' : 'freed'} ${(bytes / 1e6).toFixed(0)} MB`)
  } else if (!removable.length) {
    console.log('no build artifacts found')
  }

  // Only removes the directory when it is genuinely empty — rmdir refuses
  // otherwise, which is the safety property we want.
  if (!dryRun && kept.length === 0) {
    try {
      await rmdir(dir)
      console.log(`removed       ${dir}`)
    } catch { /* not empty after all — leave it */ }
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1 })
