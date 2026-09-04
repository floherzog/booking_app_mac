// Informational drift check between this app's src/core and the original
// webapp's src/lib. The two are separate copies until the monorepo merge (see
// README → "Where this is heading"), so a fix made on either side has to be
// ported by hand. This script makes that visible; it never fails a build.
//
//   node scripts/check-core-drift.mjs [path-to-webapp]
//
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'))
const WEBAPP = positional[0] || join(ROOT, '..', 'booking_app')
const LIB = join(WEBAPP, 'src', 'lib')
const CORE = join(ROOT, 'src', 'core')

// `expected` explains a divergence we introduced deliberately. A pair without
// one is supposed to stay identical, so any diff there is a genuine surprise.
const PAIRS = [
  { core: 'replyStatus.js', lib: 'replyStatus.js' },
  { core: 'bands.js', lib: 'bands.js' },
  { core: 'parseDate.js', lib: 'parseDate.js', expected: 'ISO-timestamp support added for the draft log' },
  { core: 'importMap.js', lib: 'importMap.js', expected: 'parse helpers moved from fetchCsv.js into csv.js' },
  { core: 'duplicates.js', lib: 'duplicates.js', expected: 'PHP settings.php sync and localStorage removed' },
  { core: 'classify.js', lib: 'classify.js', expected: 'rules refactor' },
  { core: 'nextBatch.js', lib: 'nextBatch.js', expected: 'rules refactor' },
  { core: 'dateColors.js', lib: 'dateColors.js', expected: 'rules refactor' },
  { core: 'constants.js', lib: 'constants.js', expected: 'rules refactor' },
  // csv.js is the webapp's fetchCsv.js and pushCsv.js welded together.
  { core: 'csv.js', lib: ['fetchCsv.js', 'pushCsv.js'], expected: 'composed from fetchCsv.js + pushCsv.js' },
]

// Mac-only modules with no webapp counterpart — nothing to compare against.
const MAC_ONLY = ['rules.js', 'logicTree.js', 'templates.js', 'emailHtml.js', 'htmlText.js', 'videoLink.js', 'venueTypes.js']

// Mechanical differences that carry no meaning: this repo writes explicit .js
// extensions on relative imports so src/core also loads in plain Node.
function normalize(source) {
  return source
    .replace(/from '(\.\/[A-Za-z0-9_]+)\.js'/g, "from '$1'")
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/gm, '')
    .trimEnd()
}

async function readNormalized(paths) {
  const parts = []
  for (const p of [paths].flat()) {
    if (!existsSync(p)) return null
    parts.push(await readFile(p, 'utf8'))
  }
  return normalize(parts.join('\n'))
}

async function diff(a, b, labelA, labelB) {
  // diff exits 1 when files differ, which is not an error here.
  try {
    await run('diff', ['-u', '--label', labelA, '--label', labelB, a, b])
    return ''
  } catch (e) {
    if (e.code === 1) return e.stdout
    throw e
  }
}

const GREEN = s => `\x1b[32m${s}\x1b[0m`
const YELLOW = s => `\x1b[33m${s}\x1b[0m`
const RED = s => `\x1b[31m${s}\x1b[0m`
const DIM = s => `\x1b[2m${s}\x1b[0m`

async function main() {
  if (!existsSync(LIB)) {
    console.log(`No webapp found at ${WEBAPP} — nothing to compare.`)
    console.log('Pass its path: node scripts/check-core-drift.mjs /path/to/booking_app')
    return
  }

  const showDiffs = !process.argv.includes('--quiet')
  const tmp = await mkdtemp(join(tmpdir(), 'core-drift-'))
  const unchanged = []
  const expected = []
  const unexplained = []
  const missing = []

  try {
    for (const pair of PAIRS) {
      const libPaths = [pair.lib].flat().map(f => join(LIB, f))
      const coreSource = await readNormalized(join(CORE, pair.core))
      const libSource = await readNormalized(libPaths)

      if (coreSource === null || libSource === null) {
        missing.push(pair.core)
        continue
      }

      if (coreSource === libSource) {
        unchanged.push(pair.core)
        continue
      }

      const aPath = join(tmp, `lib-${pair.core}`)
      const bPath = join(tmp, `core-${pair.core}`)
      await writeFile(aPath, `${libSource}\n`)
      await writeFile(bPath, `${coreSource}\n`)
      const text = await diff(aPath, bPath, `webapp/src/lib/${[pair.lib].flat().join(' + ')}`, `src/core/${pair.core}`)

      const entry = { ...pair, text }
      if (pair.expected) expected.push(entry)
      else unexplained.push(entry)
    }

    console.log(`Comparing src/core against ${WEBAPP}/src/lib\n`)

    for (const name of unchanged) console.log(`${GREEN('same')}       ${name}`)
    for (const e of expected) console.log(`${YELLOW('diverged')}   ${e.core}  ${DIM(`— expected: ${e.expected}`)}`)
    for (const e of unexplained) console.log(`${RED('UNEXPECTED')} ${e.core}`)
    for (const name of missing) console.log(`${DIM('skipped')}    ${name} (file missing on one side)`)
    for (const name of MAC_ONLY) console.log(`${DIM('mac-only')}   ${name} (no webapp counterpart)`)

    if (showDiffs) {
      for (const e of [...unexplained, ...expected]) {
        console.log(`\n${'─'.repeat(72)}`)
        console.log(e.expected ? `${e.core} — expected: ${e.expected}` : `${e.core} — UNEXPECTED drift`)
        console.log('─'.repeat(72))
        console.log(e.text.trimEnd())
      }
    }

    console.log(`\n${unchanged.length} identical · ${expected.length} diverged as expected · ${unexplained.length} unexpected`)
    if (unexplained.length) {
      console.log(RED('\nUnexpected drift: a change was made on one side and not the other.'))
      console.log('Port it deliberately, or add an `expected` note to scripts/check-core-drift.mjs.')
    }
    console.log(DIM('\nInformational only — this check never fails a build. Use --quiet for the summary alone.'))
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

// Always exit 0: this is an aid, not a gate.
main().catch(e => console.error(`check-core-drift failed: ${e.message}`))
