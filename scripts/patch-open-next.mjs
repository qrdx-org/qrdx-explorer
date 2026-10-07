#!/usr/bin/env node
/**
 * Runs after `opennextjs-cloudflare build`, before deploy or preview.
 *
 * Next 16.4 reads the preview-mode secrets from `.next/server/preview-props.json`.
 * workerd cannot read files, so OpenNext inlines every manifest into the server
 * bundle's `loadManifest`; @opennextjs/cloudflare 1.20.9 does not know this one,
 * and every request then fails with
 * "Unexpected loadManifest(/.next/server/preview-props.json) call!".
 *
 * This adds the file to the bundle's `loadManifest` and checks the result. It does
 * nothing when the bundle already has it (a fixed OpenNext), and fails the deploy
 * when it cannot be added, rather than shipping a worker that cannot start.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('.open-next', 'server-functions', 'default')
const handlerPath = join(dir, 'handler.mjs')
const propsPath = join(dir, '.next', 'server', 'preview-props.json')
const CASE = 'endsWith("/server/preview-props.json")'

function fail(message) {
  console.error(`[patch-open-next] ${message}`)
  process.exit(1)
}

if (!existsSync(handlerPath)) fail(`${handlerPath} not found: run opennextjs-cloudflare build first`)
let code = readFileSync(handlerPath, 'utf8')

if (code.includes(CASE)) {
  console.log('[patch-open-next] preview-props.json already inlined')
  process.exit(0)
}
if (!existsSync(propsPath)) {
  // Next versions without the file never ask for it.
  if (!code.includes('preview-props.json')) process.exit(0)
  fail(`${propsPath} not found, but the server reads it`)
}

const props = JSON.stringify(JSON.parse(readFileSync(propsPath, 'utf8')))
const thrower = /throw new Error\(`Unexpected loadManifest\(\$\{([\w$]+)\}\) call!`\)/g
const matches = [...code.matchAll(thrower)]
if (!matches.length) fail("OpenNext's loadManifest was not found in the bundle; check this script against the installed @opennextjs/cloudflare")

code = code.replace(thrower, (whole, path) => `if(${path}.${CASE})return ${props};${whole}`)
writeFileSync(handlerPath, code)
if (!readFileSync(handlerPath, 'utf8').includes(CASE)) fail('patch did not apply')
console.log(`[patch-open-next] inlined preview-props.json into loadManifest (${matches.length}×)`)
