import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Wordmark } from './chrome/Logo'

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Explore',
    links: [
      { label: 'Blocks', href: '/blocks' },
      { label: 'Transactions', href: '/transactions' },
      { label: 'Tokens', href: '/tokens' },
      { label: 'Validators', href: '/validators' },
      { label: 'Network', href: '/network' },
    ],
  },
  {
    title: 'QRDX',
    links: [
      { label: 'Trade', href: 'https://trade.qrdx.org' },
      { label: 'Wallet', href: 'https://wallet.qrdx.org' },
      { label: 'qrdx.org', href: 'https://qrdx.org' },
      { label: 'Whitepaper', href: 'https://qrdx.org/whitepaper' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Node API', href: 'https://github.com/qrdx-org/qrdx-node' },
      { label: 'Explorer source', href: 'https://github.com/qrdx-org/qrdx-explorer' },
      { label: 'Trade API', href: 'https://github.com/qrdx-org/qrdx-trade/blob/main/docs/API.md' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub', href: 'https://github.com/qrdx-org' },
      { label: 'X / Twitter', href: 'https://twitter.com/qrdx' },
      { label: 'Discord', href: 'https://discord.gg/qrdx' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Blocks, transactions, tokens and markets of the QRDX chain, read live from its nodes.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Post-quantum signatures (ML-DSA-65)
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith('/') ? (
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} QRDX Foundation</span>
          <span>Chain data comes from the selected node; USD prices are reference data from trade.qrdx.org.</span>
        </div>
      </div>
    </footer>
  )
}
