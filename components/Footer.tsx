import Link from 'next/link'
import { Github, Twitter, FileText } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="font-bold mb-4">QRDX Explorer</h3>
            <p className="text-sm text-muted-foreground">
              Quantum-resistant blockchain explorer for the QRDX network.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-bold mb-4">Explore</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/blocks" className="text-muted-foreground hover:text-primary">
                  Blocks
                </Link>
              </li>
              <li>
                <Link href="/transactions" className="text-muted-foreground hover:text-primary">
                  Transactions
                </Link>
              </li>
              <li>
                <Link href="/addresses" className="text-muted-foreground hover:text-primary">
                  Addresses
                </Link>
              </li>
              <li>
                <Link href="/contracts" className="text-muted-foreground hover:text-primary">
                  Smart Contracts
                </Link>
              </li>
            </ul>
          </div>

          {/* QRDX Ecosystem */}
          <div>
            <h3 className="font-bold mb-4">QRDX Ecosystem</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://qrdx.org" className="text-muted-foreground hover:text-primary" target="_blank" rel="noopener noreferrer">
                  Main Website
                </a>
              </li>
              <li>
                <a href="https://trade.qrdx.org" className="text-muted-foreground hover:text-primary" target="_blank" rel="noopener noreferrer">
                  Trade
                </a>
              </li>
              <li>
                <a href="https://qrdx.org/whitepaper" className="text-muted-foreground hover:text-primary" target="_blank" rel="noopener noreferrer">
                  Whitepaper
                </a>
              </li>
              <li>
                <a href="https://docs.qrdx.org" className="text-muted-foreground hover:text-primary" target="_blank" rel="noopener noreferrer">
                  Documentation
                </a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="font-bold mb-4">Community</h3>
            <div className="flex space-x-4">
              <a
                href="https://github.com/qrdx-org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com/qrdx_org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://qrdx.org/whitepaper"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary"
              >
                <FileText className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} QRDX Foundation. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
