import { BlockRoute } from './BlockRoute'

// One prerendered page serves every block (next.config.mjs rewrites /block/:number to
// /block/_): the Worker renders nothing per request. The block comes from the URL in the
// browser (BlockRoute).
export const dynamicParams = false
export function generateStaticParams() {
  return [{ number: '_' }]
}

export default function BlockPage() {
  return <BlockRoute />
}
