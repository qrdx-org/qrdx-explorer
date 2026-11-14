'use client'

import { useState } from 'react'
import { BadgeCheck, Github, Globe, MessageCircle, PenLine, Send, TriangleAlert, Twitter } from 'lucide-react'
import AddressAvatar from '@/components/AddressAvatar'
import { TokenMark } from '@/components/explorer/ui'
import { profileImage, useProfile } from '@/lib/profiles/client'
import { socialLinks, type ProfileFields, type PublicProfile } from '@/lib/profiles/claim'
import { impersonates, QRDX_LOGO, verifiedToken } from '@/lib/verified-tokens'
import { cn } from '@/lib/utils'

/** An account's image when its owner published one, else its identicon. */
export function ProfileAvatar({
  address,
  profile,
  size = 24,
  fallbackImage,
  className,
}: {
  address: string
  profile: PublicProfile | null | undefined
  size?: number
  /** A curated image (known addresses) used before the identicon. */
  fallbackImage?: string
  className?: string
}) {
  const src = profileImage(profile)
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(src)}
        className={cn('shrink-0 rounded-lg bg-muted object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return <AddressAvatar address={address} size={size} imageUrl={fallbackImage} className={className} />
}

/**
 * A token's image: its logo when QRDX verified it (or it is native QRDX), else the image
 * its creator published, else its lettered mark. Pass `address` for the verified lookup.
 */
export function TokenImage({
  symbol,
  profile,
  address,
  size = 36,
  className,
}: {
  symbol: string
  profile: PublicProfile | null | undefined
  /** The token's address, or "QRDX" for the native coin; omitted, only the creator's image is used. */
  address?: string | null
  size?: number
  className?: string
}) {
  const logo = address === 'QRDX' ? QRDX_LOGO : (verifiedToken(address)?.logo ?? null)
  const src = logo ?? profileImage(profile)
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(src)}
        className={cn('shrink-0 rounded-full bg-muted object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return <TokenMark symbol={symbol} size={size} className={className} />
}

/** The mark of a token QRDX verified; nothing for any other address. `label` adds the word. */
export function VerifiedMark({ address, label = false, className }: { address: string | null | undefined; label?: boolean; className?: string }) {
  const v = verifiedToken(address)
  if (!v) return null
  if (!label) {
    return (
      <span title={`Verified by QRDX. ${v.note}`} className={cn('inline-flex shrink-0 align-middle text-primary', className)}>
        <BadgeCheck className="h-3.5 w-3.5" aria-label="Verified token" />
      </span>
    )
  }
  return (
    <span
      title={v.note}
      className={cn('inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary', className)}
    >
      <BadgeCheck className="h-3 w-3" />
      Verified
    </span>
  )
}

/** Warns that a token uses a verified token's symbol or name without being it. */
export function ImpersonationPill({ token, className }: { token: { token_address: string; symbol: string; name: string }; className?: string }) {
  const v = impersonates(token)
  if (!v) return null
  return (
    <span
      title={`This is not the verified ${v.symbol} (${v.address}). Anyone can deploy a token under any name.`}
      className={cn('inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn', className)}
    >
      <TriangleAlert className="h-3 w-3" />
      Not the verified {v.symbol}
    </span>
  )
}

/** Marks text an owner published about themselves: signed by them, checked by no one. */
export function ClaimedPill({ kind, className }: { kind: 'account' | 'token'; className?: string }) {
  return (
    <span
      title={
        kind === 'account'
          ? 'The owner of this address published this profile, signed with its key. Names are not unique or checked.'
          : 'The token’s creator published this, signed with their key. It is not checked by QRDX.'
      }
      className={cn('inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary', className)}
    >
      <PenLine className="h-3 w-3" />
      {kind === 'account' ? 'Claimed by owner' : 'Set by creator'}
    </span>
  )
}

const ICONS = { website: Globe, x: Twitter, telegram: Send, github: Github, discord: MessageCircle }

export function ProfileLinks({ profile, className }: { profile: ProfileFields; className?: string }) {
  const links = socialLinks(profile)
  if (!links.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {links.map((l) => {
        const Icon = ICONS[l.kind]
        return (
          <a
            key={l.kind}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            {l.label}
          </a>
        )
      })}
    </div>
  )
}

/** TokenImage that looks up the token's profile itself, for lists. `address` null is native QRDX. */
export function TokenAvatar({ address, symbol, size = 32, className }: { address: string | null; symbol: string; size?: number; className?: string }) {
  const isToken = !!address && /^0x[0-9a-fA-F]{40}$/.test(address)
  // A verified token shows its logo, so its creator's image is never needed.
  const profile = useProfile('token', isToken && !verifiedToken(address) ? address : null)
  return <TokenImage symbol={symbol} profile={profile} address={isToken ? address : symbol === 'QRDX' ? 'QRDX' : null} size={size} className={className} />
}
