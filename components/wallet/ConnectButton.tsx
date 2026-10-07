'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, LogOut, Puzzle, Smartphone, UserRound, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ProfileAvatar } from '@/components/profile/ProfileBits'
import { useProfile } from '@/lib/profiles/client'
import { useWallet } from '@/lib/wallet/WalletContext'
import { formatAddress } from '@/lib/format'
import { cn } from '@/lib/utils'

export const WALLET_INSTALL_URL = 'https://wallet.qrdx.org'

/** The nav's wallet button: link the QRDX Wallet, then show the linked account and its profile. */
export function ConnectButton({ className }: { className?: string }) {
  const w = useWallet()
  const [dialog, setDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const pq = w.account?.pqAddress ?? null
  const profile = useProfile('account', pq)

  useEffect(() => {
    if (w.status === 'connected' && !w.pairing) setDialog(false)
  }, [w.status, w.pairing])

  if (w.status === 'detecting') {
    return (
      <Button size="sm" variant="outline" disabled className={cn('h-8', className)}>
        <Wallet className="h-4 w-4" />
      </Button>
    )
  }

  if (w.status !== 'connected' || !w.account || !pq) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setDialog(true)} className={cn('h-8', className)} data-testid="link-wallet">
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">{w.status === 'connecting' && !w.pairing ? 'Check your wallet…' : 'Link wallet'}</span>
        </Button>
        <ConnectDialog open={dialog} onOpenChange={setDialog} />
      </>
    )
  }

  const remote = w.connection === 'remote'
  const reachable = !remote || w.phone?.peerOnline
  const copy = (v: string) => {
    navigator.clipboard?.writeText(v)
    setCopied(v)
    setTimeout(() => setCopied(null), 1200)
  }
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} className={cn('h-8 gap-2 pl-1.5', className)} data-testid="wallet-menu">
        <ProfileAvatar address={pq} profile={profile} size={20} />
        <span className="max-w-[9rem] truncate text-xs">{profile?.profile.name ?? formatAddress(pq, 6, 4)}</span>
        <span className={cn('h-1.5 w-1.5 rounded-full', reachable ? 'bg-bid' : 'bg-muted-foreground')} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-popover p-3 text-sm shadow-lg">
            <div className="flex items-center gap-3">
              <ProfileAvatar address={pq} profile={profile} size={36} />
              <div className="min-w-0">
                <div className="truncate font-medium">{profile?.profile.name ?? 'Unclaimed account'}</div>
                <div className="text-xs text-muted-foreground">
                  {remote ? (
                    <>
                      QRDX Wallet on your phone · <span className={reachable ? 'text-bid' : 'text-warn'}>{reachable ? 'online' : 'app closed'}</span>
                    </>
                  ) : (
                    'QRDX Wallet extension'
                  )}
                  {w.chain ? ` · ${w.chain.name}` : ''}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {w.accounts.slice(0, 1).flatMap((a) => [
                { label: 'Post-quantum', value: a.pqAddress },
                { label: 'EVM', value: a.address },
              ]).map((r) => (
                <div key={r.value} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                  <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{r.label}</span>
                  <Link href={`/address/${r.value}`} onClick={() => setOpen(false)} className="min-w-0 flex-1 truncate font-mono text-xs text-primary hover:underline">
                    {formatAddress(r.value, 8, 6)}
                  </Link>
                  <button className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy address" onClick={() => copy(r.value)}>
                    {copied === r.value ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" asChild>
                <Link href={`/address/${pq}?profile=edit`} onClick={() => setOpen(false)}>
                  <UserRound className="h-3.5 w-3.5" /> {profile ? 'Edit profile' : 'Claim profile'}
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => (setOpen(false), void w.disconnect())}>
                <LogOut className="h-3.5 w-3.5" /> Unlink
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** The browser extension, or QRDX Wallet on a phone through a QR code (QRDX Connect over trade.qrdx.org's relay). */
export function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWallet()
  const close = (o: boolean) => {
    if (!o && w.pairing) w.cancelPairing()
    onOpenChange(o)
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{w.pairing ? 'Scan with QRDX Wallet' : 'Link your wallet'}</DialogTitle>
        {!w.pairing && (
          <DialogDescription>
            Linking shares your addresses with this site. The explorer never sends transactions: it only asks your wallet to sign a message when you claim a profile.
          </DialogDescription>
        )}
        <ConnectOptions />
      </DialogContent>
    </Dialog>
  )
}

/** The choices (or the QR code while pairing); used by the dialog and inline by the profile editor. */
export function ConnectOptions() {
  const w = useWallet()
  const [copied, setCopied] = useState(false)
  const phoneJoined = !!w.pairing && !!w.phone?.peerOnline
  if (w.pairing) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-lg bg-white p-3">
          <QRCodeSVG value={w.pairing} size={220} level="M" />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Open QRDX Wallet on your phone and choose <b>Connect to a site</b>, or scan with the camera.
        </p>
        <p className={cn('text-center text-sm', phoneJoined ? 'text-bid' : 'text-muted-foreground')} data-testid="pairing-status">
          {phoneJoined ? 'Phone connected: approve on your phone.' : 'Waiting for your phone…'}
        </p>
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            data-testid="pairing-link"
            data-link={w.pairing}
            onClick={() => {
              navigator.clipboard?.writeText(w.pairing!)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => w.cancelPairing()}>
            Cancel
          </Button>
        </div>
        <p className="text-center text-[10px] leading-snug text-muted-foreground">
          The code holds the key that encrypts this link. Anyone who scans it can ask your wallet to connect, so keep it to yourself; your wallet still
          asks before sharing anything or signing.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <Option icon={<Smartphone className="h-5 w-5" />} title="QRDX Wallet on your phone" detail="Scan a QR code with the app. You approve each signature there." onClick={() => void w.connectPhone()} testId="connect-phone" />
      {w.extension ? (
        <Option icon={<Puzzle className="h-5 w-5" />} title="QRDX Wallet extension" detail="In this browser." onClick={() => void w.connect()} testId="connect-extension" />
      ) : (
        <a href={WALLET_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="block">
          <Option icon={<Puzzle className="h-5 w-5" />} title="Get the browser extension" detail="QRDX Wallet for Chrome and Firefox." />
        </a>
      )}
      {w.status === 'connecting' && !w.pairing && <p className="text-xs text-muted-foreground">Approve the request in your wallet…</p>}
      {w.error && <p className="text-xs text-ask">{w.error}</p>}
    </div>
  )
}

function Option({ icon, title, detail, onClick, testId }: { icon: React.ReactNode; title: string; detail: string; onClick?: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent">
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}
