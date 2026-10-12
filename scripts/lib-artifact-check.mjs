#!/usr/bin/env node
/**
 * Committed lib/ artifact guard - a standalone port of dsh-web's
 * scripts/lib-artifact-check.mjs, which the satellite repositories carry for
 * their own packages.
 *
 * This package commits its build output: the Workshop installs it straight from
 * git with no build step (see scripts/check-package-contract.mjs), so a consumer
 * resolves exactly the committed bytes. Editing src/ without refreshing lib/
 * therefore ships the OLD behaviour under a new version, silently.
 *
 * Comparing the committed bytes against a fresh build is not available here: the
 * build needs the dsh-web monorepo layout (tsdown.config.ts imports
 * shared/tsdown.client.ts, and the preset turns repo-relative CSS-module paths
 * into class hashes). This check instead fingerprints the SOURCE INPUTS that the
 * committed lib/ was built from and fails when those inputs moved without the
 * fingerprint being refreshed.
 *
 * Usage:
 *   node scripts/lib-artifact-check.mjs           # check (CI gate)
 *   node scripts/lib-artifact-check.mjs --write   # after rebuilding lib/
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = join(ROOT, 'scripts', 'lib-artifact-fingerprints.json')
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name

/**
 * Whether one source path reaches a bundle. Test files never do, so editing them
 * must not demand a rebuild.
 * @param relPath - path relative to src/.
 * @returns true when the file is part of the bundled program.
 */
export function isBundledSource(relPath) {
  const posix = relPath.split(sep).join('/')
  if (/(^|\/)tests?\//.test(posix)) return false
  return !/\.(test|spec)\.[cm]?[jt]sx?$/.test(posix)
}

/**
 * Fingerprint a set of path/digest pairs. Order-independent, so directory-walk
 * order never matters.
 * @param entries - [path, sha256] pairs.
 * @returns the hex digest.
 */
export function fingerprintEntries(entries) {
  const hash = createHash('sha256')
  const sorted = [...entries].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
  for (const [rel, digest] of sorted) {
    hash.update(rel)
    hash.update('\0')
    hash.update(digest)
    hash.update('\n')
  }
  return hash.digest('hex')
}

/** Every bundled source file under src/, as sorted POSIX paths. */
function sourceFiles(dir) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const rel = relative(dir, full).split(sep).join('/')
      if (isBundledSource(rel)) out.push(rel)
    }
  }
  walk(dir)
  return out.sort()
}

/** Content digests for the bundled sources lib/ was built from. */
function sourceEntries() {
  const dir = join(ROOT, 'src')
  if (!existsSync(dir)) return []
  return sourceFiles(dir).map((rel) => [rel, createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex')])
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (isCli) {
  const fingerprint = fingerprintEntries(sourceEntries())
  if (process.argv.includes('--write')) {
    writeFileSync(MANIFEST, JSON.stringify({ [PACKAGE]: fingerprint }, null, 2) + '\n')
    console.log('lib-artifact-check: recorded ' + relative(ROOT, MANIFEST) + ' for ' + PACKAGE)
  } else {
    const recorded = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
    if (recorded[PACKAGE] === undefined) {
      console.error('lib-artifact-check: no recorded source fingerprint for ' + PACKAGE + '.')
      console.error('Run: node scripts/lib-artifact-check.mjs --write')
      process.exit(1)
    }
    if (recorded[PACKAGE] !== fingerprint) {
      console.error('lib-artifact-check: the committed lib/ was built from other sources.')
      console.error('')
      console.error('  src/ moved since the recorded build, so lib/ is stale. The build is not standalone:')
      console.error('  tsdown.config.ts imports shared/tsdown.client.ts from the dsh-web monorepo, so rebuild')
      console.error('  there (with this package at packages/dsh-web-start-ui), copy lib/ back, then run:')
      console.error('')
      console.error('    node scripts/lib-artifact-check.mjs --write')
      console.error('')
      console.error('  and commit the refreshed lib/ together with the fingerprint.')
      process.exit(1)
    }
    console.log('lib-artifact-check: OK (committed lib/ matches ' + PACKAGE + ' sources)')
  }
}
