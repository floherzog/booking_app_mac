// electron-builder afterPack hook.
//
// `npm run dist` sets CSC_IDENTITY_AUTO_DISCOVERY=false, so electron-builder
// leaves the .app with no signature at all. macOS treats a completely unsigned
// app that carries a com.apple.quarantine flag (which every download gets) as
// *damaged* and refuses to open it, with no override in the UI — which is
// exactly the error a shared build produced. An ad-hoc signature ("-") is enough
// for Gatekeeper to fall back to the normal "unidentified developer" prompt that
// the recipient can allow.
//
// This is not a substitute for notarization: `npm run dist:signed` still does
// the real thing, and this hook stands aside for it.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const { existsSync } = require('node:fs')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  // dist:signed → electron-builder signs properly right after this hook; adding
  // an ad-hoc signature first would only be thrown away.
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false' || process.env.CSC_LINK) {
    console.log('  • adhoc-sign      skipped (a real signing identity is in play)')
    return
  }

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) throw new Error(`adhoc-sign: no app at ${appPath}`)

  const entitlements = join(__dirname, '..', 'resources', 'entitlements.mac.plist')

  // This repo lives in iCloud Drive, which decorates files with extended
  // attributes. codesign refuses to sign a bundle carrying them
  // ("resource fork, Finder information, or similar detritus not allowed"), so
  // strip them first.
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' })

  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign', '-',
    // Keep the hardened runtime and the Apple Events entitlement the Mail
    // automation fallback needs; without these the prompt never appears.
    '--options', 'runtime',
    '--entitlements', entitlements,
    '--timestamp=none',        // ad-hoc signatures cannot be timestamped
    appPath,
  ], { stdio: 'inherit' })

  // Fail the build rather than ship something that will be called damaged.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • adhoc-sign      ad-hoc signature applied to ${appPath}`)
}
