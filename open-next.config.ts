import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

/**
 * Every page is prerendered at build time: the explorer reads chain data in the browser, and
 * addresses, blocks and transactions are one shell page each (next.config.mjs rewrites). So
 * prerendered pages are served from the Worker's static assets (read-only; nothing revalidates),
 * and cache interception answers them before the Next server is loaded. Rendering them per
 * request cost the Worker up to 13 ms of CPU, over Cloudflare's 10 ms limit (error 1102).
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})
