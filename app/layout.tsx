import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { StatusBar } from '@/components/chrome/StatusBar'
import { ChainProvider } from '@/components/explorer/ChainProvider'
import { WalletProvider } from '@/lib/wallet/WalletContext'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'QRDX Explorer - Quantum Resistant Blockchain Explorer',
  description: 'Explore the quantum-resistant blockchain. View transactions, blocks, addresses, and smart contracts on the QRDX network.',
  keywords: ['quantum resistant', 'blockchain explorer', 'QRDX', 'transactions', 'blocks', 'addresses', 'validators', 'post-quantum cryptography'],
  authors: [{ name: 'QRDX Foundation' }],
  creator: 'QRDX Foundation',
  publisher: 'QRDX Foundation',
  icons: {
    icon: '/logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://explorer.qrdx.org',
    title: 'QRDX Explorer - Quantum Resistant Blockchain Explorer',
    description: 'Explore the quantum-resistant blockchain. View transactions, blocks, addresses, and smart contracts.',
    siteName: 'QRDX Explorer',
    images: [
      {
        url: 'https://explorer.qrdx.org/logo.png',
        width: 1200,
        height: 630,
        alt: 'QRDX Explorer',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QRDX Explorer - Quantum Resistant Blockchain Explorer',
    description: 'Explore the quantum-resistant blockchain. View transactions, blocks, addresses, and smart contracts.',
    images: ['https://explorer.qrdx.org/logo.png'],
    creator: '@qrdx_org',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${inter.variable} ${mono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ChainProvider>
            <WalletProvider>
              <div className="flex min-h-screen flex-col bg-background">
                <Navigation />
                <main className="flex-1">{children}</main>
                <Footer />
                <StatusBar />
              </div>
            </WalletProvider>
          </ChainProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
