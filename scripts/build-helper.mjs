// Compiles the Swift article helper into resources/helpers/bin/.
//
// FoundationModels is a Swift framework, so the only way to reach Apple's
// on-device model from Electron is a small native executable the main process
// spawns. This builds it as a universal binary: Apple Intelligence needs Apple
// Silicon, but the x64 app must still ship something that runs and reports
// "ineligible" rather than failing to launch.
//
// Requires the Xcode Command Line Tools. If swiftc is missing, this prints a
// warning and exits 0 — a build without the helper is fine, the feature simply
// reports itself unavailable.
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'resources/helpers/article-helper/main.swift')
const OUT_DIR = join(ROOT, 'resources/helpers/bin')
const OUT = join(OUT_DIR, 'article-helper')

// macOS 26 is where FoundationModels appears; older systems get the "unsupported"
// branch inside the helper rather than a link error.
const DEPLOYMENT = '26.0'

function have(tool) {
  try {
    execFileSync('xcrun', ['--find', tool], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function compile(arch, out) {
  execFileSync('xcrun', [
    'swiftc', '-O',
    '-target', `${arch}-apple-macos${DEPLOYMENT}`,
    '-o', out, SOURCE,
  ], { stdio: 'pipe' })
}

if (!existsSync(SOURCE)) {
  console.log('  • article-helper  no source found, skipping')
  process.exit(0)
}
if (!have('swiftc')) {
  console.log('  • article-helper  swiftc not found (install the Xcode Command Line Tools) — skipping')
  process.exit(0)
}

mkdirSync(OUT_DIR, { recursive: true })
const slices = []
try {
  for (const arch of ['arm64', 'x86_64']) {
    const slice = `${OUT}.${arch}`
    try {
      compile(arch, slice)
      slices.push(slice)
    } catch (e) {
      // One architecture failing is survivable; both failing is not.
      console.log(`  • article-helper  ${arch} slice failed: ${String(e.stderr || e).slice(0, 200)}`)
    }
  }

  if (slices.length === 0) {
    console.log('  • article-helper  could not compile for any architecture — skipping')
    process.exit(0)
  }

  if (slices.length === 1) {
    execFileSync('cp', [slices[0], OUT])
  } else {
    execFileSync('xcrun', ['lipo', '-create', ...slices, '-output', OUT], { stdio: 'pipe' })
  }
  console.log(`  • article-helper  built (${slices.length === 2 ? 'universal' : 'single-arch'})`)
} finally {
  for (const slice of slices) rmSync(slice, { force: true })
}
