'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConnectOptions } from '@/components/wallet/ConnectButton'
import { ProfileError, LIMITS, buildClaim, normalizeProfile, profileMessage, type ProfileFields, type ProfileKind, type PublicProfile } from '@/lib/profiles/claim'
import { profileNetwork, publishProfile } from '@/lib/profiles/client'
import { useWallet } from '@/lib/wallet/WalletContext'
import { formatAddress } from '@/lib/format'
import { cn } from '@/lib/utils'

type Step = 'form' | 'signing' | 'publishing' | 'done'

const FIELDS: { key: keyof ProfileFields; label: string; placeholder: string; accountOnly?: boolean; hint?: string }[] = [
  { key: 'name', label: 'Display name', placeholder: 'Alice', accountOnly: true, hint: `Up to ${LIMITS.name} characters. Names are not unique.` },
  { key: 'image', label: 'Image URL', placeholder: 'https://example.com/avatar.png', hint: 'https only: PNG, JPEG, GIF, WebP or AVIF, up to 2 MB. Served through QRDX’s image proxy.' },
  { key: 'website', label: 'Website', placeholder: 'example.com' },
  { key: 'x', label: 'X', placeholder: '@handle' },
  { key: 'telegram', label: 'Telegram', placeholder: '@username' },
  { key: 'discord', label: 'Discord', placeholder: 'discord.gg/invite' },
  { key: 'github', label: 'GitHub', placeholder: 'user or organisation' },
]

/**
 * Publish, edit or remove the public profile of an account (signed by the account)
 * or a token (signed by its creator). docs/PROFILES.md.
 */
export function ProfileEditor({
  open,
  onOpenChange,
  kind,
  subject,
  signer,
  label,
  current,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: ProfileKind
  /** The account, or the token address. */
  subject: string
  /** Who must sign: the account itself, or the token's creator. */
  signer: string
  /** "this address" / the token's symbol, for the copy. */
  label: string
  current: PublicProfile | null | undefined
}) {
  const w = useWallet()
  const network = profileNetwork()
  const [fields, setFields] = useState<ProfileFields>({})
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState<string | null>(null)
  const [showMessage, setShowMessage] = useState(false)
  const [removed, setRemoved] = useState(false)

  // Start from what is published each time the editor opens (not while it is open:
  // a publish updates `current` and must not wipe the confirmation).
  useEffect(() => {
    if (!open) return
    setFields(current?.profile ?? {})
    setStep('form')
    setError(null)
    setRemoved(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // What the wallet will be asked to sign, refreshed as the form changes.
  const preview = useMemo(() => {
    if (!network) return null
    try {
      return { claim: buildClaim({ network, kind, subject, signer, profile: fields }), error: null }
    } catch (e) {
      return { claim: null, error: e instanceof ProfileError ? e.message : 'Check the fields.' }
    }
  }, [network, kind, subject, signer, fields])

  const owner = w.owns(signer)
  const busy = step === 'signing' || step === 'publishing'

  const run = async (profile: ProfileFields | null) => {
    if (!network) return
    setError(null)
    try {
      const claim = buildClaim({ network, kind, subject, signer, profile })
      const message = profileMessage(claim)
      setStep('signing')
      const signed = await w.signMessage(signer, message)
      setStep('publishing')
      await publishProfile(network, kind, subject, { message, signature: signed.signature, publicKey: signed.publicKey })
      setRemoved(profile === null)
      setStep('done')
    } catch (e) {
      setStep('form')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const title = kind === 'account' ? (current ? 'Edit your profile' : 'Claim this address') : current ? `Edit ${label}` : `Claim ${label}`

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {kind === 'account'
            ? 'Publish a name, image and links for this address. Your wallet signs a message with the address’s key to prove it is yours. Nothing is sent on chain and it costs nothing.'
            : `As ${label}’s creator, publish its image, a description and links. QRDX Trade and the wallet show the image. Your wallet signs with the creator’s key; nothing is sent on chain.`}
        </DialogDescription>

        {!network ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Profiles exist on mainnet and testnet. Switch the explorer to one of them.</p>
        ) : step === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bid/15 text-bid">
              <Check className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium">{removed ? 'Profile removed.' : 'Profile published.'}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {removed ? 'The address shows without a profile again.' : 'It shows here now, and on QRDX Trade within a minute.'}
            </p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : w.status !== 'connected' ? (
          <div className="space-y-3">
            <p className="text-sm">
              Link the wallet that holds <span className="font-mono text-xs">{formatAddress(signer, 8, 6)}</span>.
            </p>
            <ConnectOptions />
          </div>
        ) : !owner ? (
          <div className="space-y-3">
            <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
              {kind === 'account' ? 'The linked wallet does not hold this address.' : `Only ${label}’s creator can set its profile.`} It needs{' '}
              <span className="break-all font-mono text-xs">{signer}</span>; the linked account is{' '}
              <span className="break-all font-mono text-xs">{w.account?.pqAddress}</span>.
            </div>
            <p className="text-xs text-muted-foreground">Switch to that account in QRDX Wallet, or unlink and link the wallet that holds it.</p>
            <Button variant="outline" size="sm" onClick={() => void w.disconnect()}>
              Unlink wallet
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              try {
                void run(normalizeProfile(kind, fields))
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            {FIELDS.filter((f) => kind === 'account' || !f.accountOnly).map((f) => (
              <div key={f.key} className={f.key === 'name' || f.key === 'image' ? '' : 'grid grid-cols-[6.5rem_1fr] items-center gap-2'}>
                <label htmlFor={`pf-${f.key}`} className="text-xs font-medium text-muted-foreground">
                  {f.label}
                </label>
                <div className={f.key === 'image' ? 'mt-1 flex items-center gap-2' : f.key === 'name' ? 'mt-1' : ''}>
                  {f.key === 'image' && <ImagePreview url={fields.image} />}
                  <Input
                    id={`pf-${f.key}`}
                    value={fields[f.key] ?? ''}
                    placeholder={f.placeholder}
                    disabled={busy}
                    autoComplete="off"
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                {f.hint && (f.key === 'name' || f.key === 'image') && <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
            <div>
              <label htmlFor="pf-description" className="text-xs font-medium text-muted-foreground">
                {kind === 'account' ? 'Bio' : 'Description'}
              </label>
              <Textarea
                id="pf-description"
                value={fields.description ?? ''}
                disabled={busy}
                maxLength={LIMITS.description + 20}
                rows={3}
                onChange={(e) => setFields((p) => ({ ...p, description: e.target.value }))}
                className="mt-1 text-sm"
              />
              <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                {[...(fields.description ?? '')].length}/{LIMITS.description}
              </p>
            </div>

            <button type="button" onClick={() => setShowMessage((s) => !s)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showMessage && 'rotate-180')} /> What your wallet will sign
            </button>
            {showMessage && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                {preview?.claim ? profileMessage(preview.claim) : preview?.error}
              </pre>
            )}

            {(error || (preview?.error && Object.values(fields).some(Boolean))) && <p className="rounded-md bg-ask/10 px-3 py-2 text-xs text-ask">{error ?? preview?.error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={busy || !preview?.claim} className="flex-1" data-testid="publish-profile">
                {step === 'signing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Approve in your wallet…
                  </>
                ) : step === 'publishing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" /> Sign and publish
                  </>
                )}
              </Button>
              {current && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void run(null)} title="Remove the profile">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Signed by <span className="font-mono">{formatAddress(signer, 8, 6)}</span>
              {/^0xPQ/i.test(signer) ? ' with its post-quantum key (ML-DSA-65)' : ''}. Anyone can check the signature at the profile service.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ImagePreview({ url }: { url?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'bad'>('idle')
  const valid = !!url && /^https:\/\/[^/\s]+\.[^/\s]+\/\S*/i.test(url)
  useEffect(() => setState('idle'), [url])
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted', state === 'bad' && 'border-ask/50')}>
      {valid && state !== 'bad' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onLoad={() => setState('ok')} onError={() => setState('bad')} />
      )}
    </span>
  )
}
