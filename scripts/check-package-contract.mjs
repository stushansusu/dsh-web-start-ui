#!/usr/bin/env node
/**
 * Package contract guard - the few promises the Workshop install depends on.
 *
 * The Workshop installs a registered entry that carries no `npm` field by
 * running `dsh plugin --profile <profile> add <repo-url>`, so pnpm fetches this
 * repository from git and packages it ON THE USER'S MACHINE. Three consequences,
 * each of which has already bitten this package once:
 *
 *  1. No lifecycle build script may exist. pnpm runs `prepare` for a git-hosted
 *     package (and npm also runs `install`/`postinstall`); on 2026-10-11 that
 *     made every Workshop install fail with ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED
 *     and then, once allowed, with a missing shared/tsdown.client.ts - this
 *     package's build only exists inside the dsh-web monorepo. lib/ is committed
 *     instead, so there is nothing to build at install time.
 *  2. Every path the manifest declares must exist in git. The `types` targets
 *     under lib/types were declared for a release that never committed them, so
 *     a consumer asking for types got nothing.
 *  3. The shipped bytes are the committed ones, so the client bundle must still
 *     be the loader handoff for THIS package id.
 *
 * Usage: node scripts/check-package-contract.mjs   (CI gate)
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const failures = []

/** A git-hosted dependency must not need to run anything to become usable. */
const INSTALL_SCRIPTS = ['prepare', 'preinstall', 'install', 'postinstall']
for (const name of INSTALL_SCRIPTS) {
  if (manifest.scripts?.[name] !== undefined) {
    failures.push(
      `scripts.${name} is set to "${manifest.scripts[name]}" - a git install would run it on the `
      + 'user\'s machine. The Workshop install must need no build; delete it and commit lib/ instead.',
    )
  }
}

/** Everything the shipped package needs at runtime, checked against `files`. */
const SHIPPED = ['lib', 'assets', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'README.i18n.yaml', 'icon.svg']
const listed = new Set(manifest.files ?? [])
for (const entry of SHIPPED) {
  if (!listed.has(entry)) failures.push(`files is missing "${entry}" - it would not be shipped.`)
}

/** Every literal path the manifest points at. */
const declared = [
  ['main', manifest.main],
  ['icon', manifest.icon],
  ['dsh.bundle.patch', manifest.dsh?.bundle?.patch],
]
for (const [condition, target] of Object.entries(manifest.exports ?? {})) {
  if (typeof target === 'string') {
    declared.push([`exports["${condition}"]`, target])
    continue
  }
  for (const [face, value] of Object.entries(target ?? {})) {
    declared.push([`exports["${condition}"].${face}`, value])
  }
}
for (const [label, target] of declared) {
  if (typeof target !== 'string' || target.includes('*')) continue
  if (!existsSync(join(ROOT, target))) failures.push(`${label} points at ${target}, which is not in the repository.`)
}

/** The two halves the loader actually imports, plus the client handoff id. */
const INDEX = join(ROOT, 'lib', 'index.js')
const CLIENT = join(ROOT, 'lib', 'client.js')
for (const [label, file] of [['lib/index.js', INDEX], ['lib/client.js', CLIENT]]) {
  if (!existsSync(file)) failures.push(`${label} is missing - the loader has nothing to import.`)
  else if (statSync(file).size === 0) failures.push(`${label} is empty.`)
}
if (existsSync(CLIENT)) {
  const head = readFileSync(CLIENT, 'utf8').slice(0, 400)
  const id = JSON.stringify(manifest.name)
  if (!head.includes('__ModuleLoader__.load') || !head.includes(`id: ${id}`)) {
    failures.push(`lib/client.js does not hand off module id ${id} to __ModuleLoader__ - rebuild it.`)
  }
}
if (manifest.dsh?.client?.platform !== 'web') {
  failures.push('dsh.client.platform must be "web" - the browser half has no other host.')
}

if (failures.length > 0) {
  console.error('check-package-contract: the git-install contract is broken:')
  for (const line of failures) console.error('  - ' + line)
  process.exit(1)
}
console.log('check-package-contract: OK (no install-time build, declared paths exist, client handoff intact)')
