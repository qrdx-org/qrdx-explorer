import { AddressRoute } from './AddressRoute'

// One prerendered page serves every address (next.config.mjs rewrites /address/:address to
// /address/_): the Worker renders nothing per request. The address comes from the URL in
// the browser (AddressRoute).
export const dynamicParams = false
export function generateStaticParams() {
  return [{ address: '_' }]
}

export default function AddressPage() {
  return <AddressRoute />
}
