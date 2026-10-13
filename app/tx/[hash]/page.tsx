import { TransactionRoute } from './TransactionRoute'

// One prerendered page serves every transaction (next.config.mjs rewrites /tx/:hash to
// /tx/_): the Worker renders nothing per request. The hash comes from the URL in the
// browser (TransactionRoute).
export const dynamicParams = false
export function generateStaticParams() {
  return [{ hash: '_' }]
}

export default function TransactionPage() {
  return <TransactionRoute />
}
